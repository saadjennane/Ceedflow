/**
 * Une tâche, ouverte.
 *
 * Jusqu'ici une tâche se donnait et se cochait, et rien d'autre : une faute
 * dans l'intitulé, une échéance repoussée, et il fallait la supprimer pour la
 * redonner — en prévenant deux fois la personne. Ici on la reprend.
 *
 * Chaque champ s'enregistre en le quittant, sans bouton : c'est un panneau
 * qu'on ouvre pour changer une chose, pas un formulaire qu'on remplit.
 */
import {
  BOARD_COLUMNS, MAX_UPLOAD_BYTES, TASK_EVENT_WORD, TASK_PRIORITIES, TASK_PRIORITY_LABEL, isLate, progress,
  type DirectoryRecord, type MeetingOptions, type Task, type TaskAttachment, type TaskEvent, type TaskItem, type TaskPriority,
} from '@ceed/shared';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatDate } from '../lib/format';
import { Icon } from './Icon';
import { ConfirmDialog, Drawer, useToast } from './Overlays';
import { DropRow, Grip, moved, nudged, useDragging } from './Reorderable';
import { PeoplePicker } from '../pages/directory/PeoplePicker';
import { Modal } from './Overlays';

const STATE_WORD: Record<string, string> = Object.fromEntries(BOARD_COLUMNS.map((c) => [c.state, c.label]));

/** Une ligne d'historique, dite en mots. */
function eventLine(e: TaskEvent): string {
  const m = e.meta as Record<string, string>;
  switch (e.kind) {
    case 'created':
      return `Created${m.owners ? ` — owners: ${(m.owners as unknown as string[]).join(', ')}` : ''}${m.delegate ? ` · entrusted to ${m.delegate}` : ''}`;
    case 'owners':
      return `Owners: ${m.from || '—'} → ${m.to}`;
    case 'delegated':
      return `Entrusted to ${m.to}${m.from ? ` (was ${m.from})` : ''}`;
    case 'undelegated':
      return `No longer entrusted to ${m.from}`;
    case 'state':
      return `${STATE_WORD[m.from] ?? m.from} → ${STATE_WORD[m.to] ?? m.to}`;
    case 'stuck':
      return `Stuck — asked ${m.unblocker} to unblock it`;
    case 'submitted':
      return `Sent to ${m.validator} for validation`;
    case 'priority':
      return `Priority: ${m.from} → ${m.to}`;
    case 'due':
      return `Due date: ${m.from ? formatDate(m.from) : 'none'} → ${m.to ? formatDate(m.to) : 'none'}`;
    default:
      return TASK_EVENT_WORD[e.kind] ?? e.kind;
  }
}

