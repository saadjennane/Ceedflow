/**
 * Un programme proposé aux autres centres du réseau.
 *
 * The organising centre offers; each receiving centre decides, on its own and
 * for itself alone. Nothing here can put a programme in another centre's
 * catalogue: an offer is `pending` until that centre accepts it, and it can
 * take it down again whenever it likes. The programme itself is never copied —
 * one programme, one set of candidacies, run by the centre that owns it.
 */
import { all, one } from '../db/client.js';
import { HttpError } from '../routes/util.js';
import { listCenters } from './centers.js';
import { notify, teamOfCenter } from './notifications.js';

export type Visibility = 'center' | 'selected' | 'all';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface DistributionView {
  visibility: Visibility;
  targets: { centerId: string; name: string; status: OfferStatus; decidedAt: string | null }[];
}

export async function distributionOf(programId: string): Promise<DistributionView | null> {
  const program = await one<{ visibility: Visibility }>('select visibility from programs where id = $1 and deleted_at is null', [programId]);
  if (!program) return null;
  const targets = await all<DistributionView['targets'][number]>(
    `select d.center_id as "centerId", c.name, d.status, d.decided_at::text as "decidedAt"
       from program_distributions d join centers c on c.id = d.center_id
      where d.program_id = $1 order by c.name`,
    [programId],
  );
  return { visibility: program.visibility, targets };
}

/**
 * Ce que le centre organisateur propose, et à qui. Une nouvelle destination
 * part « en attente » ; une destination retirée de la liste n'est plus
 * proposée — là où elle était acceptée, le programme quitte ce catalogue. Une
 * réponse déjà donnée par un centre reste la sienne : reproposer à qui a
 * refusé ne le fait pas changer d'avis à sa place.
 */
export async function setDistribution(
  programId: string,
  input: { visibility: Visibility; centerIds?: string[] },
  by: string,
): Promise<DistributionView> {
  const program = await one<{ centerId: string }>('select center_id as "centerId" from programs where id = $1 and deleted_at is null', [programId]);
  if (!program) throw new HttpError(404, 'Programme not found.');
  const others = (await listCenters()).filter((c) => c.id !== program.centerId);
  let targets: string[] = [];
  if (input.visibility === 'all') targets = others.filter((c) => c.status === 'active').map((c) => c.id);
  if (input.visibility === 'selected') {
    const known = new Set(others.map((c) => c.id));
    targets = [...new Set(input.centerIds ?? [])].filter((id) => known.has(id));
    if (!targets.length) throw new HttpError(422, 'Choose at least one centre.', { centerIds: 'Choose at least one centre.' });
  }
  await all('update programs set visibility = $2 where id = $1', [programId, input.visibility]);
  await all(
    `delete from program_distributions where program_id = $1 and not (center_id = any($2::text[]))`,
    [programId, targets],
  );
  const name = (await one<{ name: string }>('select name from programs where id = $1', [programId]))?.name ?? 'A programme';
  const from = (await one<{ name: string }>('select name from centers where id = $1', [program.centerId]))?.name ?? 'Another centre';
  for (const centerId of targets) {
    const fresh = await all<{ center_id: string }>(
      `insert into program_distributions (program_id, center_id, status, proposed_by) values ($1, $2, 'pending', $3)
       on conflict (program_id, center_id) do nothing returning center_id`,
      [programId, centerId, by],
    );
    if (fresh.length) {
      await notify({
        recordIds: await teamOfCenter(centerId, ['admin']),
        kind: 'offer_received',
        title: `${from} proposes ${name}`,
        body: 'Publish it in your catalogue, or decline.',
        href: '/offers',
        actorName: from,
        centerId,
        dedupeKey: `offer:${programId}:${centerId}:${Date.now()}`,
      });
    }
  }
  return (await distributionOf(programId))!;
}

/** Un centre qui rejoint le réseau reçoit les programmes proposés à tous. */
export async function offerOpenProgramsTo(centerId: string): Promise<void> {
  await all(
    `insert into program_distributions (program_id, center_id, status)
     select id, $1, 'pending' from programs
      where visibility = 'all' and deleted_at is null and center_id <> $1
     on conflict (program_id, center_id) do nothing`,
    [centerId],
  );
}

