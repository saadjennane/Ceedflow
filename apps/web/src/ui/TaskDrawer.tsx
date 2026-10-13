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
import { BOARD_COLUMNS, isLate, type Task, type TaskState } from '@ceed/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Icon } from './Icon';
import { ConfirmDialog, Drawer, useToast } from './Overlays';

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
  const toast = useToast();

  const save = async (patch: Partial<{ title: string; detail: string; dueOn: string | null; state: TaskState }>) => {
    try {
      const saved = await api.patch<Task>(`/api/tasks/${task.id}`, patch);
      setTask(saved);
      onChanged(saved);
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  /* Un intitulé vidé ne s'enregistre pas : il revient à ce qu'il était. */
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

  return (
    <>
      <Drawer
        title={task.title}
        subtitle={[task.ownerName, task.aboutName && task.aboutName !== task.ownerName ? task.aboutName : null]
          .filter(Boolean)
          .join(' · ')}
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
                onClick={() => task.state !== col.state && save({ state: col.state })}
              >
                {col.label}
              </button>
            ))}
          </div>
          {task.state === 'done' && (task.doneByName || task.doneAt) && (
            <div className="hint">
              Done{task.doneByName ? ` by ${task.doneByName}` : ''}
              {task.doneAt ? ` · ${formatDate(task.doneAt)}` : ''}
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="task-title">Task</label>
          <input
            id="task-title"
            className="input"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            onBlur={leaveTitle}
          />
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

        <div className="field">
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

        {/* Ce qui ne se change pas ici, mais se lit : à qui, à propos de quoi,
            qui l'a demandée, et si la personne le sait. */}
        <div className="field">
          <label>Owner</label>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ flex: 1 }}>{task.ownerName}</span>
            <Link className="btn ghost sm" to={`/directory/${task.ownerId}`} onClick={onClose}>
              <Icon name="chevronRight" size={13} />
            </Link>
          </div>
        </div>

        {task.aboutName && (
          <div className="field">
            <label>Link</label>
            <div className="row" style={{ gap: 8 }}>
              <span style={{ flex: 1 }}>{task.aboutName}</span>
              {task.editionId && (
                <Link className="btn ghost sm" to={`/editions/${task.editionId}`} onClick={onClose}>
                  <Icon name="layers" size={13} />
                </Link>
              )}
              {task.recordId && (
                <Link className="btn ghost sm" to={`/directory/${task.recordId}`} onClick={onClose}>
                  <Icon name="chevronRight" size={13} />
                </Link>
              )}
            </div>
          </div>
        )}

        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          {task.createdByName ? `Given by ${task.createdByName}` : 'Given'} · {formatDate(task.createdAt)}
          {' · '}
          {task.toldAt ? `told on ${formatDate(task.toldAt)}` : 'nobody was written to'}
        </p>
      </Drawer>

      {removing && (
        <ConfirmDialog
          title="Delete this task?"
          body={`“${task.title}” disappears for ${task.ownerName} too. To keep a trace, mark it done instead.`}
          confirmLabel="Delete"
          destructive
          onConfirm={remove}
          onClose={() => setRemoving(false)}
        />
      )}
    </>
  );
}
