/**
 * Ce qu'on sait d'une personne sans ouvrir sa fiche.
 *
 * La liste des individus servait à retrouver quelqu'un ; elle sert aussi à
 * répondre à des questions qu'on se pose en la parcourant — chez qui
 * travaille-t-il, combien de programmes a-t-il faits, est-il dans celui qui
 * tourne, qui l'a ajouté. Chacune demandait d'ouvrir la fiche, et une
 * question qui coûte un clic par ligne est une question qu'on ne pose pas.
 *
 * Trois requêtes pour toute la page, pas trois par ligne : quatre cents
 * personnes font quatre cents allers-retours, et la page ne s'affiche plus.
 */
import { all } from '../db/client.js';

/** Là où quelqu'un travaille, tel que l'annuaire le sait. */
export interface Attached {
  id: string;
  name: string;
  /** Ce qu'il y fait — le rôle du lien, et non la fonction de la fiche. */
  role: string;
}

/** Un programme d'une ligne, en pastille : en cours, terminé, ou candidature. */
export interface ProgrammeMark {
  name: string;
  colour: string;
  state: 'now' | 'alumni' | 'applied';
}

/** Ce qu'une organisation montre d'elle sans qu'on ouvre sa fiche. */
export interface OrgRow {
  /** Qui la tient, la première personne en premier. */
  contacts: { id: string; name: string; email: string; phones: string[]; role: string }[];
  alumni: number;
  current: string[];
  programmes: ProgrammeMark[];
  /** Le dernier changement sur sa fiche. */
  lastActivity: string | null;
}

export interface PersonRow {
  /** Les organisations qu'il tient, la première en premier. */
  orgs: Attached[];
  /**
   * Les programmes finis où il était encore en lice à la clôture.
   *
   * « Dont il a bénéficié » : une édition terminée, et une candidature qui
   * n'a été ni refusée ni retirée. On ne sait pas mieux que ça, et le dire
   * autrement serait inventer un diplôme.
   */
  alumni: number;
  /** Les programmes en cours où il est encore en lice, par leur nom. */
  current: string[];
  programmes: ProgrammeMark[];
  /** Ce qu'il a fait pour CEED : séances de mentorat tenues, évaluations rendues, séances de jury. */
  sessions: number;
  evaluations: number;
  panels: number;
}

const OUT = new Set(['Not selected', 'Withdrawn']);

/** Une pastille par programme : en cours si retenue, terminé, sinon candidature. */
function mark(list: ProgrammeMark[], c: { programme: string; colour: string | null; status: string; editionStatus: string }) {
  const state: ProgrammeMark['state'] =
    c.editionStatus === 'Completed' ? 'alumni' : c.status === 'Selected' ? 'now' : 'applied';
  const at = list.findIndex((m) => m.name === c.programme);
  const rank = { now: 0, alumni: 1, applied: 2 } as const;
  if (at === -1) list.push({ name: c.programme, colour: c.colour ?? '#2F5BFF', state });
  else if (rank[state] < rank[list[at]!.state]) list[at] = { ...list[at]!, state };
}

