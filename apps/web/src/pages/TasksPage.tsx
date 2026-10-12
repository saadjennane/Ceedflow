/**
 * Qui fait quoi, d'ici quand.
 *
 * La page que l'entrée « Tasks » promettait depuis le début de la barre
 * latérale. Trois choses à y faire et pas une de plus : voir ce qui est en
 * retard, donner une tâche, cocher celles qui sont faites.
 *
 * Les retards d'abord, et en haut : une liste triée par date d'échéance
 * enterre le dépassé sous ce qui vient, alors que c'est lui qu'on ouvre la
 * page pour trouver.
 */
import { isLate, type Task } from '@ceed/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import { SearchBox } from '../ui/SearchBox';
import { useToast } from '../ui/Overlays';
import { TaskModal } from '../ui/TaskModal';
import '../ui/builder.css';
import '../ui/directory.css';

export function TasksPage() {
  const tasks = useAsync(() => api.get<Task[]>('/api/tasks?open=all'), 'tasks');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const toast = useToast();

  const all = tasks.data ?? [];
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all
      .filter((t) => (showDone ? true : t.state === 'open'))
      .filter(
        (t) =>
          !needle ||
          [t.title, t.detail, t.ownerName, t.aboutName].join(' ').toLowerCase().includes(needle),
      );
  }, [all, query, showDone]);

  const late = rows.filter((t) => isLate(t));
  const rest = rows.filter((t) => !isLate(t));

  const tick = async (task: Task) => {
    try {
      await api.patch(`/api/tasks/${task.id}`, { state: task.state === 'done' ? 'open' : 'done' });
      tasks.reload();
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  return (
    <>
      <header className="topbar">
        <h1>Tasks</h1>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> Give a task
        </button>
      </header>

      <div className="page stack" style={{ gap: 14 }}>
        <div className="row wrap">
          <SearchBox value={query} onChange={setQuery} placeholder="Search a task, a name" />
          <span className="faint num" style={{ fontSize: 12.5 }}>
            {rows.filter((t) => t.state === 'open').length} open
          </span>
          <div className="spacer" />
          <label className="check">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            <span>Show what is done</span>
          </label>
        </div>

        {tasks.error && <div className="empty">{tasks.error}</div>}

        {!all.length && !tasks.error && (
          <div className="empty" style={{ padding: 26 }}>
            <h3>Nothing is being asked of anybody</h3>
            <p>
              A task is what the funnel cannot deduce: a document to chase, a jury to convene, a colleague to ask.
              What a startup owes is already on its own page.
            </p>
          </div>
        )}

        {late.length > 0 && (
          <section className="card">
            <div className="rowcard-head" style={{ padding: '11px 14px' }}>
              <strong style={{ flex: 1, fontFamily: 'var(--display)', fontSize: 13.5, color: 'var(--stop)' }}>
                Late
              </strong>
              <span className="badge warn num">{late.length}</span>
            </div>
            <div className="rows" style={{ padding: 10 }}>
              {late.map((task) => (
                <Row key={task.id} task={task} onTick={() => tick(task)} />
              ))}
            </div>
          </section>
        )}

        {rest.length > 0 && (
          <section className="card">
            <div className="rows" style={{ padding: 10 }}>
              {rest.map((task) => (
                <Row key={task.id} task={task} onTick={() => tick(task)} />
              ))}
            </div>
          </section>
        )}
      </div>

      {adding && (
        <TaskModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            tasks.reload();
          }}
        />
      )}
    </>
  );
}

/** Une tâche, telle qu'on la lit dans une liste. */
export function Row({ task, onTick }: { task: Task; onTick: () => void }) {
  const done = task.state === 'done';
  return (
    <div className="rowcard row" style={{ gap: 11, padding: '10px 12px' }}>
      {/* La case d'abord : c'est le geste pour lequel on ouvre la page. */}
      <input
        type="checkbox"
        checked={done}
        aria-label={done ? `Reopen ${task.title}` : `Done: ${task.title}`}
        onChange={onTick}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 13, textDecoration: done ? 'line-through' : undefined }}>
          {task.title}
        </span>
        <span className="faint" style={{ display: 'block', fontSize: 12 }}>
          {[
            task.ownerName,
            task.aboutName && task.aboutName !== task.ownerName ? `· ${task.aboutName}` : null,
            task.detail || null,
          ]
            .filter(Boolean)
            .join(' ')}
        </span>
        {/* Par qui, et pas seulement « fait ».
            C'est le sens même d'une tâche confiée à une société : tout le monde
            sur sa page la voit, n'importe lequel d'entre eux la coche, et sans
            ce nom « fait » ne dit pas qui l'a faite. */}
        {done && (task.doneByName || task.doneAt) && (
          <span className="faint" style={{ display: 'block', fontSize: 11.5 }}>
            Done{task.doneByName ? ` by ${task.doneByName}` : ''}
            {task.doneAt ? ` · ${formatDate(task.doneAt)}` : ''}
          </span>
        )}
      </span>
      {/* Prévenu ou non : sans ça, « je ne savais pas » et « je n'ai rien reçu »
          sont deux phrases que personne ne peut départager. */}
      {task.toldAt ? (
        <span className="faint" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }} title={`Written to on ${formatDate(task.toldAt)}`}>
          <Icon name="send" size={11} /> Told
        </span>
      ) : (
        <span className="faint" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }} title="Nobody was written to about this one">
          Not told
        </span>
      )}
      {task.editionId && (
        <Link className="btn ghost sm" to={`/editions/${task.editionId}`}>
          <Icon name="layers" size={13} />
        </Link>
      )}
      {task.recordId && (
        <Link className="btn ghost sm" to={`/directory/${task.recordId}`}>
          <Icon name="chevronRight" size={13} />
        </Link>
      )}
      <span
        className={isLate(task) ? 'badge warn' : 'badge'}
        style={{ whiteSpace: 'nowrap', visibility: task.dueOn ? undefined : 'hidden' }}
      >
        {task.dueOn ? formatDate(task.dueOn) : '—'}
      </span>
    </div>
  );
}