export function TaskDrawer({
  task: initial,
  onClose,
  onChanged,
}: {
  task: Task;
  onClose: () => void;
  /** La tâche telle qu'enregistrée, ou null quand elle vient d'être supprimée. */
  onChanged: (task: Task | null) => void;
}) {
  const [task, setTask] = useState(initial);
  const [draft, setDraft] = useState({ title: initial.title, detail: initial.detail, dueOn: initial.dueOn ?? '' });
  const [removing, setRemoving] = useState(false);
  const [asking, setAsking] = useState<'stuck' | 'submit' | 'send_back' | null>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const options = useAsync(() => api.get<MeetingOptions>('/api/meeting-assistant/options'), 'meeting-options');
  const history = useAsync(() => api.get<{ events: TaskEvent[]; attachments: TaskAttachment[] }>(`/api/tasks/${task.id}/history`), `task-history:${task.id}:${task.state}`);
  const team = options.data?.members ?? [];
  const me = options.data?.me ?? '';

  const took = (saved: Task) => {
    setTask(saved);
    onChanged(saved);
    history.reload();
  };
  const run = async (fn: () => Promise<Task>) => {
    try {
      took(await fn());
    } catch (err) {
      toast((err as Error).message, true);
    }
  };
  const save = (patch: Record<string, unknown>) => run(() => api.patch<Task>(`/api/tasks/${task.id}`, patch));

  const leaveTitle = () => {
    const title = draft.title.trim();
    if (!title) setDraft((d) => ({ ...d, title: task.title }));
    else if (title !== task.title) save({ title });
  };

  const remove = async () => {
    try {
      await api.del(`/api/tasks/${task.id}`);
      onChanged(null);
      onClose();
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const attach = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) return toast(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB.`, true);
    setUploading(true);
    try {
      const body = new FormData();
      body.append('fieldId', 'task');
      body.append('file', file);
      const res = await fetch('/api/public/uploads', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Upload failed.');
      await api.post(`/api/tasks/${task.id}/attachments`, { uploadId: json.id });
      history.reload();
      took((await api.get<Task[]>(`/api/tasks?open=all`)).find((t) => t.id === task.id) ?? task);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setUploading(false);
    }
  };

  const ownerIds = task.owners.map((o) => o.id);
  const subtitle = [task.owners.map((o) => o.name).join(', ') || task.ownerName, task.delegate ? `→ ${task.delegate.name}` : null].filter(Boolean).join(' ');

  return (
    <>
      <Drawer
        title={task.title}
        subtitle={subtitle}
        onClose={onClose}
        footer={
          <>
            <button className="btn danger" onClick={() => setRemoving(true)}>
              <Icon name="trash" size={13} /> Delete
            </button>
            <div className="spacer" />
            <button className="btn" onClick={onClose}>Close</button>
          </>
        }
      >
        <div className="field">
          <label>State</label>
          <div className="seg" role="group" aria-label="State">
            {BOARD_COLUMNS.map((col) => (
              <button
                key={col.state}
                className={task.state === col.state ? 'on' : ''}
                onClick={() => {
                  if (task.state === col.state) return;
                  if (col.state === 'stuck') setAsking('stuck');
                  else if (col.state === 'to_validate') setAsking('submit');
                  else save({ state: col.state });
                }}
              >
                {col.label}
              </button>
            ))}
          </div>
          {task.state === 'done' && (task.doneByName || task.doneAt) && (
            <div className="hint">Done{task.doneByName ? ` by ${task.doneByName}` : ''}{task.doneAt ? ` · ${formatDate(task.doneAt)}` : ''}</div>
          )}
        </div>

        {task.state === 'stuck' && (
          <div className="callout warn">
            <Icon name="alert" size={15} />
            <div>
              <strong>Stuck</strong>{task.unblocker && ` — ${task.unblocker.name} is asked to unblock it`}
              {task.stuckReason && <div style={{ whiteSpace: 'pre-wrap' }}>{task.stuckReason}</div>}
            </div>
          </div>
        )}
        {task.state === 'to_validate' && (
          <div className="callout">
            <Icon name="check" size={15} />
            <div style={{ flex: 1 }}>
              <strong>To validate</strong>{task.validator && ` by ${task.validator.name}`}
              {task.validationNote && <div style={{ whiteSpace: 'pre-wrap' }}>{task.validationNote}</div>}
              {task.validator?.id === me && (
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <button className="btn primary sm" onClick={() => run(() => api.post<Task>(`/api/tasks/${task.id}/validate`, { action: 'approve' }))}>
                    <Icon name="check" size={12} /> Validate
                  </button>
                  <button className="btn sm" onClick={() => setAsking('send_back')}>Send back</button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="task-title">Task</label>
          <input id="task-title" className="input" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} onBlur={leaveTitle} />
        </div>

        <div className="field">
          <label htmlFor="task-detail">Description</label>
          <textarea
            id="task-detail"
            className="textarea"
            rows={3}
            value={draft.detail}
            onChange={(e) => setDraft((d) => ({ ...d, detail: e.target.value }))}
            onBlur={() => draft.detail.trim() !== task.detail && save({ detail: draft.detail })}
          />
        </div>

        <Checklist task={task} onSaved={took} />

        <div className="row wrap" style={{ gap: 10 }}>
          <div className="field" style={{ flex: '1 1 160px' }}>
            <label htmlFor="task-due">Due date</label>
            <input
              id="task-due"
              className="input"
              type="date"
              value={draft.dueOn}
              onChange={(e) => {
                setDraft((d) => ({ ...d, dueOn: e.target.value }));
                save({ dueOn: e.target.value || null });
              }}
            />
            {isLate(task) && <div className="hint" style={{ color: 'var(--stop)' }}>Late.</div>}
          </div>
          <div className="field" style={{ flex: '1 1 130px' }}>
            <label htmlFor="task-priority">Priority</label>
            <select id="task-priority" className="select" value={task.priority ?? 'medium'} onChange={(e) => save({ priority: e.target.value as TaskPriority })}>
              {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Owners</label>
          <div className="work-pick">
            {team.map((m) => (
              <button
                key={m.id}
                type="button"
                className={ownerIds.includes(m.id) ? 'track on' : 'track'}
                onClick={() => {
                  const next = ownerIds.includes(m.id) ? ownerIds.filter((x) => x !== m.id) : [...ownerIds, m.id];
                  if (!next.length) return toast('A task keeps at least one owner.', true);
                  save({ ownerIds: next });
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Entrusted to</label>
          {task.delegate ? (
            <div className="row" style={{ gap: 8 }}>
              <Link to={`/directory/${task.delegate.id}`} onClick={onClose} style={{ flex: 1 }}>{task.delegate.name}</Link>
              <button className="btn ghost sm" onClick={() => save({ delegateId: null })}>Remove</button>
            </div>
          ) : (
            <div className="row wrap" style={{ gap: 8 }}>
              <div style={{ flex: '1 1 200px' }}>
                <PeoplePicker label="A person" value={[]} onChange={(ids) => ids.length && save({ delegateId: ids[ids.length - 1] })} />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <PeoplePicker kind="org" label="Or an organisation" value={[]} onChange={(ids) => ids.length && save({ delegateId: ids[ids.length - 1] })} />
              </div>
            </div>
          )}
        </div>

        <AboutField task={task} editions={options.data?.editions ?? []} onSave={(about) => save({ about })} />

        <div className="field">
          <label>Attachments</label>
          {(history.data?.attachments ?? []).map((a) => (
            <div key={a.id} className="row" style={{ gap: 8, fontSize: 13 }}>
              <Icon name="file" size={13} />
              <a href={`/api/uploads/${a.uploadId}`} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{a.filename}</a>
              <span className="faint" style={{ fontSize: 11.5 }}>{a.addedByName} · {formatDate(a.createdAt)}</span>
              <button
                className="btn ghost icon sm"
                aria-label={`Remove ${a.filename}`}
                onClick={async () => {
                  try {
                    await api.del(`/api/tasks/${task.id}/attachments/${a.id}`);
                    history.reload();
                  } catch (err) {
                    toast((err as Error).message, true);
                  }
                }}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          <label className="dropzone" style={{ marginTop: 6 }}>
            <input type="file" disabled={uploading} onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} />
            <Icon name="file" size={15} />
            <span>{uploading ? 'Sending…' : 'Attach an image or a document — 10 MB at most'}</span>
          </label>
        </div>

        <div className="field">
          <label>History</label>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(history.data?.events ?? []).map((e) => (
              <li key={e.id} style={{ fontSize: 12.5 }}>
                <span className="faint">{formatDate(e.createdAt)} · {e.actorName || '—'}</span>
                <div>{eventLine(e)}</div>
                {e.note && <div className="faint" style={{ whiteSpace: 'pre-wrap' }}>“{e.note}”</div>}
              </li>
            ))}
            {history.data && !history.data.events.length && (
              <li className="faint" style={{ fontSize: 12.5 }}>
                {task.createdByName ? `Given by ${task.createdByName}` : 'Given'} · {formatDate(task.createdAt)}
              </li>
            )}
          </ul>
          <span className="faint" style={{ fontSize: 12 }}>{task.toldAt ? `Told by email on ${formatDate(task.toldAt)}` : 'Nobody was written to'}</span>
        </div>
      </Drawer>

      {asking && (
        <AskDialog
          kind={asking}
          team={team.filter((m) => m.id !== me)}
          onClose={() => setAsking(null)}
          onDone={(body) => {
            setAsking(null);
            if (asking === 'stuck') return run(() => api.post<Task>(`/api/tasks/${task.id}/stuck`, body));
            if (asking === 'submit') return run(() => api.post<Task>(`/api/tasks/${task.id}/submit`, body));
            return run(() => api.post<Task>(`/api/tasks/${task.id}/validate`, { action: 'send_back', note: body.note }));
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title="Delete this task?"
          body={`“${task.title}” disappears for everybody on it. To keep a trace, mark it done instead.`}
          confirmLabel="Delete"
          destructive
          onConfirm={remove}
          onClose={() => setRemoving(false)}
        />
      )}
    </>
  );
}

/** Le programme et le sujet d'une tâche, chacun facultatif, et ensemble. */
function AboutField({ task, editions, onSave }: { task: Task; editions: { id: string; name: string }[]; onSave: (about: { editionId: string | null; subject: { kind: 'person' | 'org' | 'candidate'; id: string } | null }) => void }) {
  const [editing, setEditing] = useState(false);
  const [editionId, setEditionId] = useState(task.editionId ?? '');
  const [kind, setKind] = useState<'' | 'person' | 'org' | 'candidate'>(task.candidateId ? 'candidate' : task.recordId ? (task.recordKind ?? 'person') : '');
  const [id, setId] = useState(task.candidateId ?? task.recordId ?? '');
  const records = useAsync(async () => (editing && (kind === 'person' || kind === 'org') ? api.get<DirectoryRecord[]>(`/api/records?kind=${kind}`) : null), `about:${editing}:${kind}`);
  const startups = useAsync(async () => (editing && kind === 'candidate' && editionId ? api.get<{ id: string; orgName: string }[]>(`/api/editions/${editionId}/candidates`) : null), `about-s:${editing}:${editionId}`);
  if (!editing) {
    return (
      <div className="field">
        <label>Link</label>
        <div className="row wrap" style={{ gap: 8, fontSize: 13 }}>
          {task.editionName && <Link to={`/editions/${task.editionId}`}>{task.editionName}</Link>}
          {task.subjectName && (task.recordId ? <Link to={`/directory/${task.recordId}`}>{task.subjectName}</Link> : <span>{task.subjectName}</span>)}
          {!task.editionName && !task.subjectName && <span className="faint">Nothing</span>}
          <button className="linkish" style={{ fontSize: 12 }} onClick={() => setEditing(true)}>Change</button>
        </div>
      </div>
    );
  }
  return (
    <div className="field">
      <label>Link</label>
      <div className="row wrap" style={{ gap: 6 }}>
        <select className="input" style={{ flex: '1 1 200px' }} value={editionId} onChange={(e) => setEditionId(e.target.value)} aria-label="Programme">
          <option value="">No programme</option>
          {editions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select className="input" style={{ flex: '1 1 160px' }} value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setId(''); }} aria-label="About">
          <option value="">About nothing else</option>
          <option value="candidate">A startup of this programme</option>
          <option value="person">An individual</option>
          <option value="org">An organisation</option>
        </select>
      </div>
      {(kind === 'person' || kind === 'org') && (
        <select className="input" style={{ marginTop: 6 }} value={id} onChange={(e) => setId(e.target.value)} aria-label="Which one">
          <option value="">Pick…</option>
          {(records.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      )}
      {kind === 'candidate' && (
        <select className="input" style={{ marginTop: 6 }} disabled={!editionId} value={id} onChange={(e) => setId(e.target.value)} aria-label="Which startup">
          <option value="">{editionId ? 'Pick a startup…' : 'A programme first'}</option>
          {(startups.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.orgName}</option>)}
        </select>
      )}
      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <button className="btn sm primary" disabled={Boolean(kind) && !id} onClick={() => { onSave({ editionId: editionId || null, subject: kind && id ? { kind, id } : null }); setEditing(false); }}>Save</button>
        <button className="btn ghost sm" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  );
}

/** Bloquée, à valider, renvoyée : la raison ou le mot, et la personne. */
function AskDialog({ kind, team, onClose, onDone }: { kind: 'stuck' | 'submit' | 'send_back'; team: { id: string; name: string }[]; onClose: () => void; onDone: (body: { reason?: string; note?: string; unblockerId?: string; validatorId?: string; tell?: boolean }) => void }) {
  const [text, setText] = useState('');
  const [who, setWho] = useState('');
  const [tell, setTell] = useState(true);
  const words = kind === 'stuck'
    ? { title: 'What blocks it?', who: 'Who can unblock it', go: 'Mark as stuck', textNeeded: true }
    : kind === 'submit'
      ? { title: 'Send for validation', who: 'Who validates it', go: 'Send for validation', textNeeded: false }
      : { title: 'Send it back', who: '', go: 'Send back', textNeeded: true };
  return (
    <Modal
      title={words.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <div className="spacer" />
          <button
            className="btn primary"
            disabled={(words.textNeeded && !text.trim()) || (Boolean(words.who) && !who)}
            onClick={() =>
              onDone(kind === 'stuck' ? { reason: text, unblockerId: who, tell } : kind === 'submit' ? { note: text, validatorId: who, tell } : { note: text })
            }
          >
            {words.go}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        <textarea
          className="textarea"
          rows={3}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === 'stuck' ? 'The figures for 2025 are missing…' : kind === 'submit' ? 'A word for the validator (optional)' : 'What is missing?'}
        />
        {words.who && (
          <div className="field">
            <label>{words.who}</label>
            <select className="select" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Choose a colleague…</option>
              {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}
        {words.who && (
          <label className="check">
            <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} />
            <span>Tell them by email</span>
          </label>
        )}
      </div>
    </Modal>
  );
}

/**
 * La checklist d'une tâche : on la coche, on l'écrit, on la range.
 *
 * Tout cocher ne close pas la tâche — une checklist dit rarement tout ce qu'il
 * y a à faire — mais le panneau le propose, au moment où la question se pose.
 */
function Checklist({ task, onSaved }: { task: Task; onSaved: (task: Task) => void }) {
  const [items, setItems] = useState<TaskItem[]>(task.items);
  const [adding, setAdding] = useState('');
  const toast = useToast();
  const latest = useRef(items);
  latest.current = items;

  const base = `/api/tasks/${task.id}/items`;
  const call = async (run: () => Promise<Task>) => {
    try {
      const saved = await run();
      setItems(saved.items);
      onSaved(saved);
    } catch (err) {
      setItems(task.items);
      toast((err as Error).message, true);
    }
  };

  /* L'ordre suit le curseur pendant le glisser, et ne s'enregistre qu'au
     lâcher : une requête par ligne survolée serait une rafale pour rien. */
  const order = (list: TaskItem[]) => call(() => api.put<Task>(`${base}/order`, { ids: list.map((i) => i.id) }));
  const hover = useDragging((fromId, toId) => setItems((list) => moved(list, fromId, toId)));
  const drag = {
    ...hover,
    stop: () => {
      hover.stop();
      if (latest.current.map((i) => i.id).join() !== task.items.map((i) => i.id).join()) order(latest.current);
    },
  };

  const tick = (item: TaskItem) => {
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)));
    call(() => api.patch<Task>(`${base}/${item.id}`, { done: !item.done }));
  };

  const add = () => {
    const label = adding.trim();
    if (!label) return;
    setAdding('');
    call(() => api.post<Task>(base, { label }));
  };

  const { done, total } = progress({ items });

  return (
    <div className="field">
      <label>
        Checklist
        {total > 0 && (
          <span className={done === total ? 'badge ok num' : 'badge num'} style={{ marginLeft: 8 }}>
            {done}/{total}
          </span>
        )}
      </label>

      {total > 0 && (
        <div className="rows" style={{ gap: 4 }}>
          {items.map((item, at) => (
            <DropRow key={item.id} id={item.id} drag={drag} className={drag.id === item.id ? 'check-item in-flight' : 'check-item'}>
              <Grip
                id={item.id}
                drag={drag}
                label={item.label}
                onUp={at > 0 ? () => order(nudged(items, item.id, -1)) : null}
                onDown={at < items.length - 1 ? () => order(nudged(items, item.id, 1)) : null}
              />
              <input
                type="checkbox"
                checked={item.done}
                aria-label={item.done ? `Untick ${item.label}` : `Tick ${item.label}`}
                onChange={() => tick(item)}
              />
              <ItemLabel
                item={item}
                onRename={(label) => call(() => api.patch<Task>(`${base}/${item.id}`, { label }))}
              />
              <button
                className="btn ghost icon sm"
                aria-label={`Remove ${item.label}`}
                onClick={() => call(() => api.del<Task>(`${base}/${item.id}`))}
              >
                <Icon name="x" size={12} />
              </button>
            </DropRow>
          ))}
        </div>
      )}

      <input
        className="input"
        value={adding}
        placeholder={total ? 'Add a line' : 'Split it into lines to tick — press Enter after each'}
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        style={{ marginTop: total ? 6 : 0 }}
      />

      {total > 0 && done === total && task.state !== 'done' && (
        <div className="hint row" style={{ gap: 8 }}>
          <span style={{ flex: 1 }}>Every line is ticked.</span>
          <button
            className="btn sm"
            onClick={() => call(() => api.patch<Task>(`/api/tasks/${task.id}`, { state: 'done' }))}
          >
            <Icon name="check" size={12} /> Mark the task done
          </button>
        </div>
      )}
    </div>
  );
}

/** Une ligne qu'on renomme en cliquant dessus, et qui s'enregistre en la quittant. */
function ItemLabel({ item, onRename }: { item: TaskItem; onRename: (label: string) => void }) {
  const [label, setLabel] = useState(item.label);
  return (
    <input
      className="check-item-label"
      value={label}
      style={{ textDecoration: item.done ? 'line-through' : undefined }}
      title={item.done && item.doneByName ? `Ticked by ${item.doneByName}` : undefined}
      onChange={(e) => setLabel(e.target.value)}
      onBlur={() => {
        const clean = label.trim();
        if (!clean) setLabel(item.label);
        else if (clean !== item.label) onRename(clean);
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}
