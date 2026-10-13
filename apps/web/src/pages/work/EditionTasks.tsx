/**
 * Ce que l'édition attend de son monde.
 *
 * La même liste que la page Tasks, mais bornée à un programme et groupée par
 * destinataire : la question qu'on se pose ici n'est pas « qu'est-ce qui
 * traîne » mais « où en est chacun ».
 */
import { isLate, isOpen, type Task } from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlays';
import { TaskModal } from '../../ui/TaskModal';
import { Row } from '../TasksPage';

export function EditionTasks({ editionId, editionName }: { editionId: string; editionName: string }) {
  const tasks = useAsync(() => api.get<Task[]>(`/api/tasks?editionId=${editionId}&open=all`), `tasks:${editionId}`);
  const [giving, setGiving] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const toast = useToast();

  const all = (tasks.data ?? []).filter((t) => (showDone ? true : isOpen(t)));
  /* Par destinataire, et ceux qui ont du retard d'abord : c'est la personne
     qu'on va relancer, pas la tâche. */
  const byOwner = [...new Map(all.map((t) => [t.ownerId, t.ownerName])).entries()].sort((a, b) => {
    const lateOf = (id: string) => all.filter((t) => t.ownerId === id && isLate(t)).length;
    return lateOf(b[0]) - lateOf(a[0]) || a[1].localeCompare(b[1]);
  });

  const tick = async (task: Task) => {
    try {
      await api.patch(`/api/tasks/${task.id}`, { state: task.state === 'done' ? 'open' : 'done' });
      tasks.reload();
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  return (
    <div className="page stack" style={{ gap: 14 }}>
      <div className="row wrap">
        <p className="blurb faint" style={{ margin: 0, fontSize: 12.5, flex: 1 }}>
          What this edition is waiting on, by whoever owes it. A startup's own documents are in Deliverables — this is
          everything else.
        </p>
        <label className="check">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          <span>Show what is done</span>
        </label>
        <button className="btn primary sm" onClick={() => setGiving(true)}>
          <Icon name="plus" size={13} /> Task
        </button>
      </div>

      {!all.length && (
        <div className="empty" style={{ padding: 24 }}>
          <h3>Nothing is being asked on this edition</h3>
          <p>A task here reaches its team: CEED, the mentors, the jury, the startups.</p>
        </div>
      )}

      {byOwner.map(([ownerId, ownerName]) => {
        const theirs = all.filter((t) => t.ownerId === ownerId);
        const late = theirs.filter((t) => isLate(t)).length;
        return (
          <section className="card" key={ownerId}>
            <div className="rowcard-head" style={{ padding: '11px 14px' }}>
              <strong style={{ flex: 1, fontFamily: 'var(--display)', fontSize: 13.5 }}>{ownerName}</strong>
              {late > 0 && <span className="badge warn num">{late} late</span>}
              <span className="badge num">{theirs.filter((t) => isOpen(t)).length}</span>
            </div>
            <div className="rows" style={{ padding: 10 }}>
              {theirs.map((task) => (
                <Row key={task.id} task={task} onTick={() => tick(task)} />
              ))}
            </div>
          </section>
        );
      })}

      {giving && (
        <TaskModal
          attach={{ editionId, about: editionName }}
          onClose={() => setGiving(false)}
          onSaved={() => {
            setGiving(false);
            tasks.reload();
          }}
        />
      )}
    </div>
  );
}
