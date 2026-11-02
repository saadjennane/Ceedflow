/**
 * Le reporting d'une édition : le réglage, la collecte, et ce que CEED en lit.
 *
 * The cohort is the edition's selected startups. A moment is sent to them when
 * CEED launches it; each startup answers in its space, prefilled from its
 * sheet, and what it sends is frozen for that moment — the report does not move
 * when the sheet is corrected later. The linked answers go back to the sheet,
 * dated at the moment, through the same path every linked form uses.
 */
import {
  currentPeriod,
  editionReportingSchema,
  fillTemplate,
  firstNameOf,
  idOf,
  longDate,
  periodLabel,
  programReportingSchema,
  type EditionReporting,
  type FormField,
  type KpiMeasurePage,
  type KpiMoment,
  type ProgramReporting,
  type ReportingView,
} from '@ceed/shared';
import { all, one } from '../db/client.js';
import * as dir from '../db/directory.js';
import * as repo from '../db/repo.js';
import { HttpError } from '../routes/util.js';
import { prefillFromSheet, writeBackToSheet } from './formSheet.js';
import { kpiPeriodsByKey, kpisOf } from './kpis.js';
import { post } from './mail.js';
import { publicOrigin } from './platform.js';
import type { Changer } from '../db/attributes.js';

async function readSetup(scopeId: string): Promise<unknown> {
  return (await one<{ config: unknown }>('select config from reporting_setups where scope_id = $1', [scopeId]))?.config ?? {};
}
async function writeSetup(scopeId: string, config: unknown): Promise<void> {
  await all(
    `insert into reporting_setups (scope_id, config) values ($1, $2::text::jsonb)
     on conflict (scope_id) do update set config = excluded.config, updated_at = now()`,
    [scopeId, JSON.stringify(config)],
  );
}

export const programSetup = async (programId: string): Promise<ProgramReporting> =>
  programReportingSchema.parse(await readSetup(programId));

/**
 * Le réglage d'une édition. Une édition qu'on n'a jamais réglée part des
 * quatre moments habituels — sans dates : c'est à CEED de les poser.
 */
export async function editionSetup(editionId: string): Promise<EditionReporting> {
  const raw = (await readSetup(editionId)) as { moments?: unknown };
  const parsed = editionReportingSchema.parse(raw);
  if (raw.moments === undefined) {
    parsed.moments = ['Début du programme', 'Mi-parcours', 'Fin du programme', 'N+1'].map((name) => ({
      id: idOf.field().replace('fld_', 'mom_'), name, opensOn: null, closesOn: null, launchedAt: null,
    }));
  }
  return parsed;
}

export async function saveProgramSetup(programId: string, patch: unknown): Promise<ProgramReporting> {
  const next = programReportingSchema.parse({ ...(await programSetup(programId)), ...(patch as object) });
  await writeSetup(programId, next);
  return next;
}

export async function saveEditionSetup(editionId: string, patch: unknown): Promise<EditionReporting> {
  const current = await editionSetup(editionId);
  const next = editionReportingSchema.parse({ ...current, ...(patch as object) });
  /* Un moment déjà envoyé garde sa date d'envoi : le réglage ne la réécrit pas. */
  next.moments = next.moments.map((m) => ({ ...m, launchedAt: current.moments.find((c) => c.id === m.id)?.launchedAt ?? null }));
  await writeSetup(editionId, next);
  return next;
}

async function context(editionId: string) {
  const detail = await repo.getEditionDetail(editionId);
  if (!detail) throw new HttpError(404, 'Edition not found.');
  return detail;
}

/** La cohorte : les startups retenues de l'édition. */
async function cohortOf(editionId: string) {
  return (await repo.listCandidates(editionId)).filter((c) => c.status === 'Selected');
}

/** Les indicateurs d'une édition : ceux du programme, puis les siens. */
async function indicatorsOf(editionId: string, programId: string): Promise<FormField[]> {
  return [...(await programSetup(programId)).indicators, ...(await editionSetup(editionId)).indicators];
}

