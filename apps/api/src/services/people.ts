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

/** Ce qu'une organisation montre d'elle sans qu'on ouvre sa fiche. */
export interface OrgRow {
  /** Qui la tient, la première personne en premier. */
  contacts: { id: string; name: string; email: string; phones: string[]; role: string }[];
  alumni: number;
  current: string[];
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
}

const OUT = new Set(['Not selected', 'Withdrawn']);

export async function peopleRows(): Promise<Map<string, PersonRow>> {
  return (await directoryRows()).people;
}

/** La même matière pour les organisations : qui les tient, et leurs programmes. */
export async function orgRows(): Promise<Map<string, OrgRow>> {
  return (await directoryRows()).orgs;
}

async function directoryRows(): Promise<{ people: Map<string, PersonRow>; orgs: Map<string, OrgRow> }> {
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
  }>(
    `select c.person_id as "personId", c.org_id as "orgId", c.edition_id as "editionId",
            c.status, e.status as "editionStatus", p.name as programme
       from candidates c
       join editions e on e.id = c.edition_id
       join programs p on p.id = e.program_id
      where c.deleted_at is null`,
  );

  const people = new Map<string, PersonRow>();
  const orgs = new Map<string, OrgRow>();
  const of = (id: string) => {
    const found = people.get(id) ?? { orgs: [], alumni: 0, current: [] };
    people.set(id, found);
    return found;
  };
  const org = (id: string) => {
    const found = orgs.get(id) ?? { contacts: [], alumni: 0, current: [] };
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
    }

    /* La société, elle, compte sa candidature une fois — qui l'a déposée ne
       change rien à ce qu'elle a fait. */
    if (c.orgId) {
      const row = org(c.orgId);
      if (c.editionStatus === 'Completed') row.alumni += 1;
      else if (c.editionStatus === 'Live' && !row.current.includes(c.programme)) row.current.push(c.programme);
    }
  }

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
