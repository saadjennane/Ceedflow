/**
 * Ce que l'IA a lu dans une réunion : des tâches proposées, à vérifier et
 * corriger sur place, puis à créer d'un clic. Rien n'est créé sans ce clic, et
 * rien n'est créé deux fois.
 */
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  type MeetingOptions,
  type MeetingSuggestion,
  type MeetingView,
  type TaskPriority,
} from '@ceed/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlays';
import { Tiles } from '../directory/DirectoryViews';
import '../../ui/directory.css';

type Outcome = { created: { id: string; taskId: string }[]; failed: { id: string; error: string }[]; skipped: string[]; told: number };

export function MeetingResultPage() {
  const { meetingId = '' } = useParams();
  const view = useAsync(() => api.get<MeetingView>(`/api/meeting-assistant/meetings/${meetingId}`), `meeting:${meetingId}`);
  const options = useAsync(() => api.get<MeetingOptions>('/api/meeting-assistant/options'), 'meeting-options');
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [tell, setTell] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const toast = useToast();

  const m = view.data;
  /* Tant que l'analyse tourne, la page se remet à jour d'elle-même. */
  useEffect(() => {
    if (m?.status !== 'pending') return;
    const t = setInterval(() => view.reload(), 2500);
    return () => clearInterval(t);
  }, [m?.status, view]);

  const open = (m?.suggestions ?? []).filter((s) => s.status !== 'created' && s.status !== 'dismissed');
  /* Cochées d'avance : ce qui n'est ni un doublon possible ni à vérifier. */
  const selected = picked ?? new Set(open.filter((s) => !s.duplicate && !s.needsReview).map((s) => s.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const patch = async (s: MeetingSuggestion, body: Record<string, unknown>) => {
    try {
      await api.patch(`/api/meeting-assistant/suggestions/${s.id}`, body);
      view.reload();
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const out = await api.post<Outcome>(`/api/meeting-assistant/meetings/${meetingId}/create`, { ids: [...selected], tell });
      setOutcome(out);
      setPicked(new Set(out.failed.map((f) => f.id)));
      view.reload();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  if (view.error) return <div className="page"><div className="callout warn">{view.error}</div></div>;
  if (!m) return <div className="page faint">Loading…</div>;
  const canWrite = options.data?.canWrite ?? false;
  const members = options.data?.members ?? [];
  const me = options.data?.me ?? '';
  const missing = [...selected].filter((id) => !open.find((s) => s.id === id)?.assigneeId).length;

  return (
    <>
      <header className="topbar">
        <Link className="btn ghost sm" to="/meetings">
          <Icon name="chevronLeft" size={13} /> Meeting Assistant
        </Link>
        <div className="spacer" />
        {canWrite && m.status !== 'pending' && (
          <button className="btn" disabled={busy} onClick={async () => {
            await api.post(`/api/meeting-assistant/meetings/${meetingId}/analyse`);
            setPicked(null);
            view.reload();
          }}>
            <Icon name="refresh" size={13} /> Analyze again
          </button>
        )}
      </header>

      <div className="page stack" style={{ gap: 14, maxWidth: 960 }}>
        <section className="stack" style={{ gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 21 }}>{m.title}</h2>
          <span className="faint" style={{ fontSize: 12.5 }}>
            {formatDate(m.meetingOn)}{m.editionName && ` · ${m.editionName}`} · imported by {m.createdByName || '—'}
            {m.analysedAt && ` · analysed ${formatDate(m.analysedAt)}`}
          </span>
          <button className="linkish" style={{ alignSelf: 'flex-start', fontSize: 12.5 }} onClick={() => setShowNotes(!showNotes)}>
            {showNotes ? 'Hide the notes' : 'Show the notes'}
          </button>
          {showNotes && <div className="card card-pad" style={{ whiteSpace: 'pre-wrap', fontSize: 13, overflowWrap: 'anywhere' }}>{m.content}</div>}
        </section>

        {m.status === 'pending' && <div className="callout"><Icon name="refresh" size={15} /> <div>Analysing the meeting… this takes up to a minute.</div></div>}
        {m.status === 'failed' && (
          <div className="callout warn">
            <Icon name="alert" size={15} />
            <div style={{ flex: 1 }}>The analysis failed — {m.error} The notes are kept: run it again.</div>
          </div>
        )}

        {outcome && (
          <div className={outcome.failed.length ? 'callout warn' : 'callout ok'}>
            <Icon name={outcome.failed.length ? 'alert' : 'check'} size={15} />
            <div style={{ flex: 1 }}>
              <strong>{outcome.created.length} task{outcome.created.length === 1 ? '' : 's'} successfully created.</strong>
              {outcome.told > 0 && ` ${outcome.told} announced by email.`}
              {outcome.failed.length > 0 && ` ${outcome.failed.length} could not be — see below, fix and create again.`}
            </div>
            <Link className="btn sm" to="/tasks">View Tasks</Link>
            <Link className="btn ghost sm" to="/meetings">Back to Meeting Assistant</Link>
          </div>
        )}

        {m.status === 'done' && (
          <>
            <section className="stack" style={{ gap: 8 }}>
              <strong style={{ fontSize: 15 }}>AI Analysis Complete</strong>
              {m.summary && <p style={{ margin: 0, fontSize: 13.5 }}>{m.summary}</p>}
              <Tiles
                on=""
                onPick={() => {}}
                tiles={[
                  { key: 'tasks', label: 'Tasks', value: String(m.suggestions.filter((s) => s.source === 'ai').length), note: 'identified' },
                  { key: 'people', label: 'Responsibles', value: String(m.suggestions.filter((s) => s.assigneeId && !s.assigneeNote).length), note: 'recognised' },
                  { key: 'review', label: 'To check', value: String(open.filter((s) => s.needsReview || s.assigneeNote || s.dueNote).length), note: 'need a look' },
                  { key: 'dup', label: 'Duplicates', value: String(open.filter((s) => s.duplicate).length), note: 'possible' },
                ]}
              />
            </section>

            <div className="stack" style={{ gap: 10 }}>
              {m.suggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  s={s}
                  members={members}
                  me={me}
                  canWrite={canWrite}
                  checked={selected.has(s.id)}
                  onToggle={() => toggle(s.id)}
                  onPatch={(body) => patch(s, body)}
                  onRemove={async () => {
                    try {
                      await api.del(`/api/meeting-assistant/suggestions/${s.id}`);
                      view.reload();
                    } catch (err) {
                      toast((err as Error).message, true);
                    }
                  }}
                />
              ))}
              {!m.suggestions.length && <div className="empty">No task found in these notes. Add one by hand if something was decided.</div>}
            </div>

            {canWrite && (
              <section className="card card-pad row wrap" style={{ gap: 10, position: 'sticky', bottom: 8 }}>
                <button className="btn ghost sm" onClick={() => setPicked(selected.size === open.length ? new Set() : new Set(open.map((s) => s.id)))}>
                  {selected.size === open.length && open.length ? 'Select none' : 'Select All'}
                </button>
                <button className="btn ghost sm" onClick={async () => {
                  await api.post(`/api/meeting-assistant/meetings/${meetingId}/suggestions`);
                  view.reload();
                }}>
                  <Icon name="plus" size={12} /> Add a task
                </button>
                <label className="check" style={{ fontSize: 12.5 }}>
                  <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} />
                  <span>Email each person — one letter listing all their tasks</span>
                </label>
                <div className="spacer" />
                {missing > 0 && <span className="warnline" style={{ fontSize: 12 }}>{missing} without a responsible</span>}
                <button className="btn primary" disabled={busy || !selected.size} onClick={create}>
                  {busy ? 'Creating…' : `Create ${selected.size} selected task${selected.size === 1 ? '' : 's'}`}
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function SuggestionCard({
  s,
  members,
  me,
  canWrite,
  checked,
  onToggle,
  onPatch,
  onRemove,
}: {
  s: MeetingSuggestion;
  members: { id: string; name: string }[];
  me: string;
  canWrite: boolean;
  checked: boolean;
  onToggle: () => void;
  onPatch: (body: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(s.title);
  const [description, setDescription] = useState(s.description);
  useEffect(() => {
    setTitle(s.title);
    setDescription(s.description);
  }, [s.title, s.description]);
  const done = s.status === 'created';
  const editable = canWrite && !done;

  return (
    <div className="rowcard card-pad stack" style={{ gap: 8, opacity: s.status === 'dismissed' ? 0.55 : 1 }}>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        {editable && <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${s.title || 'this task'}`} style={{ marginTop: 8 }} />}
        <div className="stack" style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <input
            className="input"
            value={title}
            disabled={!editable}
            placeholder="What has to be done"
            aria-label="Task Title"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== s.title && onPatch({ title })}
            style={{ fontWeight: 600 }}
          />
          <textarea
            className="textarea"
            rows={2}
            value={description}
            disabled={!editable}
            placeholder="Description"
            aria-label="Description"
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== s.description && onPatch({ description })}
          />
        </div>
        {editable && (
          <button className="btn ghost icon sm" aria-label="Remove this proposal" title="Remove — skip it" onClick={onRemove}>
            <Icon name="trash" size={13} />
          </button>
        )}
      </div>

      <div className="row wrap" style={{ gap: 8 }}>
        <div className="field" style={{ flex: '2 1 200px', margin: 0 }}>
          <label>Assigned To</label>
          <div className="row" style={{ gap: 6 }}>
            <select className="select" disabled={!editable} value={s.assigneeId ?? ''} onChange={(e) => onPatch({ assigneeId: e.target.value || null })}>
              <option value="">Select a member</option>
              {members.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {editable && s.assigneeId !== me && <button className="btn ghost sm" onClick={() => onPatch({ assigneeId: me })}>Assign to me</button>}
          </div>
          {s.assigneeNote && <div className={s.assigneeId ? 'faint' : 'warnline'} style={{ fontSize: 12 }}>{s.assigneeSaid && `“${s.assigneeSaid}” — `}{s.assigneeNote}</div>}
        </div>
        <div className="field" style={{ flex: '1 1 150px', margin: 0 }}>
          <label>Due Date</label>
          <input className="input" type="date" disabled={!editable} value={s.dueOn ?? ''} onChange={(e) => onPatch({ dueOn: e.target.value || null })} />
          {s.dueNote && <div className="faint" style={{ fontSize: 12 }}>{s.dueNote}</div>}
        </div>
        <div className="field" style={{ flex: '1 1 120px', margin: 0 }}>
          <label>Priority</label>
          <select className="select" disabled={!editable} value={s.priority} onChange={(e) => onPatch({ priority: e.target.value as TaskPriority })}>
            {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
          </select>
        </div>
      </div>

      {s.sourceExcerpt && (
        <div className="faint" style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>
          <span className="eyebrow">Source</span> “{s.sourceExcerpt}”
        </div>
      )}

      <div className="row wrap" style={{ gap: 6 }}>
        {s.source === 'manual' && <span className="badge">Added by hand</span>}
        {s.needsReview && <span className="badge warn" title={s.reviewReason}>Needs Review{s.reviewReason && ` — ${s.reviewReason}`}</span>}
        {s.confidence === 'low' && <span className="badge warn">Low confidence</span>}
        {s.duplicate && (
          <span className="badge warn">
            Potential duplicate task: <Link to={`/tasks?task=${s.duplicate.id}`}>{s.duplicate.title}</Link>
            {s.duplicate.ownerName && ` (${s.duplicate.ownerName})`}
          </span>
        )}
        {s.status === 'failed' && s.error && <span className="badge stop">Not created — {s.error}</span>}
        {done && s.task && (
          <span className="badge ok">
            <Icon name="check" size={11} /> Created — <Link to={`/tasks?task=${s.task.id}`}>view the task</Link>
          </span>
        )}
      </div>
    </div>
  );
}
