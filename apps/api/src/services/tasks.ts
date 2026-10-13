/**
 * Les tâches, lues comme on les regarde.
 *
 * Une requête par écran et pas une par ligne : la page en liste des centaines,
 * et chacune a besoin du nom de son destinataire et de ce à quoi elle est
 * attachée. Les deux se joignent ici, une fois.
 */
import { idOf, OPEN_TASK_STATES, type Task } from '@ceed/shared';
import { all, one } from '../db/client.js';

const COLS = `
  select t.id, t.title, t.detail, t.due_on::text as "dueOn", t.state,
         t.owner_id as "ownerId", o.name as "ownerName", o.kind as "ownerKind",
         t.record_id as "recordId", t.edition_id as "editionId",
         t.block_id as "blockId", t.candidate_id as "candidateId",
         /* Ce à quoi elle est attachée, en un mot : la fiche, le programme,
            l'étape ou la startup — ce qui se lit sur une ligne de liste. */
         coalesce(r.name, co.name, b.name, p.name || ' · ' || e.name, '') as "aboutName",
         t.created_by_name as "createdByName", t.created_at::text as "createdAt",
         t.done_at::text as "doneAt", t.done_by_name as "doneByName",
         t.told_at::text as "toldAt"
    from tasks t
    /* Ce qui est à la corbeille n'est dans aucune liste — pas même dans celle
       des choses à faire. Une fiche restaurée retrouve ses tâches : elles ne
       sont pas supprimées, elles sortent de la vue avec elle. */
    join records o on o.id = t.owner_id and o.deleted_at is null
    left join records r  on r.id = t.record_id and r.deleted_at is null
    left join candidates c on c.id = t.candidate_id and c.deleted_at is null
    left join records co on co.id = c.org_id
    left join blocks b on b.id = t.block_id
    left join editions e on e.id = t.edition_id
    left join programs p on p.id = e.program_id`;

export interface TaskFilter {
  /** Ce qu'une personne doit faire : les siennes, et celles de ses sociétés. */
  ownerIds?: string[];
  editionId?: string;
  recordId?: string;
  /** Les closes restent lisibles, mais ne s'affichent pas d'elles-mêmes. */
  open?: boolean;
}

export async function listTasks(filter: TaskFilter = {}): Promise<Task[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.ownerIds?.length) {
    params.push(filter.ownerIds);
    where.push(`t.owner_id = any($${params.length}::text[])`);
  }
  if (filter.editionId) {
    params.push(filter.editionId);
    /* Liée à l'édition, ou à l'une de ses startups : « ce que cette édition
       attend » comprend ce qu'on a demandé pour Rafid Tech, sinon la tâche
       n'est visible que depuis la fiche de la startup. */
    where.push(`(t.edition_id = $${params.length} or c.edition_id = $${params.length})`);
  }
  if (filter.recordId) {
    params.push(filter.recordId);
    /* Attachée à cette fiche, ou confiée à elle : sur la page de quelqu'un,
       les deux sont « ce qui la concerne ». */
    where.push(`(t.record_id = $${params.length} or t.owner_id = $${params.length})`);
  }
  if (filter.open) {
    params.push(OPEN_TASK_STATES);
    where.push(`t.state = any($${params.length}::text[])`);
  }
  const sql = `${COLS} ${where.length ? `where ${where.join(' and ')}` : ''}
    order by t.state = 'done', t.due_on nulls last, t.created_at`;
  return all<Task>(sql, params);
}

export const getTask = (id: string) => one<Task>(`${COLS} where t.id = $1`, [id]);

export async function createTasks(
  input: {
    title: string; detail: string; dueOn: string | null; ownerIds: string[];
    recordId: string | null; editionId: string | null; blockId: string | null; candidateId: string | null;
  },
  by: { id: string; name: string } | null,
): Promise<Task[]> {
  const made: Task[] = [];
  /* Une tâche par destinataire : « fait » doit pouvoir nommer quelqu'un. */
  for (const ownerId of [...new Set(input.ownerIds)]) {
    const id = idOf.task();
    await all(
      `insert into tasks (id, title, detail, due_on, owner_id, record_id, edition_id, block_id, candidate_id,
                          created_by, created_by_name)
       values ($1,$2,$3,nullif($4,'')::date,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id, input.title.trim(), input.detail.trim(), input.dueOn ?? '', ownerId,
        input.recordId, input.editionId, input.blockId, input.candidateId,
        by?.id ?? null, by?.name ?? '',
      ],
    );
    const task = await getTask(id);
    if (task) made.push(task);
  }
  return made;
}

export async function changeTask(
  id: string,
  patch: { state?: string; title?: string; detail?: string; dueOn?: string | null },
  by: { id: string; name: string } | null,
): Promise<Task | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  const put = (sql: string, value: unknown) => {
    params.push(value);
    sets.push(sql.replace('$n', `$${params.length}`));
  };
  if (patch.title !== undefined) put('title = $n', patch.title.trim());
  if (patch.detail !== undefined) put('detail = $n', patch.detail.trim());
  if (patch.dueOn !== undefined) put("due_on = nullif($n, '')::date", patch.dueOn ?? '');
  if (patch.state !== undefined) {
    put('state = $n', patch.state);
    /* Qui l'a close et quand, posés avec l'état plutôt que déduits : une tâche
       rouverte puis refermée doit dire la dernière main, pas la première.
       Passer de « à faire » à « en cours » ou « bloquée » ne la close pas. */
    if ((OPEN_TASK_STATES as readonly string[]).includes(patch.state)) {
      sets.push('done_at = null', "done_by = null", "done_by_name = ''");
    } else {
      sets.push('done_at = now()');
      put('done_by = $n', by?.id ?? null);
      put('done_by_name = $n', by?.name ?? '');
    }
  }
  if (sets.length) await all(`update tasks set ${sets.join(', ')} where id = $1`, params);
  return getTask(id);
}

export const dropTask = async (id: string): Promise<void> => {
  await all('delete from tasks where id = $1', [id]);
};