export async function reportingView(editionId: string): Promise<ReportingView> {
  const detail = await context(editionId);
  const setup = await editionSetup(editionId);
  const cohort = await cohortOf(editionId);
  const responses = await all<ReportingView['responses'][number]>(
    `select moment_id as "momentId", candidate_id as "candidateId", answers, submitted_at::text as "submittedAt",
            updated_at::text as "updatedAt"
       from kpi_responses where edition_id = $1`,
    [editionId],
  );
  return {
    programIndicators: (await programSetup(detail.program.id)).indicators,
    editionIndicators: setup.indicators,
    moments: setup.moments,
    messages: setup.messages,
    cohort: cohort.map((c) => ({ candidateId: c.id, orgId: c.orgId, orgName: c.orgName, contactName: c.contactName })),
    responses: responses.filter((r) => cohort.some((c) => c.id === r.candidateId)),
    teamIndicators: (await programSetup(detail.program.id)).teamIndicators,
    teamValues: await all<ReportingView['teamValues'][number]>(
      `select moment_id as "momentId", indicator_id as "indicatorId", value, by_name as "byName", updated_at::text as "updatedAt"
         from team_indicator_values where edition_id = $1`,
      [editionId],
    ),
  };
}

/** La période d'un KPI relié, au jour du moment : c'est là que la valeur s'écrit. */
async function fieldsAt(editionId: string, programId: string, moment: KpiMoment): Promise<FormField[]> {
  const day = moment.opensOn ?? new Date().toISOString().slice(0, 10);
  const kpis = await kpiPeriodsByKey();
  return (await indicatorsOf(editionId, programId)).map((f) => {
    if (!f.fromProfile?.startsWith('kpi:')) return f;
    const kind = kpis.get(f.fromProfile.slice(4));
    return kind ? { ...f, fromPeriod: currentPeriod(kind, day) } : f;
  });
}

/** Envoie un moment à la cohorte : chacune reçoit sa lettre, et la mesure apparaît dans son espace. */
export async function launchMoment(editionId: string, momentId: string, reminder = false): Promise<{ sent: number }> {
  const detail = await context(editionId);
  const setup = await editionSetup(editionId);
  const moment = setup.moments.find((m) => m.id === momentId);
  if (!moment) throw new HttpError(404, 'No such moment.');
  if (!reminder && !moment.closesOn) {
    throw new HttpError(422, 'Give this moment its deadline first.', { closesOn: 'A deadline is needed.' });
  }
  const origin = await publicOrigin();
  const answered = new Set(
    (await all<{ candidateId: string }>(
      `select candidate_id as "candidateId" from kpi_responses where moment_id = $1 and submitted_at is not null`,
      [momentId],
    )).map((r) => r.candidateId),
  );
  let sent = 0;
  for (const c of await cohortOf(editionId)) {
    if (reminder && answered.has(c.id)) continue;
    const to = c.email?.trim();
    if (!to) continue;
    const values = {
      prenom: firstNameOf(c.contactName, ''),
      startup: c.orgName,
      programme: `${detail.program.name} — ${detail.name}`,
      moment: moment.name,
      date_limite: moment.closesOn ? longDate(moment.closesOn) : '',
      lien: origin ? `${origin}/kpi/${momentId}/${c.id}` : '',
    };
    const posted = await post({
      kind: reminder ? 'kpi_remind' : 'kpi_open',
      to,
      toName: c.contactName,
      recordId: c.personId,
      candidateId: c.id,
      subject: fillTemplate(reminder ? setup.messages.remindSubject : setup.messages.openSubject, values),
      body: fillTemplate(reminder ? setup.messages.remind : setup.messages.open, values),
    });
    if (posted) sent += 1;
  }
  if (!reminder && !moment.launchedAt) {
    await writeSetup(editionId, {
      ...setup,
      moments: setup.moments.map((m) => (m.id === momentId ? { ...m, launchedAt: new Date().toISOString() } : m)),
    });
  }
  return { sent };
}

