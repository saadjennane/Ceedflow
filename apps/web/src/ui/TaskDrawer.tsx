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
import { BOARD_COLUMNS, isLate, progress, type Task, type TaskItem, type TaskState } from '@ceed/shared';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Icon } from './Icon';
import { ConfirmDialog, Drawer, useToast } from './Overlays';
import { DropRow, Grip, moved, nudged, useDragging } from './Reorderable';

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

        <Checklist
          task={task}
          onSaved={(saved) => {
            setTask(saved);
            onChanged(saved);
          }}
        />

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