export async function directoryRows(): Promise<{ people: Map<string, PersonRow>; orgs: Map<string, OrgRow> }> {
  const links = await all<{
    personId: string; orgId: string; name: string; role: string;
    person: string; email: string; phones: string[];
  }>(
    `select a.person_id as "personId", a.org_id as "orgId", o.name, a.role,
            p.name as person, p.email, p.phones
       from affiliations a
       join records o on o.id = a.org_id
       join records p on p.id = a.person_id
      where o.deleted_at is null and p.deleted_at is null
      order by a.since nulls last, o.name`,
  );
  const candidacies = await all<{
    personId: string | null;
    orgId: string | null;
    editionId: string;
    status: string;
    editionStatus: string;
    programme: string;
    colour: string | null;
  }>(
    `select c.person_id as "personId", c.org_id as "orgId", c.edition_id as "editionId",
            c.status, e.status as "editionStatus", p.name as programme, p.colour
       from candidates c
       join editions e on e.id = c.edition_id
       join programs p on p.id = e.program_id
      where c.deleted_at is null`,
  );

  const people = new Map<string, PersonRow>();
  const orgs = new Map<string, OrgRow>();
  const of = (id: string) => {
    const found = people.get(id) ?? { orgs: [], alumni: 0, current: [], programmes: [], sessions: 0, evaluations: 0, panels: 0 };
    people.set(id, found);
    return found;
  };
  const org = (id: string) => {
    const found = orgs.get(id) ?? { contacts: [], alumni: 0, current: [], programmes: [], lastActivity: null };
    orgs.set(id, found);
    return found;
  };

  /* Les organisations d'abord : elles servent aussi à rattacher les
     candidatures déposées au nom de la société par quelqu'un d'autre. */
  const byOrg = new Map<string, string[]>();
  for (const link of links) {
    of(link.personId).orgs.push({ id: link.orgId, name: link.name, role: link.role });
    org(link.orgId).contacts.push({
      id: link.personId, name: link.person, email: link.email, phones: link.phones ?? [], role: link.role,
    });
    byOrg.set(link.orgId, [...(byOrg.get(link.orgId) ?? []), link.personId]);
  }

  /* Une candidature compte pour la personne qui l'a déposée et pour celles qui
     tiennent la page de la société : une associée qui n'a pas rempli le
     formulaire a fait le programme quand même. */
  const seen = new Map<string, Set<string>>();
  for (const c of candidacies) {
    if (OUT.has(c.status)) continue;
    const people = new Set<string>([
      ...(c.personId ? [c.personId] : []),
      ...(c.orgId ? (byOrg.get(c.orgId) ?? []) : []),
    ]);
    for (const person of people) {
      const already = seen.get(person) ?? new Set<string>();
      if (already.has(c.editionId)) continue;
      already.add(c.editionId);
      seen.set(person, already);
      const row = of(person);
      if (c.editionStatus === 'Completed') row.alumni += 1;
      else if (c.editionStatus === 'Live' && !row.current.includes(c.programme)) row.current.push(c.programme);
      mark(row.programmes, c);
    }

    /* La société, elle, compte sa candidature une fois — qui l'a déposée ne
       change rien à ce qu'elle a fait. */
    if (c.orgId) {
      const row = org(c.orgId);
      if (c.editionStatus === 'Completed') row.alumni += 1;
      else if (c.editionStatus === 'Live' && !row.current.includes(c.programme)) row.current.push(c.programme);
      mark(row.programmes, c);
    }
  }

  /* Ce qu'une personne a fait pour CEED, compté en deux requêtes pour toute la page. */
  const mentoring = await all<{ personId: string; n: number }>(
    `select p.person_id as "personId", count(*)::int as n from (
       select unnest(case when jsonb_array_length(with_ids) > 0
                          then array(select jsonb_array_elements_text(with_ids))
                          else array[person_id] end) as person_id
         from one_to_one_meetings where status = 'held') p
      where p.person_id is not null group by p.person_id`,
  );
  for (const m of mentoring) of(m.personId).sessions = m.n;
  const juries = await all<{ personId: string; evaluations: number; panels: number }>(
    `select evaluator_id as "personId", count(*) filter (where submitted_at is not null)::int as evaluations,
            count(distinct coalesce(session_id, block_id))::int as panels
       from evaluation_scores group by evaluator_id`,
  );
  for (const j of juries) {
    const row = of(j.personId);
    row.evaluations = j.evaluations;
    row.panels = j.panels;
  }
  /* La dernière fois que la fiche d'une organisation a bougé. */
  const touched = await all<{ orgId: string; at: string }>(
    'select org_id as "orgId", max(created_at)::text as at from org_history group by org_id',
  );
  for (const t of touched) org(t.orgId).lastActivity = t.at;

  return { people, orgs };
}

/* ------------------------------------------------------------------ */
/* L'équipe d'un programme                                             */
/* ------------------------------------------------------------------ */

/** Un groupe de l'équipe, tel qu'un sélecteur l'affiche. */
export interface TeamGroup {
  key: 'ceed' | 'mentors' | 'jury' | 'startups';
  label: string;
  people: { id: string; name: string; kind: 'person' | 'org' }[];
}

/**
 * Qui travaille sur cette édition, en quatre groupes.
 *
 * Les quatre viennent d'endroits différents et c'est pour ça qu'ils méritent
 * un service : l'équipe CEED de ses comptes, les jurés des séances, les
 * mentors du banc de l'édition et de ce qui est attribué, les startups de
 * leurs candidatures. Qui veut confier une tâche à « l'équipe du programme »
 * les demande ici plutôt que de les rassembler à sa façon.
 *
 * Une startup est rendue comme son organisation, pas comme sa fondatrice :
 * une tâche adressée à la société est vue par tous ceux qui tiennent sa page,
 * et c'est presque toujours ce qu'on veut.
 */