/** Une valeur que CEED saisit pour un moment — `null` l'efface. */
export async function putTeamValue(editionId: string, momentId: string, indicatorId: string, value: unknown, byName: string): Promise<ReportingView> {
  const detail = await context(editionId);
  const setup = await editionSetup(editionId);
  if (!setup.moments.some((m) => m.id === momentId)) throw new HttpError(404, 'No such moment.');
  if (!(await programSetup(detail.program.id)).teamIndicators.some((f) => f.id === indicatorId)) throw new HttpError(404, 'No such indicator.');
  if (value === null || value === undefined || value === '') {
    await all('delete from team_indicator_values where edition_id = $1 and moment_id = $2 and indicator_id = $3', [editionId, momentId, indicatorId]);
  } else {
    await all(
      `insert into team_indicator_values (edition_id, moment_id, indicator_id, value, by_name) values ($1,$2,$3,$4::text::jsonb,$5)
       on conflict (edition_id, moment_id, indicator_id) do update set value = excluded.value, by_name = excluded.by_name, updated_at = now()`,
      [editionId, momentId, indicatorId, JSON.stringify(value), byName],
    );
  }
  return reportingView(editionId);
}

/* ------------------------------------------------------------------ */
/* The startup's side                                                  */
/* ------------------------------------------------------------------ */

/** La mesure d'une startup, si la personne en est. */
async function measureContext(recordId: string, momentId: string, candidateId: string) {
  const candidate = await repo.getCandidate(candidateId);
  if (!candidate || candidate.status !== 'Selected') return null;
  const theirs = candidate.personId === recordId || (await dir.orgIdsOf(recordId)).has(candidate.orgId);
  if (!theirs) return null;
  const detail = await repo.getEditionDetail(candidate.editionId);
  if (!detail) return null;
  const setup = await editionSetup(candidate.editionId);
  const moment = setup.moments.find((m) => m.id === momentId);
  if (!moment?.launchedAt) return null;
  return { candidate, detail, moment };
}

/** Ce que la fiche sait déjà, et de quand : « 8, au 3 janv. 2026 ». */
async function sheetAsOf(orgId: string, fields: FormField[]): Promise<{ values: Record<string, unknown>; asOf: Record<string, string> }> {
  const values = await prefillFromSheet(orgId, fields);
  const asOf: Record<string, string> = {};
  const linked = fields.filter((f) => f.fromProfile);
  if (!linked.length) return { values, asOf };
  const kpis = linked.some((f) => f.fromProfile!.startsWith('kpi:')) ? await kpisOf(orgId, false) : [];
  for (const f of linked) {
    const key = f.fromProfile!;
    if (key.startsWith('kpi:')) {
      const kpi = kpis.find((k) => k.key === key.slice(4));
      const exact = kpi?.points.find((p) => p.period === f.fromPeriod);
      /* Rien pour la période du moment : la dernière valeur connue, pour qu'on confirme ou corrige. */
      const known = exact ?? kpi?.points.at(-1);
      if (known && values[f.id] === undefined) values[f.id] = known.value;
      if (known) asOf[f.id] = periodLabel(known.period, 'fr');
    } else if (values[f.id] !== undefined) {
      const last = await one<{ at: string }>(
        `select created_at::text as at from org_history where org_id = $1 and field = $2 order by created_at desc limit 1`,
        [orgId, key],
      );
      if (last) asOf[f.id] = longDate(last.at.slice(0, 10));
    }
  }
  return { values, asOf };
}

