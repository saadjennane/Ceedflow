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
 *
 * Et une seconde lecture, en tableau : où en est chaque chose, plutôt que
 * pour quand. La liste répond à « qu'est-ce qui presse », le tableau à
 * « qu'est-ce qui coince » — d'où la colonne Stuck.
 */
import { BOARD_COLUMNS, byDue, isLate, isOpen, progress, type Task, type TaskState } from '@ceed/shared';
import { useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import { SearchBox } from '../ui/SearchBox';
import { useToast } from '../ui/Overlays';
import { TaskDrawer } from '../ui/TaskDrawer';
import { TaskModal } from '../ui/TaskModal';
import '../ui/builder.css';
import '../ui/directory.css';

type View = 'list' | 'board';

/* Retenue par navigateur, comme celle des programmes. Un stockage refusé
   (navigation privée) ne doit pas empêcher la page de s'ouvrir. */
const savedView = (): View => {
  try {
    return localStorage.getItem('ceed.taskView') === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
};

export function TasksPage() {
  const tasks = useAsync(() => api.get<Task[]>('/api/tasks?open=all'), 'tasks');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [view, setView] = useState<View>(savedView);
  const [openId, setOpenId] = useState<string | null>(null);
  const toast = useToast();

  const setViewMode = (next: View) => {
    setView(next);
    try {
      localStorage.setItem('ceed.taskView', next);
    } catch {
      /* rien à retenir, tant pis */
    }
  };

  const all = tasks.data ?? [];
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all
      .filter((t) => (showDone || view === 'board' ? true : isOpen(t)))
      .filter(
        (t) =>
          !needle ||
          [t.title, t.detail, t.ownerName, t.aboutName].join(' ').toLowerCase().includes(needle),
      );
  }, [all, query, showDone, view]);

  const opened = all.find((t) => t.id === openId) ?? null;
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

  /* La carte change de colonne tout de suite, et revient si le serveur dit
     non : attendre la réponse pour la voir bouger rend le geste hésitant. */
  const move = async (task: Task, state: TaskState) => {
    if (task.state === state) return;
    const before = all;
    tasks.set(all.map((t) => (t.id === task.id ? { ...t, state } : t)));
    try {
      const saved = await api.patch<Task>(`/api/tasks/${task.id}`, { state });
      tasks.set(before.map((t) => (t.id === task.id ? saved : t)));
    } catch (err) {
      tasks.set(before);
      toast((err as Error).message, true);
    }
  };

  return (
    <>
      <header className="topbar">
        <h1>Tasks</h1>
        <div className="spacer" />
        <div className="seg" role="group" aria-label="View">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setViewMode('list')}>
            <Icon name="list" size={13} /> List
          </button>
          <button className={view === 'board' ? 'on' : ''} onClick={() => setViewMode('board')}>
            <Icon name="board" size={13} /> Board
          </button>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> Task
        </button>
      </header>

      <div className="page stack" style={{ gap: 14 }}>
        <div className="row wrap">
          <SearchBox value={query} onChange={setQuery} placeholder="Search a task, a name" />
          <span className="faint num" style={{ fontSize: 12.5 }}>
            {rows.filter((t) => isOpen(t)).length} open
          </span>
          <div className="spacer" />
          {/* Le tableau a sa colonne Done : la case n'y aurait rien à cacher. */}
          {view === 'list' && (
            <label className="check">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
              <span>Show what is done</span>
            </label>
          )}
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

        {view === 'board' && all.length > 0 && <Board tasks={rows} onMove={move} onOpen={(t) => setOpenId(t.id)} />}

        {view === 'list' && late.length > 0 && (
          <section className="card">
            <div className="rowcard-head" style={{ padding: '11px 14px' }}>
              <strong style={{ flex: 1, fontFamily: 'var(--display)', fontSize: 13.5, color: 'var(--stop)' }}>
                Late
              </strong>
              <span className="badge warn num">{late.length}</span>
            </div>
            <div className="rows" style={{ padding: 10 }}>
              {late.map((task) => (
                <Row key={task.id} task={task} onTick={() => tick(task)} onOpen={() => setOpenId(task.id)} />
              ))}
            </div>
          </section>
        )}

        {view === 'list' && rest.length > 0 && (
          <section className="card">
            <div className="rows" style={{ padding: 10 }}>
              {rest.map((task) => (
                <Row key={task.id} task={task} onTick={() => tick(task)} onOpen={() => setOpenId(task.id)} />
              ))}
            </div>
          </section>
        )}
      </div>

      {opened && (
        <TaskDrawer
          key={opened.id}
          task={opened}
          onClose={() => setOpenId(null)}
          onChanged={(saved) =>
            tasks.set(saved ? all.map((t) => (t.id === saved.id ? saved : t)) : all.filter((t) => t.id !== opened.id))
          }
        />
      )}

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
export function Row({ task, onTick, onOpen }: { task: Task; onTick: () => void; onOpen?: () => void }) {
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
        {onOpen ? (
          <button
            className="task-title"
            style={{ textDecoration: done ? 'line-through' : undefined }}
            onClick={onOpen}
          >
            {task.title}
          </button>
        ) : (
          <span style={{ fontWeight: 600, fontSize: 13, textDecoration: done ? 'line-through' : undefined }}>
            {task.title}
          </span>
        )}
        <Progress task={task} />
        {task.state === 'doing' && <span className="badge info" style={{ marginLeft: 7 }}>In progress</span>}
        {task.state === 'stuck' && <span className="badge stop" style={{ marginLeft: 7 }}>Stuck</span>}
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

/**
 * Le tableau : une colonne par état, et une carte qu'on fait glisser.
 *
 * Les flèches de chaque carte font la même chose que le glisser, une colonne
 * à la fois : le glisser natif ne marche ni au doigt ni au clavier.
 */
function Board({
  tasks, onMove, onOpen,
}: {
  tasks: Task[];
  onMove: (task: Task, state: TaskState) => void;
  onOpen: (task: Task) => void;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<TaskState | null>(null);

  const drop = (state: TaskState) => (e: DragEvent) => {
    e.preventDefault();
    const task = tasks.find((t) => t.id === (dragged ?? e.dataTransfer.getData('text/plain')));
    if (task) onMove(task, state);
    setDragged(null);
    setOver(null);
  };

  return (
    <div className="task-board">
      {BOARD_COLUMNS.map((col, at) => {
        const cards = tasks.filter((t) => t.state === col.state);
        /* Ce qui est fini, le plus récent en haut ; le reste, le plus pressé. */
        cards.sort(
          col.state === 'done'
            ? (a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')
            : (a, b) => Number(isLate(b)) - Number(isLate(a)) || byDue(a, b),
        );
        return (
          <section
            key={col.state}
            className={`task-col${over === col.state ? ' over' : ''}`}
            data-state={col.state}
            onDragOver={(e) => {
              e.preventDefault();
              if (over !== col.state) setOver(col.state);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={drop(col.state)}
          >
            <header className="task-col-head">
              <strong>{col.label}</strong>
              <span className="badge num">{cards.length}</span>
            </header>
            <div className="task-col-cards">
              {cards.map((task) => (
                <Card
                  key={task.id}
                  task={task}
                  dragging={dragged === task.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', task.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragged(task.id);
                  }}
                  onDragEnd={() => {
                    setDragged(null);
                    setOver(null);
                  }}
                  prev={at > 0 ? BOARD_COLUMNS[at - 1] : undefined}
                  next={at < BOARD_COLUMNS.length - 1 ? BOARD_COLUMNS[at + 1] : undefined}
                  onMove={(state) => onMove(task, state)}
                  onOpen={() => onOpen(task)}
                />
              ))}
              {!cards.length && <div className="task-col-empty faint">Nothing here</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Une tâche, telle qu'on la lit sur un tableau. */
function Card({
  task, dragging, onDragStart, onDragEnd, prev, next, onMove, onOpen,
}: {
  task: Task;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  prev?: { state: TaskState; label: string };
  next?: { state: TaskState; label: string };
  onMove: (state: TaskState) => void;
  onOpen: () => void;
}) {
  const done = task.state === 'done';
  return (
    <article
      className={`task-card${dragging ? ' dragging' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <button className="task-title" style={{ textDecoration: done ? 'line-through' : undefined }} onClick={onOpen}>
        {task.title}
      </button>
      <span className="faint" style={{ fontSize: 12 }}>
        {[task.ownerName, task.aboutName && task.aboutName !== task.ownerName ? `· ${task.aboutName}` : null]
          .filter(Boolean)
          .join(' ')}
      </span>
      {done && task.doneByName && (
        <span className="faint" style={{ fontSize: 11.5 }}>
          Done by {task.doneByName}
          {task.doneAt ? ` · ${formatDate(task.doneAt)}` : ''}
        </span>
      )}
      <div className="row" style={{ gap: 4, marginTop: 2 }}>
        <Progress task={task} bare />
        {task.dueOn && (
          <span className={isLate(task) ? 'badge warn' : 'badge'} style={{ whiteSpace: 'nowrap' }}>
            {formatDate(task.dueOn)}
          </span>
        )}
        <div className="spacer" />
        {task.editionId && (
          <Link className="btn ghost sm" to={`/editions/${task.editionId}`} aria-label="Open the edition">
            <Icon name="layers" size={13} />
          </Link>
        )}
        {task.recordId && (
          <Link className="btn ghost sm" to={`/directory/${task.recordId}`} aria-label="Open the record">
            <Icon name="chevronRight" size={13} />
          </Link>
        )}
        {prev && (
          <button className="btn ghost sm" onClick={() => onMove(prev.state)} title={`Move to ${prev.label}`} aria-label={`Move to ${prev.label}`}>
            <Icon name="chevronLeft" size={13} />
          </button>
        )}
        {next && (
          <button className="btn ghost sm" onClick={() => onMove(next.state)} title={`Move to ${next.label}`} aria-label={`Move to ${next.label}`}>
            <Icon name="arrowRight" size={13} />
          </button>
        )}
      </div>
    </article>
  );
}

/** « 2/5 », vert quand tout est coché ; rien pour une tâche sans checklist. */
function Progress({ task, bare }: { task: Task; bare?: boolean }) {
  const { done, total } = progress(task);
  if (!total) return null;
  return (
    <span
      className={done === total ? 'badge ok num' : 'badge num'}
      style={{ marginLeft: bare ? 0 : 7, whiteSpace: 'nowrap' }}
      title={`${done} of ${total} lines ticked`}
    >
      <Icon name="check" size={11} /> {done}/{total}
    </span>
  );
}
