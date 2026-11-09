/**
 * Donner une tâche.
 *
 * Elle appartient à l'équipe CEED — un ou plusieurs owners, une seule tâche
 * partagée — et peut être confiée à quelqu'un d'autre : un mentor, une
 * startup, une organisation, qui la voit dans son espace. Elle se rapporte à
 * un programme ET, éventuellement, à un sujet : une startup de ce programme,
 * une personne, une organisation.
 */
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, type DirectoryRecord, type MeetingOptions, type TaskPriority } from '@ceed/shared';
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
  /**
   * Plusieurs startups cochées dans la liste d'une édition.
   *
   * Deux façons de s'en servir, et la fenêtre fait choisir : une seule tâche
   * dont chaque startup est une ligne (« appeler toutes les startups »), ou
   * une tâche par startup, chacune liée à sa candidature.
   */
  startups?: { id: string; orgId: string; orgName: string }[];
}

type BulkMode = 'one' | 'each';

/** L'équipe d'une édition, telle que le serveur la groupe. */
interface TeamGroup {
  key: string;
  label: string;
  people: { id: string; name: string; kind: 'person' | 'org' }[];
}


type Subject = '' | 'person' | 'org' | 'candidate';

export function TaskModal({
  attach,
  onClose,
  onSaved,
}: {
  attach?: TaskAttach;
  onClose: () => void;
  onSaved: () => void;
}) {
  const bulk = attach?.startups?.length ? attach.startups : null;
  const names = (bulk ?? []).map((s) => s.orgName);
  const [mode, setMode] = useState<BulkMode>('one');
  const [toStartup, setToStartup] = useState(false);
  const [draft, setDraft] = useState<{ title: string; detail: string; dueOn: string; priority: TaskPriority }>({ title: '', detail: '', dueOn: '', priority: 'medium' });
  const [items, setItems] = useState<string[]>(names);
  const [line, setLine] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tell, setTell] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  /* L'équipe CEED, les programmes, et qui je suis : de quoi choisir les owners. */
  const options = useAsync(() => api.get<MeetingOptions>('/api/meeting-assistant/options'), 'meeting-options');
  const team = options.data?.members ?? [];
  const isTeam = (id: string) => team.some((m) => m.id === id);
  const [owners, setOwners] = useState<string[] | null>(null);
  /* Sur la fiche de quelqu'un de l'équipe, il est owner ; sur celle d'un externe, la tâche lui est confiée. */
  const ownersNow = owners ?? (options.data ? [...new Set([options.data.me, ...(attach?.owner && isTeam(attach.owner.id) ? [attach.owner.id] : [])])] : []);
  const [delegate, setDelegate] = useState<{ kind: 'person' | 'org'; id: string } | null>(null);
  const delegateNow = delegate ?? (attach?.owner && options.data && !isTeam(attach.owner.id) ? attach.owner : null);
  const [delegateTouched, setDelegateTouched] = useState(false);
  const delegateValue = delegateTouched ? delegate : delegateNow;

  const [editionId, setEditionId] = useState(attach?.editionId ?? '');
  const [subject, setSubject] = useState<{ kind: Subject; id: string }>(() => ({
    kind: attach?.candidateId ? 'candidate' : attach?.recordId ? (attach.owner?.id === attach.recordId ? attach.owner.kind : 'person') : '',
    id: attach?.candidateId ?? attach?.recordId ?? '',
  }));
  const records = useAsync(
    async () => (subject.kind === 'person' || subject.kind === 'org' ? api.get<DirectoryRecord[]>(`/api/records?kind=${subject.kind}`) : null),
    `task-subject:${subject.kind}`,
  );
  const startups = useAsync(
    async () => (subject.kind === 'candidate' && editionId ? api.get<{ id: string; orgName: string }[]>(`/api/editions/${editionId}/candidates`) : null),
    `task-startups:${subject.kind}:${editionId}`,
  );
  /* Depuis un programme, les gens de son équipe sont la réponse à « à qui la confier ». */
  const programTeam = useAsync(
    async () => (attach?.editionId ? api.get<TeamGroup[]>(`/api/editions/${attach.editionId}/team`) : null),
    attach?.editionId ?? 'no-edition',
  );

  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));
  const each = Boolean(bulk) && mode === 'each';
  const count = each ? bulk!.length : 1;
  const hearers = [...new Set([...ownersNow.filter((o) => o !== options.data?.me), ...(delegateValue ? [delegateValue.id] : [])])];

  const switchMode = (next: BulkMode) => {
    setMode(next);
    const own = items.filter((i) => !names.includes(i));
    setItems(next === 'one' ? [...names, ...own] : own);
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const checklist = [...items, line].map((l) => l.trim()).filter(Boolean);
      const base = { ...draft, items: checklist, dueOn: draft.dueOn || null, ownerIds: ownersNow, blockId: attach?.blockId ?? null, tell };
      if (each) {
        let given = 0;
        const failed: string[] = [];
        for (const startup of bulk!) {
          try {
            await api.post<unknown[]>('/api/tasks', {
              ...base,
              delegateId: toStartup ? startup.orgId : (delegateValue?.id ?? null),
              editionId: attach?.editionId ?? null,
              candidateId: startup.id,
              recordId: null,
            });
            given += 1;
          } catch (err) {
            if (err instanceof ApiError && err.fields) {
              setErrors(err.fields);
              return;
            }
            failed.push(startup.orgName);
          }
        }
        if (failed.length) toast(`Given ${given}. Not given for ${failed.join(', ')}.`, true);
        else toast(`Given ${given}.`);
        onSaved();
        return;
      }
      await api.post<unknown[]>('/api/tasks', {
        ...base,
        delegateId: delegateValue?.id ?? null,
        editionId: editionId || null,
        recordId: subject.kind === 'person' || subject.kind === 'org' ? subject.id || null : null,
        candidateId: subject.kind === 'candidate' ? subject.id || null : null,
      });
      toast('Given.');
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
          <button className="btn primary" disabled={saving || !draft.title.trim() || !ownersNow.length} onClick={save}>
            {saving ? 'Giving…' : count > 1 ? `Give ${count} tasks` : 'Give it'}
          </button>
        </>
      }
    >
      {bulk && (
        <div className="field">
          <label>{bulk.length} startups</label>
          <div className="seg" role="group" aria-label="How">
            <button className={mode === 'one' ? 'on' : ''} onClick={() => switchMode('one')}>One task, a line per startup</button>
            <button className={mode === 'each' ? 'on' : ''} onClick={() => switchMode('each')}>One task per startup</button>
          </div>
          <div className="hint">
            {mode === 'one' ? 'Say, a call with all of them: one task, and each startup is a line to tick.' : 'The same task, once for each startup and linked to it.'}
          </div>
        </div>
      )}

      <TextField label="Task" value={draft.title} error={errors.title} placeholder="Chase the commercial register" onChange={(v) => set({ title: v })} />

      <div className="field">
        <label>Description</label>
        <textarea className="textarea" rows={2} value={draft.detail} onChange={(e) => set({ detail: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="task-line">Checklist <span className="faint" style={{ fontWeight: 400 }}>· optional</span></label>
        {items.length > 0 && (
          <div className="rows" style={{ gap: 2, marginBottom: 6 }}>
            {items.map((item, at) => (
              <div key={at} className="check-item">
                <input type="checkbox" disabled aria-hidden />
                <span style={{ flex: 1, fontSize: 13 }}>{item}</span>
                <button className="btn ghost icon sm" aria-label={`Remove ${item}`} onClick={() => setItems((list) => list.filter((_, i) => i !== at))}>
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          id="task-line"
          className="input"
          value={line}
          placeholder={items.length ? 'Add a line' : 'Split it into lines to tick — press Enter after each'}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && line.trim()) {
              e.preventDefault();
              setItems((list) => [...list, line.trim()]);
              setLine('');
            }
          }}
        />
      </div>

      <div className="field">
        <label>Owners</label>
        <div className="help">The CEED team. Pick as many as you like — one task, shared: any of them moves it on, it is done once for all.</div>
        <div className="work-pick" style={{ marginTop: 4 }}>
          {team.map((m) => (
            <button
              key={m.id}
              type="button"
              className={ownersNow.includes(m.id) ? 'track on' : 'track'}
              onClick={() => setOwners(ownersNow.includes(m.id) ? ownersNow.filter((x) => x !== m.id) : [...ownersNow, m.id])}
            >
              {m.name}
            </button>
          ))}
        </div>
        {errors.ownerIds && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.ownerIds}</div>}
      </div>

      {each ? (
        <label className="check">
          <input type="checkbox" checked={toStartup} onChange={(e) => setToStartup(e.target.checked)} />
          <span>Entrust each one to the startup itself — it sees it in its space</span>
        </label>
      ) : (
        <div className="field">
          <label>Entrust to <span className="faint" style={{ fontWeight: 400 }}>· optional</span></label>
          <div className="help">Somebody outside the team who does it — a mentor, a juror, a startup. They see it in their space.</div>
          {programTeam.data && (
            <div className="stack" style={{ gap: 6, marginTop: 4 }}>
              {programTeam.data.filter((g) => g.people.length).map((g) => (
                <div key={g.key}>
                  <div className="eyebrow">{g.label}</div>
                  <div className="work-pick">
                    {g.people.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={delegateValue?.id === p.id ? 'track on' : 'track'}
                        onClick={() => {
                          setDelegateTouched(true);
                          setDelegate(delegateValue?.id === p.id ? null : { kind: p.kind, id: p.id });
                        }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
            <div style={{ flex: '1 1 220px' }}>
              <PeoplePicker
                label="A person"
                value={delegateValue?.kind === 'person' ? [delegateValue.id] : []}
                onChange={(ids) => {
                  setDelegateTouched(true);
                  setDelegate(ids.length ? { kind: 'person', id: ids[ids.length - 1]! } : null);
                }}
              />
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <PeoplePicker
                kind="org"
                label="Or an organisation"
                value={delegateValue?.kind === 'org' ? [delegateValue.id] : []}
                onChange={(ids) => {
                  setDelegateTouched(true);
                  setDelegate(ids.length ? { kind: 'org', id: ids[ids.length - 1]! } : null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {bulk ? (
        <div className="field">
          <label>Link</label>
          <div className="help">{each ? 'Each task is linked to its programme and its own startup.' : `Linked to ${attach?.about ?? 'this programme'}.`}</div>
        </div>
      ) : (
        <div className="field">
          <label>Link</label>
          <div className="help">A programme, and what it is about — both optional, and they go together.</div>
          <div className="row wrap" style={{ gap: 8 }}>
            <select className="input" style={{ flex: '1 1 220px' }} aria-label="Programme" value={editionId} onChange={(e) => {
              setEditionId(e.target.value);
              if (subject.kind === 'candidate') setSubject({ kind: 'candidate', id: '' });
            }}>
              <option value="">No programme</option>
              {(options.data?.editions ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select className="input" style={{ flex: '1 1 180px' }} aria-label="About" value={subject.kind} onChange={(e) => setSubject({ kind: e.target.value as Subject, id: '' })}>
              <option value="">About nothing else</option>
              <option value="candidate">A startup of this programme</option>
              <option value="person">An individual</option>
              <option value="org">An organisation</option>
            </select>
          </div>
          {(subject.kind === 'person' || subject.kind === 'org') && (
            <select className="input" style={{ marginTop: 6 }} aria-label="Which one" value={subject.id} onChange={(e) => setSubject((x) => ({ ...x, id: e.target.value }))}>
              <option value="">{subject.kind === 'person' ? 'Pick someone…' : 'Pick an organisation…'}</option>
              {(records.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          {subject.kind === 'candidate' && (
            <select className="input" style={{ marginTop: 6 }} aria-label="Which startup" disabled={!editionId} value={subject.id} onChange={(e) => setSubject((x) => ({ ...x, id: e.target.value }))}>
              <option value="">{editionId ? 'Pick a startup…' : 'A programme first'}</option>
              {(startups.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.orgName}</option>)}
            </select>
          )}
        </div>
      )}

      <div className="row wrap" style={{ gap: 10 }}>
        <div className="field" style={{ flex: '1 1 180px' }}>
          <label htmlFor="task-due">Due date</label>
          <input id="task-due" className="input" type="date" value={draft.dueOn} onChange={(e) => set({ dueOn: e.target.value })} />
        </div>
        <div className="field" style={{ flex: '1 1 140px' }}>
          <label htmlFor="task-priority">Priority</label>
          <select id="task-priority" className="select" value={draft.priority} onChange={(e) => set({ priority: e.target.value as TaskPriority })}>
            {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
          </select>
        </div>
      </div>

      <TellLine ownerIds={each && toStartup ? [...ownersNow.filter((o) => o !== options.data?.me), ...bulk!.map((b) => b.orgId)] : hearers} tell={tell} onTell={setTell} />
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