export async function measureFor(recordId: string, momentId: string, candidateId: string): Promise<KpiMeasurePage | null> {
  const found = await measureContext(recordId, momentId, candidateId);
  if (!found) return null;
  const { candidate, detail, moment } = found;
  const fields = await fieldsAt(candidate.editionId, detail.program.id, moment);
  const saved = await one<{ answers: Record<string, unknown>; submittedAt: string | null }>(
    `select answers, submitted_at::text as "submittedAt" from kpi_responses where moment_id = $1 and candidate_id = $2`,
    [momentId, candidateId],
  );
  const sheet = saved?.submittedAt ? { values: {}, asOf: {} } : await sheetAsOf(candidate.orgId, fields);
  return {
    momentId,
    candidateId,
    momentName: moment.name,
    programName: detail.program.name,
    editionName: detail.name,
    orgName: candidate.orgName,
    closesOn: moment.closesOn,
    fields,
    answers: { ...sheet.values, ...(saved?.answers ?? {}) },
    asOf: sheet.asOf,
    submittedAt: saved?.submittedAt ?? null,
  };
}

const blank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

/**
 * Garde les réponses — brouillon, ou envoi. Envoyées, elles sont figées pour
 * ce moment et les reliées vont à la fiche. Une mesure envoyée se corrige
 * encore : un nouvel envoi la remplace, et la fiche suit.
 */
export async function saveMeasure(
  recordId: string,
  momentId: string,
  candidateId: string,
  answers: Record<string, unknown>,
  submit: boolean,
): Promise<KpiMeasurePage> {
  const found = await measureContext(recordId, momentId, candidateId);
  if (!found) throw new HttpError(404, 'Nothing is being asked of you there.');
  const { candidate, detail, moment } = found;
  const fields = await fieldsAt(candidate.editionId, detail.program.id, moment);
  const kept = Object.fromEntries(Object.entries(answers).filter(([k]) => fields.some((f) => f.id === k)));
  if (submit) {
    const missing = fields.filter((f) => f.required && blank(kept[f.id]));
    if (missing.length) {
      throw new HttpError(422, 'Some answers are missing.', Object.fromEntries(missing.map((f) => [`answers.${f.id}`, 'This answer is required.'])));
    }
  }
  const who = await dir.getRecord(recordId);
  await all(
    `insert into kpi_responses (moment_id, edition_id, candidate_id, answers, submitted_at, submitted_by)
     values ($1,$2,$3,$4::text::jsonb, case when $5 then now() else null end, $6)
     on conflict (moment_id, candidate_id) do update
       set answers = excluded.answers, updated_at = now(),
           submitted_at = case when $5 then now() else kpi_responses.submitted_at end,
           submitted_by = case when $5 then excluded.submitted_by else kpi_responses.submitted_by end`,
    [momentId, candidate.editionId, candidateId, JSON.stringify(kept), submit, who?.name ?? ''],
  );
  if (submit) {
    await repo.claimUploads(candidateId, kept, recordId);
    const by: Changer = { kind: 'member', id: recordId, name: who?.name ?? '', sourceLabel: `Reporting — ${moment.name}` };
    try {
      await writeBackToSheet(candidate.orgId, fields, kept, by);
    } catch {
      /* La fiche qui refuse une valeur ne défait pas la mesure. */
    }
  }
  return (await measureFor(recordId, momentId, candidateId))!;
}

/** Les mesures envoyées et pas encore rendues, pour « À faire ». */
export async function measuresDueFor(candidateId: string): Promise<{ moment: KpiMoment; started: boolean }[]> {
  const candidate = await repo.getCandidate(candidateId);
  if (!candidate || candidate.status !== 'Selected') return [];
  const setup = await editionSetup(candidate.editionId);
  const rows = await all<{ momentId: string; submittedAt: string | null }>(
    `select moment_id as "momentId", submitted_at::text as "submittedAt" from kpi_responses where candidate_id = $1`,
    [candidateId],
  );
  return setup.moments
    .filter((m) => m.launchedAt && !rows.some((r) => r.momentId === m.id && r.submittedAt))
    .map((m) => ({ moment: m, started: rows.some((r) => r.momentId === m.id) }));
}
