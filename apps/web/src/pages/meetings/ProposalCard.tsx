/**
 * Une tâche proposée par l'IA, en une ligne : son intitulé, puis qui, quand,
 * quel programme, quelle priorité — chacun modifiable sur place. ✓ l'ajoute à
 * Tasks, ✕ l'écarte. Sans responsable, ✓ attend qu'on en choisisse un.
 */
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, type MeetingSuggestion, type TaskPriority } from '@ceed/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../ui/Icon';
import './meetings.css';

export function ProposalCard({
  s,
  members,
  editions,
  me,
  canWrite,
  busy,
  onPatch,
  onAccept,
  onDismiss,
}: {
  s: MeetingSuggestion;
  members: { id: string; name: string }[];
  editions: { id: string; name: string }[];
  me: string;
  canWrite: boolean;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => void;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const [title, setTitle] = useState(s.title);
  const [description, setDescription] = useState(s.description);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setTitle(s.title);
    setDescription(s.description);
  }, [s.title, s.description]);
  const done = s.status === 'created';
  const editable = canWrite && !done && s.status !== 'dismissed';
  const noOne = !s.assigneeId;

  return (
    <div className={`prop p-${s.priority}${done || s.status === 'dismissed' ? ' done' : ''}`}>
      <div className="prop-main">
        <input
          className="prop-title"
          value={title}
          disabled={!editable}
          placeholder="What has to be done"
          aria-label="Task title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== s.title && onPatch({ title })}
        />
        <div className="prop-chips">
          <span className={noOne && editable ? 'chip warn' : 'chip'} title="Assigned to">
            <Icon name="users" size={12} />
            <select disabled={!editable} value={s.assigneeId ?? ''} onChange={(e) => onPatch({ assigneeId: e.target.value || null })} aria-label="Assigned to">
              <option value="">Assign someone</option>
              {members.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {editable && s.assigneeId !== me && (
              <button className="linkish" style={{ fontSize: 11.5 }} onClick={() => onPatch({ assigneeId: me })}>me</button>
            )}
          </span>
          <span className="chip" title="Due date">
            <Icon name="calendar" size={12} />
            <input type="date" disabled={!editable} value={s.dueOn ?? ''} onChange={(e) => onPatch({ dueOn: e.target.value || null })} aria-label="Due date" />
          </span>
          <span className="chip" title="Related program">
            <Icon name="layers" size={12} />
            <select disabled={!editable} value={s.editionId ?? ''} onChange={(e) => onPatch({ editionId: e.target.value || null })} aria-label="Related program">
              <option value="">No program</option>
              {editions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </span>
          <span className={s.priority === 'high' ? 'chip stop' : 'chip'} title="Priority">
            <select disabled={!editable} value={s.priority} onChange={(e) => onPatch({ priority: e.target.value as TaskPriority })} aria-label="Priority">
              {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
            </select>
          </span>
          {s.needsReview && <span className="badge warn" title={s.reviewReason}>Needs review</span>}
          {s.duplicate && <span className="badge warn">Possible duplicate</span>}
          {s.status === 'failed' && <span className="badge stop">Not created</span>}
          {done && s.task && (
            <span className="badge ok">
              <Icon name="check" size={11} /> <Link to={`/tasks?task=${s.task.id}`}>In Tasks</Link>
            </span>
          )}
          {s.status === 'dismissed' && <span className="badge">Dismissed</span>}
          <button className="linkish prop-more" onClick={() => setOpen(!open)}>{open ? 'Less' : 'Details'}</button>
        </div>

        {noOne && editable && (
          <span className="prop-note warn">{s.assigneeSaid ? `“${s.assigneeSaid}” — ` : ''}{s.assigneeNote || 'Assign someone to add it.'}</span>
        )}
        {s.status === 'failed' && s.error && <span className="prop-note warn">{s.error}</span>}
        {s.duplicate && (
          <span className="prop-note warn">
            Looks like <Link to={`/tasks?task=${s.duplicate.id}`}>{s.duplicate.title}</Link>
            {s.duplicate.ownerName && ` (${s.duplicate.ownerName})`} — dismiss it, or add it anyway.
          </span>
        )}

        {open && (
          <div className="stack" style={{ gap: 6 }}>
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
            {s.sourceExcerpt && <span className="prop-note">Source — “{s.sourceExcerpt}”</span>}
            {s.dueNote && <span className="prop-note">Date — {s.dueNote}</span>}
            {s.needsReview && s.reviewReason && <span className="prop-note">To review — {s.reviewReason}</span>}
            {s.assigneeId && s.assigneeNote && <span className="prop-note">{s.assigneeNote}</span>}
          </div>
        )}
      </div>

      {editable && (
        <div className="prop-actions">
          <button
            className="prop-act ok"
            disabled={busy || noOne || !title.trim()}
            title={noOne ? 'Assign someone first' : 'Add to Tasks'}
            aria-label="Add to Tasks"
            onClick={onAccept}
          >
            <Icon name="check" size={16} />
          </button>
          <button className="prop-act no" disabled={busy} title="Dismiss" aria-label="Dismiss" onClick={onDismiss}>
            <Icon name="x" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
