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
import { BOARD_COLUMNS, byUrgency, isLate, isOpen, progress, taskPeople, type MeetingBacklog, type MeetingOptions, type ProgramWithEditions, type Task, type TaskState } from '@ceed/shared';
import { useMemo, useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import { SearchBox } from '../ui/SearchBox';
import { useToast } from '../ui/Overlays';
import { TaskDrawer } from '../ui/TaskDrawer';
import { TaskModal } from '../ui/TaskModal';
import { ExtractTasksModal, MeetingBacklogView, MeetingHistory } from './meetings/MeetingExtract';
import { useAccount } from '../lib/account';
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
  /* « View task » depuis l'assistant de réunion : la tâche s'ouvre directement. */
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('task'));
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'meetings' ? 'meetings' : params.get('tab') === 'backlog' ? 'backlog' : 'tasks';
  const setTab = (t: 'tasks' | 'backlog' | 'meetings') => setParams(t === 'tasks' ? {} : { tab: t });
  /* Le nombre de propositions en attente, sur l'onglet : ce qui attend une décision se voit. */
  const waiting = useAsync(() => api.get<MeetingBacklog>('/api/meeting-assistant/backlog'), `backlog-count:${tab}`);
  const me = useAccount().me;
  const [extracting, setExtracting] = useState(false);
  /* Ce qui m'attend : une tâche à débloquer, ou à valider. */
  const waitingForMe = useAsync(() => api.get<Task[]>('/api/tasks/waiting'), `tasks-waiting:${tasks.data?.length ?? 0}`);
  const toast = useToast();

  const [byOwner, setByOwner] = useState(() => {
    try {
      return localStorage.getItem('ceed.taskByOwner') === '1';
    } catch {
      return false;
    }
  });
  const setByOwnerMode = (next: boolean) => {
    setByOwner(next);
    try {
      localStorage.setItem('ceed.taskByOwner', next ? '1' : '0');
    } catch {
      /* rien à retenir, tant pis */
    }
  };

  const setViewMode = (next: View) => {
    setView(next);
    try {
      localStorage.setItem('ceed.taskView', next);
    } catch {
      /* rien à retenir, tant pis */
    }
  };

  const all = tasks.data ?? [];
  /* Filtrer par owner et par programme — gardé dans l'adresse, pour se partager une vue. */
  const options = useAsync(() => api.get<MeetingOptions>('/api/meeting-assistant/options'), 'meeting-options');
  const programs = useAsync(() => api.get<ProgramWithEditions[]>('/api/programs'), 'tasks-programs');
  const ownerFilter = params.get('owner') ?? '';
  const programFilter = params.get('program') ?? '';
  const setFilter = (key: 'owner' | 'program', value: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  const meId = options.data?.me ?? '';
  const ownerId = ownerFilter === 'me' ? meId : ownerFilter;
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all
      .filter((t) => !ownerId || t.owners.some((o) => o.id === ownerId) || t.delegate?.id === ownerId)
      .filter((t) =>
        !programFilter ||
        (programFilter.startsWith('p:') ? t.programId === programFilter.slice(2) : t.inEditionId === programFilter.slice(2)),
      )
      .filter((t) => (showDone || view === 'board' ? true : isOpen(t)))
      .filter(
        (t) =>
          !needle ||
          [t.title, t.detail, taskPeople(t), t.aboutName].join(' ').toLowerCase().includes(needle),
      );
  }, [all, query, showDone, view, ownerId, programFilter]);

  const opened = all.find((t) => t.id === openId) ?? null;
  /* En retard d'abord ; puis le plus prioritaire, puis le plus proche. */
  const late = rows.filter((t) => isLate(t)).sort(byUrgency);
  const rest = rows.filter((t) => !isLate(t)).sort((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || byUrgency(a, b));

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
    /* Bloquée ou à valider : il faut une raison et une personne — la tâche s'ouvre pour les demander. */
    if (state === 'stuck' || state === 'to_validate') {
      setOpenId(task.id);
      toast(state === 'stuck' ? 'Click “Stuck”: say what blocks it, and who can unblock it.' : 'Click “To validate”: choose who validates it.');
      return;
    }
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
        <button className="btn" onClick={() => setExtracting(true)} title="Paste meeting notes: the AI proposes the tasks, you confirm">
          <Icon name="send" size={13} /> AI Extract Tasks
        </button>
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> Task
        </button>
      </header>

      <nav className="tabbar" role="tablist" aria-label="Tasks">
        <button role="tab" aria-selected={tab === 'tasks'} className={tab === 'tasks' ? 'tab on' : 'tab'} onClick={() => setTab('tasks')}>
          Tasks
        </button>
        <button role="tab" aria-selected={tab === 'backlog'} className={tab === 'backlog' ? 'tab on' : 'tab'} onClick={() => setTab('backlog')}>
          Backlog {waiting.data && waiting.data.items.length > 0 && <span className="nav-count">{waiting.data.items.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'meetings'} className={tab === 'meetings' ? 'tab on' : 'tab'} onClick={() => setTab('meetings')}>
          Meeting History
        </button>
      </nav>

      {extracting && <ExtractTasksModal onClose={() => setExtracting(false)} />}

      {tab === 'meetings' ? (
        <div className="page stack" style={{ gap: 14, maxWidth: 900 }}>
          <MeetingHistory canWrite={me?.account.staffRole === 'admin' || me?.account.staffRole === 'editor'} />
        </div>
      ) : tab === 'backlog' ? (
        <div className="page stack" style={{ gap: 14, maxWidth: 1000 }}>
          <MeetingBacklogView
            from={params.get('from') ?? ''}
            onCreated={() => {
              tasks.reload();
              waiting.reload();
            }}
          />
        </div>
      ) : (
      <div className="page stack" style={{ gap: 14 }}>
        <div className="row wrap">
          <SearchBox value={query} onChange={setQuery} placeholder="Search a task, a name" />
          {/* Les owners en pastilles : on voit l'équipe, un clic filtre, un second rend tout. */}
          <div className="row owner-pills" role="group" aria-label="Owner">
            <button className={!ownerFilter ? 'owner-pill all on' : 'owner-pill all'} aria-pressed={!ownerFilter} onClick={() => setFilter('owner', '')}>
              All
            </button>
            {(options.data?.members ?? []).map((m) => {
              const on = ownerId === m.id;
              return (
                <button
                  key={m.id}
                  className={on ? 'owner-pill on' : 'owner-pill'}
                  aria-pressed={on}
                  aria-label={m.id === meId ? `${m.name} (me)` : m.name}
                  title={m.id === meId ? `${m.name} (me)` : m.name}
                  onClick={() => setFilter('owner', on ? '' : m.id)}
                >
                  <Avatar person={m} size={30} />
                </button>
              );
            })}
          </div>
          <select className="select" style={{ width: 'auto', maxWidth: 260 }} value={programFilter} onChange={(e) => setFilter('program', e.target.value)} aria-label="Programme">
            <option value="">Every programme</option>
            {(programs.data ?? []).map((p) => (
              <optgroup key={p.id} label={p.name}>
                <option value={`p:${p.id}`}>{p.name} — all editions</option>
                {p.editions.map((e) => <option key={e.id} value={`e:${e.id}`}>{e.name}</option>)}
              </optgroup>
            ))}
          </select>
          <span className="faint num" style={{ fontSize: 12.5 }}>
            {rows.filter((t) => isOpen(t)).length} open
          </span>
          <div className="spacer" />
          {view === 'board' && (
            <label className="check">
              <input type="checkbox" checked={byOwner} onChange={(e) => setByOwnerMode(e.target.checked)} />
              <span>Group by owner</span>
            </label>
          )}
          {/* Le tableau a sa colonne Done : la case n'y aurait rien à cacher. */}
          {view === 'list' && (
            <label className="check">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
              <span>Show what is done</span>
            </label>
          )}
        </div>

        {all.length > 0 && <TaskStats tasks={rows} meId={meId} />}

        {waitingForMe.data && waitingForMe.data.length > 0 && (
          <section className="card card-pad stack" style={{ gap: 6, borderColor: 'var(--warn)' }}>
            <strong style={{ fontFamily: 'var(--display)', fontSize: 13.5 }}>Waiting for you</strong>
            {waitingForMe.data.map((t) => (
              <button key={t.id} className="linkish row" style={{ gap: 8, textAlign: 'left', fontSize: 13 }} onClick={() => setOpenId(t.id)}>
                <span className={t.state === 'stuck' ? 'badge stop' : 'badge warn'}>{t.state === 'stuck' ? 'Unblock' : 'Validate'}</span>
                <span style={{ flex: 1 }}>{t.title}</span>
                <span className="faint" style={{ fontSize: 12 }}>{taskPeople(t)}</span>
              </button>
            ))}
          </section>
        )}

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

        {view === 'board' && all.length > 0 && !byOwner && <Board tasks={rows} onMove={move} onOpen={(t) => setOpenId(t.id)} />}
        {/* Par owner : une rangée chacun, ses tâches dans les mêmes colonnes. Une tâche partagée est dans chaque rangée. */}
        {view === 'board' && all.length > 0 && byOwner &&
          owners(rows).map((o) => (
            <section key={o.id} className="stack" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8 }}>
                <Avatar person={o} size={28} />
                <strong style={{ fontFamily: 'var(--display)', fontSize: 14 }}>{o.name}</strong>
                <span className="faint num" style={{ fontSize: 12.5 }}>
                  {rows.filter((t) => isOpen(t) && t.owners.some((x) => x.id === o.id)).length} open
                </span>
              </div>
              <Board tasks={rows.filter((t) => t.owners.some((x) => x.id === o.id))} onMove={move} onOpen={(t) => setOpenId(t.id)} />
            </section>
          ))}

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
      )}

      {opened && (
        <TaskDrawer
          key={opened.id}
          task={opened}
          onClose={() => setOpenId(null)}
          onChanged={(saved) => {
            tasks.set(saved ? all.map((t) => (t.id === saved.id ? saved : t)) : all.filter((t) => t.id !== opened.id));
            waitingForMe.reload();
          }}
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

/** Les owners des tâches montrées, chacun une fois, dans l'ordre alphabétique. */
const owners = (tasks: Task[]) =>
  [...new Map(tasks.flatMap((t) => t.owners).map((o) => [o.id, o])).values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

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
            /* La description ne charge pas la liste : elle s'ouvre avec la tâche, et se lit au survol. */
            title={task.detail ? task.detail.slice(0, 600) : undefined}
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
        {task.priority === 'high' && <span className="badge stop" style={{ marginLeft: 7 }}>High</span>}
        {task.priority === 'low' && <span className="badge" style={{ marginLeft: 7 }}>Low</span>}
        {task.state === 'doing' && <span className="badge info" style={{ marginLeft: 7 }}>In progress</span>}
        {task.state === 'stuck' && <span className="badge stop" style={{ marginLeft: 7 }} title={task.stuckReason}>Stuck{task.unblocker ? ` · ${task.unblocker.name}` : ''}</span>}
        {task.state === 'to_validate' && <span className="badge warn" style={{ marginLeft: 7 }}>To validate{task.validator ? ` · ${task.validator.name}` : ''}</span>}
        {task.attachments > 0 && <span className="faint" style={{ marginLeft: 7, fontSize: 11.5 }} title="Attachments"><Icon name="file" size={11} /> {task.attachments}</span>}
        <span className="faint" style={{ display: 'block', fontSize: 12 }}>
          {[
            taskPeople(task),
            task.editionName ? `· ${task.editionName}` : null,
            task.subjectName ? `· ${task.subjectName}` : task.aboutName && !task.editionName ? `· ${task.aboutName}` : null,
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
  /* Une longue colonne se replie : les premières cartes, puis « + N more ». */
  const [unfolded, setUnfolded] = useState<Set<TaskState>>(new Set());
  const total = tasks.length || 1;

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
            : (a, b) => Number(isLate(b)) - Number(isLate(a)) || byUrgency(a, b),
        );
        const cap = col.state === 'done' ? 4 : 8;
        const open = unfolded.has(col.state);
        const shown = open ? cards : cards.slice(0, cap);
        const toggle = () =>
          setUnfolded((u) => {
            const next = new Set(u);
            if (next.has(col.state)) next.delete(col.state);
            else next.add(col.state);
            return next;
          });
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
              <div className="row" style={{ gap: 8 }}>
                <span className="task-col-dot" aria-hidden="true" />
                <strong>{col.label}</strong>
                <span className="task-col-count num">{cards.length}</span>
              </div>
              {/* Sa part du tout : où s'entasse le travail, d'un coup d'œil. */}
              <div className="task-col-bar" aria-hidden="true">
                <span style={{ width: `${cards.length ? Math.max(4, Math.round((cards.length / total) * 100)) : 0}%` }} />
              </div>
            </header>
            <div className="task-col-cards">
              {shown.map((task) => (
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
              {cards.length > cap && (
                <button className="task-col-more" onClick={toggle}>
                  {open ? 'Show less' : `+ ${cards.length - cap} more`}
                </button>
              )}
              {!cards.length && <div className="task-col-empty faint">Nothing here</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Des initiales sur une pastille, d'une couleur qui reste la même pour la même personne. */
const AVATAR_TINTS = ['#8fb0ff', '#ffc48a', '#7fe0bd', '#d8b4ff', '#ffd36e', '#9fe3f0', '#ffaec9', '#c3d98a'];
export function Avatar({ person, size = 26 }: { person: { id: string; name: string }; size?: number }) {
  const words = person.name.trim().split(/\s+/);
  const initials = ((words[0]?.[0] ?? '') + (words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '')).toUpperCase();
  let h = 0;
  for (const ch of person.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className="avatar"
      title={person.name}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: AVATAR_TINTS[h % AVATAR_TINTS.length] }}
    >
      {initials || '?'}
    </span>
  );
}

/** Une tâche, telle qu'on la lit sur un tableau : son programme, ce qui presse, qui la porte, ce qu'elle attend. */
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
  const late = isLate(task);
  const steps = progress(task);
  const programme = task.editionName ? task.editionName.split(' · ')[0] : '';
  return (
    <article
      className={`task-card${dragging ? ' dragging' : ''}${done ? ' done' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {(programme || task.priority !== 'medium') && (
        <div className="row wrap" style={{ gap: 6 }}>
          {programme && (
            <span className="task-tag" title={task.editionName}>
              <span className="task-tag-dot" style={{ background: task.programColour || 'var(--blue)' }} />
              {programme}
            </span>
          )}
          {task.priority === 'high' && <span className="task-prio high">High</span>}
          {task.priority === 'low' && <span className="task-prio">Low</span>}
        </div>
      )}
      <button className="task-title task-card-title" onClick={onOpen} title={task.detail ? task.detail.slice(0, 600) : undefined}>
        {task.title}
      </button>
      {(task.subjectName || task.delegate) && (
        <span className="faint task-card-sub">
          <Icon name="file" size={11} /> {[task.subjectName, task.delegate ? `with ${task.delegate.name}` : ''].filter(Boolean).join(' · ')}
        </span>
      )}
      {steps.total > 0 && (
        <div className="task-steps" title={`${steps.done} of ${steps.total} lines ticked`}>
          <div className="task-steps-bar"><span style={{ width: `${Math.round((steps.done / steps.total) * 100)}%` }} /></div>
          <span className="num">{steps.done}/{steps.total}</span>
        </div>
      )}
      {task.state === 'stuck' && (
        <div className="task-note stuck">
          <strong>{task.unblocker ? `Waiting on ${task.unblocker.name}` : 'Stuck'}</strong>
          {task.stuckReason && <span>{task.stuckReason}</span>}
        </div>
      )}
      {task.state === 'to_validate' && task.validator && (
        <div className="task-note validate">
          To validate by <strong>{task.validator.name}</strong>
        </div>
      )}
      {done && task.doneByName && (
        <span className="faint" style={{ fontSize: 11.5 }}>
          Done by {task.doneByName}
          {task.doneAt ? ` · ${formatDate(task.doneAt)}` : ''}
        </span>
      )}
      <div className="row task-card-foot">
        <div className="avatar-stack">
          {task.owners.map((o) => <Avatar key={o.id} person={o} />)}
        </div>
        <div className="spacer" />
        {task.attachments > 0 && (
          <span className="faint" style={{ fontSize: 11.5 }} title="Attachments">
            <Icon name="file" size={11} /> {task.attachments}
          </span>
        )}
        {task.dueOn && (
          <span className={`task-due${late ? ' late' : done ? ' done' : ''}`}>
            <Icon name="calendar" size={11} /> {formatDate(task.dueOn)}
          </span>
        )}
      </div>
      <div className="row task-card-tools">
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
        <div className="spacer" />
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

/** Les chiffres du moment, sur ce qui est filtré : ce qui est ouvert, en retard, bloqué, à valider, à rendre cette semaine. */
function TaskStats({ tasks, meId }: { tasks: Task[]; meId: string }) {
  const open = tasks.filter((t) => isOpen(t));
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const sunday = new Date(today);
  sunday.setDate(today.getDate() + ((7 - today.getDay()) % 7));
  const stuck = open.filter((t) => t.state === 'stuck');
  const toValidate = open.filter((t) => t.state === 'to_validate');
  const programmes = new Set(open.map((t) => t.programId).filter(Boolean)).size;
  const stats = [
    { key: 'open', label: 'Open', value: open.length, hint: programmes ? `across ${programmes} programme${programmes === 1 ? '' : 's'}` : '' },
    { key: 'late', label: 'Late', value: open.filter((t) => isLate(t)).length, hint: 'past their date' },
    { key: 'stuck', label: 'Stuck', value: stuck.length, hint: meId ? `${stuck.filter((t) => t.unblocker?.id === meId).length} waiting on you` : '' },
    { key: 'validate', label: 'To validate', value: toValidate.length, hint: meId ? `${toValidate.filter((t) => t.validator?.id === meId).length} by you` : '' },
    { key: 'week', label: 'Due this week', value: open.filter((t) => t.dueOn && t.dueOn >= iso(today) && t.dueOn <= iso(sunday)).length, hint: 'by Sunday' },
  ];
  return (
    <div className="task-stats">
      {stats.map((s) => (
        <div key={s.key} className="task-stat" data-kind={s.key}>
          <span className="task-stat-label">{s.label}</span>
          <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
            <span className="task-stat-value num">{s.value}</span>
            {s.hint && <span className="faint" style={{ fontSize: 12 }}>{s.hint}</span>}
          </div>
        </div>
      ))}
    </div>
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
