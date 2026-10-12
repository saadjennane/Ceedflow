/**
 * Donner une tâche.
 *
 * Quatre champs, nommés par ce qu'ils sont : Task, Description, Owner, Link.
 * Les intitulés en phrase — « what has to be done », « who does it » — se
 * lisent bien une fois et se cherchent ensuite, parce qu'on ne retient pas une
 * question comme on retient un mot.
 *
 * Le lien se choisit, il ne se subit plus : la fenêtre s'ouvre parfois depuis
 * une fiche ou un programme et le pré-remplit, mais depuis la page des tâches
 * il n'y avait aucun moyen de dire de quoi on parlait.
 *
 * Plusieurs destinataires créent plusieurs tâches, et c'est dit sous le champ :
 * sinon « fait » serait un mot sans sujet.
 */
import { type DirectoryRecord, type ProgramWithEditions } from '@ceed/shared';
import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { PeoplePicker } from '../pages/directory/PeoplePicker';
import { TextField } from './Field';
import { Icon } from './Icon';
import { Modal, useToast } from './Overlays';

export interface TaskAttach {
  recordId?: string | null;
  editionId?: string | null;
  blockId?: string | null;
  candidateId?: string | null;
  /** Ce que la fenêtre dit de l'attache, quand elle en a une. */
  about?: string;
  /**
   * À qui, déjà coché.
   *
   * Sur la page de quelqu'un, « donner une tâche » veut dire la lui donner.
   * Le lien dit de quoi il s'agit, il ne dit pas qui s'en occupe — et sans ce
   * pré-cochage il fallait retrouver dans l'annuaire la personne dont on avait
   * la fiche sous les yeux.
   */
  owner?: { id: string; kind: 'person' | 'org' };
}

/** L'équipe d'une édition, telle que le serveur la groupe. */
interface TeamGroup {
  key: string;
  label: string;
  people: { id: string; name: string; kind: 'person' | 'org' }[];
}

/** Ce à quoi une tâche peut se rapporter. Une seule chose à la fois. */
type LinkKind = '' | 'person' | 'org' | 'edition' | 'candidate';

const LINK_KINDS: { value: LinkKind; label: string }[] = [
  { value: '', label: 'Nothing' },
  { value: 'person', label: 'An individual' },
  { value: 'org', label: 'An organisation' },
  { value: 'edition', label: 'A programme' },
  { value: 'candidate', label: 'A startup in a programme' },
];