export interface Offer {
  programId: string;
  name: string;
  summary: string;
  type: string;
  partner: string;
  colour: string;
  fromCenterId: string;
  fromCenter: string;
  status: OfferStatus;
  proposedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  editions: { id: string; name: string; status: string; startsOn: string | null; endsOn: string | null; city: string }[];
}

const OFFER_COLS = `
  select p.id as "programId", p.name, p.summary, p.type, p.partner, p.colour,
         p.center_id as "fromCenterId", c.name as "fromCenter",
         d.status, d.proposed_at::text as "proposedAt", d.decided_at::text as "decidedAt", d.decided_by as "decidedBy",
         coalesce((select json_agg(json_build_object('id', e.id, 'name', e.name, 'status', e.status,
                     'startsOn', e.starts_on::text, 'endsOn', e.ends_on::text, 'city', e.city) order by e.position, e.created_at)
                     from editions e where e.program_id = p.id and e.deleted_at is null and e.status <> 'Draft'), '[]'::json) as editions
    from program_distributions d
    join programs p on p.id = d.program_id and p.deleted_at is null
    join centers c on c.id = p.center_id`;

/** Ce que le réseau propose à un centre, ce qui attend d'abord. */
export const offersFor = (centerId: string) =>
  all<Offer>(
    `${OFFER_COLS} where d.center_id = $1
      order by case d.status when 'pending' then 0 when 'accepted' then 1 else 2 end, d.proposed_at desc`,
    [centerId],
  );

export const offer = (programId: string, centerId: string) =>
  one<Offer>(`${OFFER_COLS} where d.program_id = $1 and d.center_id = $2`, [programId, centerId]);

export async function pendingOffers(centerId: string): Promise<number> {
  const row = await one<{ n: number }>(
    `select count(*)::int as n from program_distributions d join programs p on p.id = d.program_id and p.deleted_at is null
      where d.center_id = $1 and d.status = 'pending'`,
    [centerId],
  );
  return row?.n ?? 0;
}

/**
 * La décision d'un centre destinataire : accepter, refuser, ou retirer de son
 * catalogue ce qu'il avait accepté. Il peut toujours revenir sur un refus ou
 * un retrait. Rien de cela ne touche au programme, ni aux candidatures.
 */
export async function decide(programId: string, centerId: string, decision: 'accepted' | 'rejected' | 'withdrawn', by: string): Promise<Offer> {
  const now = await offer(programId, centerId);
  if (!now) throw new HttpError(404, 'This programme was not proposed to your centre.');
  const allowed: Record<OfferStatus, OfferStatus[]> = {
    pending: ['accepted', 'rejected'],
    accepted: ['withdrawn'],
    rejected: ['accepted'],
    withdrawn: ['accepted'],
  };
  if (!allowed[now.status].includes(decision)) {
    throw new HttpError(422, `It is ${now.status} — that cannot become ${decision}.`);
  }
  await all(
    `update program_distributions set status = $3, decided_at = now(), decided_by = $4 where program_id = $1 and center_id = $2`,
    [programId, centerId, decision, by],
  );
  const to = (await one<{ name: string }>('select name from centers where id = $1', [centerId]))?.name ?? 'A centre';
  const said = { accepted: 'published', rejected: 'declined', withdrawn: 'took down' }[decision];
  await notify({
    recordIds: await teamOfCenter(now.fromCenterId, ['admin']),
    kind: 'offer_answered',
    title: `${to} ${said} ${now.name}`,
    href: `/programs/${programId}`,
    actorName: to,
    centerId: now.fromCenterId,
  });
  return (await offer(programId, centerId))!;
}

/** Les centres d'une personne : les siens, et ceux de ses organisations. */
export async function centersOfMember(recordIds: string[]): Promise<Set<string>> {
  if (!recordIds.length) return new Set();
  const rows = await all<{ centerId: string }>(
    'select distinct center_id as "centerId" from center_members where record_id = any($1::text[])',
    [recordIds],
  );
  return new Set(rows.map((r) => r.centerId));
}

/** Les programmes acceptés par ces centres. */
export async function acceptedIn(centerIds: string[]): Promise<Set<string>> {
  if (!centerIds.length) return new Set();
  const rows = await all<{ programId: string }>(
    `select distinct program_id as "programId" from program_distributions where status = 'accepted' and center_id = any($1::text[])`,
    [centerIds],
  );
  return new Set(rows.map((r) => r.programId));
}