export async function teamOf(editionId: string): Promise<TeamGroup[]> {
  const ceed = await all<{ id: string; name: string }>(
    `select r.id, r.name from accounts a join records r on r.id = a.record_id
      where a.staff_role is not null and a.staff_role <> '' and a.disabled_at is null and r.deleted_at is null
      order by r.name`,
  );
  const jury = await all<{ id: string; name: string }>(
    `select distinct r.id, r.name
       from committee_sessions s
       join blocks b on b.id = s.block_id
       join phases ph on ph.id = b.phase_id
       join tracks t on t.id = ph.track_id
       join records r on r.id in (select jsonb_array_elements_text(s.jury))
      where t.edition_id = $1 and r.deleted_at is null
      order by r.name`,
    [editionId],
  );
  const mentors = await all<{ id: string; name: string }>(
    `select distinct r.id, r.name
       from records r
       left join editions e on e.id = $1
       left join candidates c on c.edition_id = $1 and c.mentor_id = r.id and c.deleted_at is null
      where r.deleted_at is null
        and (c.id is not null or e.mentors @> to_jsonb(r.id))
      order by r.name`,
    [editionId],
  );
  const startups = await all<{ id: string; name: string }>(
    `select distinct o.id, o.name
       from candidates c join records o on o.id = c.org_id
      where c.edition_id = $1 and c.deleted_at is null and o.deleted_at is null
        and c.status not in ('Not selected', 'Withdrawn')
      order by o.name`,
    [editionId],
  );

  return [
    { key: 'ceed', label: 'CEED team', people: ceed.map((p) => ({ ...p, kind: 'person' as const })) },
    { key: 'mentors', label: 'Mentors', people: mentors.map((p) => ({ ...p, kind: 'person' as const })) },
    { key: 'jury', label: 'Jury', people: jury.map((p) => ({ ...p, kind: 'person' as const })) },
    { key: 'startups', label: 'Startups', people: startups.map((p) => ({ ...p, kind: 'org' as const })) },
  ];
}

/* ------------------------------------------------------------------ */
/* L'adresse à laquelle on atteint une fiche                           */
/* ------------------------------------------------------------------ */

/** Où une lettre arrive, et par qui quand ce n'est pas l'adresse de la fiche. */
export interface Reach {
  email: string;
  /** Le nom à qui la lettre est adressée — jamais « Bonjour Rafid Tech ». */
  toName: string;
  /** La personne dont on emprunte l'adresse, quand on en emprunte une. */
  viaId: string | null;
  viaName: string;
}

/**
 * L'adresse d'une société : la sienne, sinon celle de qui tient sa page.
 *
 * Une startup venue d'une candidature n'a presque jamais d'adresse à elle —
 * 427 sur 440 ici. L'adresse saisie dans le formulaire est celle du contact,
 * et c'est sur sa fiche qu'elle est rangée, liée à la société. Ne regarder que
 * l'adresse propre, c'est déclarer injoignable toute une promotion dont on a
 * pourtant l'adresse de chacun.
 *
 * Une seule requête pour toute une liste : une audience en compte des
 * centaines, et une requête par ligne est une page qui ne s'affiche plus.
 *
 * Qui tient la page d'abord, puis le plus ancien lien, puis l'alphabet — le
 * même ordre que l'équipe affichée sur la page de la société, pour que « la
 * première personne » désigne la même partout.
 */
export async function reachFor(
  records: { id: string; kind: 'person' | 'org'; name: string; email: string }[],
): Promise<Map<string, Reach>> {
  const out = new Map<string, Reach>();
  const orphans: string[] = [];

  for (const record of records) {
    const own = (record.email ?? '').trim();
    if (own) out.set(record.id, { email: own, toName: record.name, viaId: null, viaName: '' });
    else if (record.kind === 'org') orphans.push(record.id);
    else out.set(record.id, { email: '', toName: record.name, viaId: null, viaName: '' });
  }
  if (!orphans.length) return out;

  const held = await all<{ orgId: string; personId: string; name: string; email: string }>(
    `select a.org_id as "orgId", r.id as "personId", r.name, r.email
       from affiliations a
       join records r on r.id = a.person_id and r.deleted_at is null
      where a.org_id = any($1::text[]) and coalesce(r.email, '') <> ''
      order by case a.access when 'admin' then 0 when 'editor' then 1 else 2 end,
               a.since nulls last, r.name`,
    [orphans],
  );

  const first = new Map<string, { personId: string; name: string; email: string }>();
  for (const row of held) if (!first.has(row.orgId)) first.set(row.orgId, row);

  for (const id of orphans) {
    const found = first.get(id);
    const record = records.find((r) => r.id === id)!;
    out.set(id, {
      email: found?.email ?? '',
      /* Le nom de la personne, pas celui de la société : la lettre arrive dans
         sa boîte, et « Bonjour Rafid Tech » n'est adressé à personne. */
      toName: found?.name ?? record.name,
      viaId: found?.personId ?? null,
      viaName: found?.name ?? '',
    });
  }
  return out;
}
