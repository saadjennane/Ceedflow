/**
 * Donner une tâche.
 *
 * Trois questions dans l'ordre où on se les pose : quoi, à qui, pour quand.
 * Le « à propos de » vient en dernier parce qu'il est souvent déjà rempli —
 * la fenêtre s'ouvre depuis une fiche ou depuis un programme, et elle sait
 * alors de quoi elle parle.
 *
 * Plusieurs destinataires créent plusieurs tâches, et c'est dit sous le champ :
 * sinon « fait » serait un mot sans sujet.
 */
import { type DirectoryRecord } from '@ceed/shared';
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
   * L'attache dit de quoi il s'agit, elle ne dit pas qui s'en occupe — et
   * sans ce pré-cochage il fallait retrouver dans l'annuaire la personne dont
   * on avait la fiche sous les yeux.
   */
  owner?: { id: string; kind: 'person' | 'org' };
}

/** L'équipe d'une édition, telle que le serveur la groupe. */
interface TeamGroup {
  key: string;
  label: string;
  people: { id: string; name: string; kind: 'person' | 'org' }[];
}

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
  /* Les sociétés aussi peuvent porter une tâche : « Rafid Tech doit envoyer
     son RIB » n'est à personne en particulier, et tous ceux qui tiennent sa
     page la voient. */
  const companies = useAsync(() => api.get<DirectoryRecord[]>('/api/records?kind=org'), 'orgs-for-task');
  /* Depuis un programme, on ne cherche pas dans l'annuaire entier : les quatre
     groupes de son équipe sont la réponse à « à qui », et ils tiennent sur
     l'écran. */
  const team = useAsync(
    async () => (attach?.editionId ? api.get<TeamGroup[]>(`/api/editions/${attach.editionId}/team`) : null),
    attach?.editionId ?? 'no-edition',
  );

  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));
  const owners = [...people, ...orgs];

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const made = await api.post<unknown[]>('/api/tasks', {
        ...draft,
        dueOn: draft.dueOn || null,
        ownerIds: owners,
        recordId: attach?.recordId ?? null,
        editionId: attach?.editionId ?? null,
        blockId: attach?.blockId ?? null,
        candidateId: attach?.candidateId ?? null,
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
      subtitle={attach?.about ? `About ${attach.about}.` : undefined}
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
        label="What has to be done"
        value={draft.title}
        error={errors.title}
        placeholder="Chase the commercial register"
        onChange={(v) => set({ title: v })}
      />

      <div className="field">
        <label>More, if it needs it</label>
        <textarea className="textarea" rows={2} value={draft.detail} onChange={(e) => set({ detail: e.target.value })} />
      </div>

      {team.data ? (
        <div className="field">
          <label>Who does it</label>
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
        <PeoplePicker label="Who does it" value={people} onChange={setPeople} />
      )}

      <div className="field" style={{ display: team.data ? 'none' : undefined }}>
        <label>Or an organisation</label>
        <div className="help">Everybody who holds its page sees it, and the first one to deal with it ticks it.</div>
        <div className="work-pick" style={{ maxHeight: 150, overflowY: 'auto' }}>
          {(companies.data ?? []).slice(0, 60).map((org) => (
            <button
              key={org.id}
              type="button"
              className={orgs.includes(org.id) ? 'track on' : 'track'}
              onClick={() => setOrgs((x) => (x.includes(org.id) ? x.filter((o) => o !== org.id) : [...x, org.id]))}
            >
              {org.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="task-due">By when</label>
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