export function TaskModal({
  attach,
  onClose,
  onSaved,
}: {
  attach?: TaskAttach;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({ title: '', detail: '', dueOn: '' });
  const [people, setPeople] = useState<string[]>(
    attach?.owner?.kind === 'person' ? [attach.owner.id] : [],
  );
  const [orgs, setOrgs] = useState<string[]>(attach?.owner?.kind === 'org' ? [attach.owner.id] : []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tell, setTell] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  /* Le lien, tel que l'endroit d'où l'on vient l'a déjà rempli. Le genre se
     déduit de ce qui est posé, et `owner` tranche entre personne et société
     dans le seul cas où une fiche arrive ici — sa propre page. */
  const [link, setLink] = useState<{
    kind: LinkKind;
    recordId: string;
    editionId: string;
    candidateId: string;
  }>(() => ({
    kind: attach?.candidateId
      ? 'candidate'
      : attach?.editionId
        ? 'edition'
        : attach?.recordId
          ? attach.owner?.id === attach.recordId
            ? attach.owner.kind
            : 'person'
          : '',
    recordId: attach?.recordId ?? '',
    editionId: attach?.editionId ?? '',
    candidateId: attach?.candidateId ?? '',
  }));

  /* Les sociétés aussi peuvent porter une tâche : « Rafid Tech doit envoyer
     son RIB » n'est à personne en particulier, et tous ceux qui tiennent sa
     page la voient. */
  const companies = useAsync(() => api.get<DirectoryRecord[]>('/api/records?kind=org'), 'orgs-for-task');
  const persons = useAsync(
    async () => (link.kind === 'person' ? api.get<DirectoryRecord[]>('/api/records?kind=person') : null),
    `people-for-link:${link.kind}`,
  );
  const programs = useAsync(
    async () =>
      link.kind === 'edition' || link.kind === 'candidate'
        ? api.get<ProgramWithEditions[]>('/api/programs')
        : null,
    `programs-for-link:${link.kind}`,
  );
  const startups = useAsync(
    async () =>
      link.kind === 'candidate' && link.editionId
        ? api.get<{ id: string; orgName: string }[]>(`/api/editions/${link.editionId}/candidates`)
        : null,
    `startups-for-link:${link.kind}:${link.editionId}`,
  );
  /* Depuis un programme, on ne cherche pas dans l'annuaire entier : les quatre
     groupes de son équipe sont la réponse à « owner », et ils tiennent sur
     l'écran. */
  const team = useAsync(
    async () => (attach?.editionId ? api.get<TeamGroup[]>(`/api/editions/${attach.editionId}/team`) : null),
    attach?.editionId ?? 'no-edition',
  );

  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));
  const owners = [...people, ...orgs];

  const editions = (programs.data ?? []).flatMap((p) =>
    p.editions.map((e) => ({ id: e.id, label: `${p.name} — ${e.name}` })),
  );

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const made = await api.post<unknown[]>('/api/tasks', {
        ...draft,
        dueOn: draft.dueOn || null,
        ownerIds: owners,
        /* Une attache et une seule : c'est la liste d'une édition qui sait
           retrouver les tâches liées à ses startups, et non la tâche qui porte
           deux attaches en se contredisant. */
        recordId: link.kind === 'person' || link.kind === 'org' ? link.recordId || null : null,
        editionId: link.kind === 'edition' ? link.editionId || null : null,
        candidateId: link.kind === 'candidate' ? link.candidateId || null : null,
        blockId: attach?.blockId ?? null,
        tell,
      });
      toast(made.length === 1 ? 'Given.' : `Given to ${made.length}.`);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Give a task"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving || !draft.title.trim() || !owners.length} onClick={save}>
            {saving ? 'Giving…' : owners.length > 1 ? `Give ${owners.length} tasks` : 'Give it'}
          </button>
        </>
      }
    >
      <TextField
        label="Task"
        value={draft.title}
        error={errors.title}
        placeholder="Chase the commercial register"
        onChange={(v) => set({ title: v })}
      />

      <div className="field">
        <label>Description</label>
        <textarea className="textarea" rows={2} value={draft.detail} onChange={(e) => set({ detail: e.target.value })} />
      </div>

      {team.data ? (
        <div className="field">
          <label>Owner</label>
          <div className="help">The team of this programme. Pick as many as you like — one task each.</div>
          <div className="stack" style={{ gap: 8, marginTop: 4 }}>
            {team.data
              .filter((group) => group.people.length > 0)
              .map((group) => (
                <div key={group.key}>
                  <div className="eyebrow">{group.label}</div>
                  <div className="work-pick">
                    {group.people.map((person) => {
                      const chosen = person.kind === 'org' ? orgs : people;
                      const put = person.kind === 'org' ? setOrgs : setPeople;
                      return (
                        <button
                          key={person.id}
                          type="button"
                          className={chosen.includes(person.id) ? 'track on' : 'track'}
                          onClick={() =>
                            put((x) =>
                              x.includes(person.id) ? x.filter((o) => o !== person.id) : [...x, person.id],
                            )
                          }
                        >
                          {person.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            {team.data.every((group) => !group.people.length) && (
              <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
                Nobody is on this programme yet — no jury, no mentor, no startup.
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <PeoplePicker label="Owner" value={people} onChange={setPeople} />

          {/* Cherchée, et non déroulée : quatre cents sociétés en pastilles
              demandaient une coupure, et une liste coupée fait passer une
              société absente pour inconnue. */}
          <PeoplePicker
            kind="org"
            label="Or an organisation"
            value={orgs}
            onChange={setOrgs}
            help="Everybody on its page sees it — whatever they may do there — and the first one to deal with it ticks it."
          />
        </>
      )}

      {/* Le lien : de quoi parle cette tâche. Choisi ici, et non déduit de la
          page d'où l'on vient — depuis la liste des tâches, il n'y en avait
          aucun moyen. */}
      <div className="field">
        <label htmlFor="task-link">Link</label>
        <div className="help">What it is about. Optional — and one thing at a time.</div>
        <select
          id="task-link"
          className="input"
          value={link.kind}
          onChange={(e) =>
            /* Changer de genre vide ce qui le remplissait : un identifiant de
               fiche gardé sous « une édition » partirait en silence au
               serveur, et la tâche se lierait à ce qu'on vient de quitter. */
            setLink({ kind: e.target.value as LinkKind, recordId: '', editionId: '', candidateId: '' })
          }
        >
          {LINK_KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>

        {link.kind === 'person' && (
          <select
            className="input"
            aria-label="Which individual"
            style={{ marginTop: 6 }}
            value={link.recordId}
            onChange={(e) => setLink((l) => ({ ...l, recordId: e.target.value }))}
          >
            <option value="">Pick someone…</option>
            {(persons.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        {link.kind === 'org' && (
          <select
            className="input"
            aria-label="Which organisation"
            style={{ marginTop: 6 }}
            value={link.recordId}
            onChange={(e) => setLink((l) => ({ ...l, recordId: e.target.value }))}
          >
            <option value="">Pick an organisation…</option>
            {(companies.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        )}

        {(link.kind === 'edition' || link.kind === 'candidate') && (
          <select
            className="input"
            aria-label="Which edition"
            style={{ marginTop: 6 }}
            value={link.editionId}
            onChange={(e) => setLink((l) => ({ ...l, editionId: e.target.value, candidateId: '' }))}
          >
            <option value="">Pick a programme…</option>
            {editions.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        )}

        {link.kind === 'candidate' && (
          <select
            className="input"
            aria-label="Which startup"
            style={{ marginTop: 6 }}
            disabled={!link.editionId}
            value={link.candidateId}
            onChange={(e) => setLink((l) => ({ ...l, candidateId: e.target.value }))}
          >
            <option value="">{link.editionId ? 'Pick a startup…' : 'A programme first'}</option>
            {(startups.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.orgName}</option>
            ))}
          </select>
        )}
      </div>

      <div className="field">
        <label htmlFor="task-due">Due date</label>
        <input
          id="task-due"
          className="input"
          type="date"
          value={draft.dueOn}
          onChange={(e) => set({ dueOn: e.target.value })}
        />
        <div className="hint">Leave it empty for something with no date. Late is counted from the day after.</div>
      </div>

      <TellLine ownerIds={owners} tell={tell} onTell={setTell} />

      {owners.length > 1 && (
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          <Icon name="alert" size={12} /> One task each, so that “done” can name somebody.
        </p>
      )}
    </Modal>
  );
}

/** Pourquoi personne ne sera prévenu, en mots plutôt qu'en code. */
const WHY: Record<string, string> = {
  no_email: 'has no address',
  gone: 'is no longer in the directory',
};

/**
 * Qui recevra une lettre, dit avant de donner la tâche et non après.
 *
 * La liste vient du serveur parce que lui seul connaît la règle entière : une
 * société sans adresse se rabat sur qui tient sa page. Refaire ce calcul ici
 * donnerait un écran qui promet une lettre que personne ne reçoit.
 */
function TellLine({
  ownerIds,
  tell,
  onTell,
}: {
  ownerIds: string[];
  tell: boolean;
  onTell: (next: boolean) => void;
}) {
  const hearers = useAsync(
    async () =>
      ownerIds.length
        ? api.post<{ on: boolean; who: { id: string; toName: string; blocked: string }[] }>(
            '/api/tasks/hearers',
            { ownerIds },
          )
        : null,
    `hearers:${[...ownerIds].sort().join(',')}`,
  );
  if (!ownerIds.length || !hearers.data) return null;

  const reached = hearers.data.who.filter((w) => !w.blocked);
  const missed = hearers.data.who.filter((w) => w.blocked);

  if (!hearers.data.on) {
    return (
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        Task letters are switched off in Settings — nobody will be written to.
      </p>
    );
  }

  return (
    <div className="field">
      <label className="row" style={{ gap: 7, cursor: 'pointer', fontWeight: 500 }}>
        <input type="checkbox" checked={tell} onChange={(e) => onTell(e.target.checked)} />
        Tell them by email
      </label>
      {tell && reached.length > 0 && (
        <div className="hint">
          {reached.map((w) => w.toName).join(', ')} {reached.length === 1 ? 'gets' : 'get'} a letter now.
        </div>
      )}
      {/* Nommés, et pas comptés : « 2 sans adresse » n'aide personne à savoir
          qui rappeler à la main. */}
      {missed.length > 0 && (
        <p className="warnline" style={{ margin: '4px 0 0', fontSize: 12 }}>
          {missed.map((w) => `${w.toName} ${WHY[w.blocked] ?? w.blocked}`).join(' · ')} — the task is still given,
          but no letter goes out for it.
        </p>
      )}
    </div>
  );
}
