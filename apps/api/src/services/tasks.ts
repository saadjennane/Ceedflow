/**
 * Les tâches, lues comme on les regarde.
 *
 * Une requête par écran et pas une par ligne : la page en liste des centaines,
 * et chacune a besoin du nom de son destinataire et de ce à quoi elle est
 * attachée. Les deux se joignent ici, une fois.
 */
import { idOf, newId, OPEN_TASK_STATES, type Task, type TaskAttachment, type TaskEvent, type TaskItem } from '@ceed/shared';
import { all, one } from '../db/client.js';
import { HttpError } from '../routes/util.js';

const COLS = `
  select t.id, t.title, t.detail, t.due_on::text as "dueOn", t.state, t.priority,
         t.owner_id as "ownerId", o.name as "ownerName", o.kind as "ownerKind",
         t.record_id as "recordId", t.edition_id as "editionId",
         t.block_id as "blockId", t.candidate_id as "candidateId",
         /* Ce à quoi elle est attachée, en un mot : la fiche, le programme,
            l'étape ou la startup — ce qui se lit sur une ligne de liste. */
         coalesce(r.name, co.name, b.name, p.name || ' · ' || e.name, '') as "aboutName",
         r.kind as "recordKind",
         coalesce(p.name || ' · ' || e.name, cp.name || ' · ' || ce.name, '') as "editionName",
         coalesce(r.name, co.name, '') as "subjectName",
         coalesce((select json_agg(json_build_object('id', ow.id, 'name', ow.name) order by tw.added_at, ow.name)
                     from task_owners tw join records ow on ow.id = tw.record_id where tw.task_id = t.id), '[]'::json) as owners,
         case when dg.id is null then null else json_build_object('id', dg.id, 'name', dg.name, 'kind', dg.kind) end as delegate,
         t.stuck_reason as "stuckReason",
         case when ub.id is null then null else json_build_object('id', ub.id, 'name', ub.name) end as unblocker,
         case when vb.id is null then null else json_build_object('id', vb.id, 'name', vb.name) end as validator,
         t.validation_note as "validationNote",
         (select count(*)::int from task_attachments ta where ta.task_id = t.id) as attachments,
         t.created_by_name as "createdByName", t.created_at::text as "createdAt",
         t.done_at::text as "doneAt", t.done_by_name as "doneByName",
         t.told_at::text as "toldAt",
         /* La checklist dans la même requête : une liste de deux cents tâches
            ne doit pas en faire deux cent une. */
         coalesce((
           select json_agg(json_build_object(
                    'id', i.id, 'label', i.label, 'position', i.position, 'done', i.done,
                    'doneAt', i.done_at::text, 'doneByName', i.done_by_name)
                  order by i.position, i.created_at)
             from task_items i where i.task_id = t.id
         ), '[]'::json) as items
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
    left join programs p on p.id = e.program_id
    left join editions ce on ce.id = c.edition_id
    left join programs cp on cp.id = ce.program_id
    left join records dg on dg.id = t.delegate_id and dg.deleted_at is null
    left join records ub on ub.id = t.unblocker_id
    left join records vb on vb.id = t.validator_id`;

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
    /* Les siennes : celles dont on est owner, et celles qu'on nous a confiées. */
    where.push(`(dg.id = any($${params.length}::text[])
                 or exists (select 1 from task_owners x where x.task_id = t.id and x.record_id = any($${params.length}::text[])))`);
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
    /* Attachée à cette fiche, confiée à elle, ou attachée à l'une de ses
       candidatures : sur la page d'une startup, « relancer Rafid Tech » dans
       The Builders la concerne autant qu'une tâche posée sur sa fiche. */
    where.push(`(t.record_id = $${params.length} or t.delegate_id = $${params.length} or c.org_id = $${params.length}
                 or exists (select 1 from task_owners x where x.task_id = t.id and x.record_id = $${params.length}))`);
  }
  if (filter.open) {
    params.push(OPEN_TASK_STATES);
    where.push(`t.state = any($${params.length}::text[])`);
  }
  const sql = `${COLS} ${where.length ? `where ${where.join(' and ')}` : ''}
    order by t.state = 'done', case t.priority when 'high' then 0 when 'low' then 2 else 1 end, t.due_on nulls last, t.created_at`;
  return all<Task>(sql, params);
}

export const getTask = (id: string) => one<Task>(`${COLS} where t.id = $1`, [id]);

/** L'équipe CEED : les seules fiches qui peuvent être owner, débloquer ou valider. */
export async function teamIds(): Promise<Set<string>> {
  return new Set(
    (await all<{ id: string }>(`select record_id as id from accounts where staff_role is not null and disabled_at is null`)).map((r) => r.id),
  );
}

async function mustBeTeam(ids: string[], what = 'An owner'): Promise<void> {
  const team = await teamIds();
  const stranger = ids.find((x) => !team.has(x));
  if (stranger) throw new HttpError(422, `${what} has to be on the CEED team.`, { ownerIds: `${what} has to be on the CEED team.` });
}

async function nameOf(id: string | null): Promise<string> {
  return id ? ((await one<{ name: string }>('select name from records where id = $1', [id]))?.name ?? '') : '';
}

/** Ce qui arrive à une tâche : qui, quoi, quand. */
export async function logTask(taskId: string, kind: string, by: { id: string; name: string } | null, note = '', meta: object = {}) {
  await all(
    `insert into task_events (id, task_id, kind, actor_id, actor_name, note, meta, created_at)
     values ($1, $2, $3, (select id from records where id = $4), $5, $6, $7::text::jsonb, clock_timestamp())`,
    [newId('tev', 10), taskId, kind, by?.id ?? null, by?.name ?? '', note.slice(0, 2000), JSON.stringify(meta)],
  );
}

export async function taskHistory(taskId: string): Promise<TaskEvent[]> {
  return all<TaskEvent>(
    `select id, kind, actor_name as "actorName", note, meta, created_at::text as "createdAt"
       from task_events where task_id = $1 order by created_at, id`,
    [taskId],
  );
}

/**
 * Une tâche : ses owners de l'équipe — une seule tâche, partagée —, et
 * éventuellement quelqu'un hors de l'équipe à qui elle est confiée. Un
 * programme et un sujet peuvent aller ensemble.
 */
export async function createTasks(
  input: {
    title: string; detail: string; dueOn: string | null; ownerIds: string[]; priority?: string;
    recordId: string | null; editionId: string | null; blockId: string | null; candidateId: string | null;
    delegateId?: string | null;
    items?: string[];
  },
  by: { id: string; name: string } | null,
): Promise<Task[]> {
  const owners = [...new Set(input.ownerIds)];
  if (!owners.length) throw new HttpError(422, 'Who owns it?', { ownerIds: 'Who owns it?' });
  await mustBeTeam(owners);
  const delegate = input.delegateId ?? null;
  if (delegate && !(await one(`select id from records where id = $1 and deleted_at is null`, [delegate]))) {
    throw new HttpError(422, 'The person or organisation it is entrusted to was not found.');
  }
  const id = idOf.task();
  await all(
    `insert into tasks (id, title, detail, due_on, owner_id, delegate_id, record_id, edition_id, block_id, candidate_id,
                        created_by, created_by_name, priority)
     values ($1,$2,$3,nullif($4,'')::date,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id, input.title.trim(), input.detail.trim(), input.dueOn ?? '', owners[0], delegate,
      input.recordId, input.editionId, input.blockId, input.candidateId,
      by?.id ?? null, by?.name ?? '', input.priority ?? 'medium',
    ],
  );
  for (const o of owners) {
    await all('insert into task_owners (task_id, record_id, added_by_name) values ($1, $2, $3) on conflict do nothing', [id, o, by?.name ?? '']);
  }
  await addItems(id, input.items ?? []);
  const names = await Promise.all(owners.map(nameOf));
  await logTask(id, 'created', by, '', { owners: names, delegate: await nameOf(delegate) });
  const task = await getTask(id);
  return task ? [task] : [];
}

export async function changeTask(
  id: string,
  patch: {
    state?: string; title?: string; detail?: string; dueOn?: string | null; priority?: string;
    ownerIds?: string[];
    delegateId?: string | null;
    about?: { editionId: string | null; subject: { kind: 'person' | 'org' | 'candidate'; id: string } | null };
  },
  by: { id: string; name: string } | null,
): Promise<Task | null> {
  const before = await getTask(id);
  if (!before) return null;
  /* Bloquée et à valider demandent une raison et une personne : elles passent par leur propre porte. */
  if (patch.state === 'stuck' || patch.state === 'to_validate') {
    throw new HttpError(422, patch.state === 'stuck' ? 'Say what blocks it, and who can unblock it.' : 'Choose who validates it.');
  }
  if (patch.ownerIds) {
    const owners = [...new Set(patch.ownerIds)];
    await mustBeTeam(owners);
    await all('delete from task_owners where task_id = $1 and record_id <> all($2::text[])', [id, owners]);
    for (const o of owners) {
      await all('insert into task_owners (task_id, record_id, added_by_name) values ($1, $2, $3) on conflict do nothing', [id, o, by?.name ?? '']);
    }
    await all('update tasks set owner_id = $2 where id = $1', [id, owners[0]]);
    const was = before.owners.map((o) => o.name).sort().join(', ');
    const now = (await Promise.all(owners.map(nameOf))).sort().join(', ');
    if (was !== now) await logTask(id, 'owners', by, '', { from: was, to: now });
  }
  if (patch.delegateId !== undefined && patch.delegateId !== (before.delegate?.id ?? null)) {
    if (patch.delegateId && !(await one(`select id from records where id = $1 and deleted_at is null`, [patch.delegateId]))) {
      throw new HttpError(422, 'The person or organisation it is entrusted to was not found.');
    }
    await all('update tasks set delegate_id = $2, told_at = null where id = $1', [id, patch.delegateId]);
    await logTask(id, patch.delegateId ? 'delegated' : 'undelegated', by, '', { to: await nameOf(patch.delegateId), from: before.delegate?.name ?? '' });
  }
  if (patch.about !== undefined) {
    const { editionId, subject } = patch.about;
    if (editionId && !(await one('select id from editions where id = $1', [editionId]))) throw new HttpError(422, 'That programme was not found.');
    if (subject) {
      const exists = subject.kind === 'candidate'
        ? await one('select id from candidates where id = $1 and deleted_at is null', [subject.id])
        : await one('select id from records where id = $1 and kind = $2 and deleted_at is null', [subject.id, subject.kind]);
      if (!exists) throw new HttpError(422, 'That link was not found.');
    }
    await all(
      `update tasks set edition_id = $2, record_id = $3, candidate_id = $4, block_id = null where id = $1`,
      [id, editionId, subject && subject.kind !== 'candidate' ? subject.id : null, subject?.kind === 'candidate' ? subject.id : null],
    );
    await logTask(id, 'about', by);
  }
  const sets: string[] = [];
  const params: unknown[] = [id];
  const put = (sql: string, value: unknown) => {
    params.push(value);
    sets.push(sql.replace('$n', `$${params.length}`));
  };
  if (patch.title !== undefined) put('title = $n', patch.title.trim());
  if (patch.detail !== undefined) put('detail = $n', patch.detail.trim());
  if (patch.dueOn !== undefined) put("due_on = nullif($n, '')::date", patch.dueOn ?? '');
  if (patch.priority !== undefined) put('priority = $n', patch.priority);
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
  if (patch.state !== undefined && patch.state !== before.state) {
    /* Quitter « bloquée » ou « à valider » efface ce qui n'a plus cours ; l'historique le garde. */
    if (before.state === 'stuck') sets.push("stuck_reason = ''", 'unblocker_id = null');
    if (before.state === 'to_validate') sets.push("validation_note = ''", 'validator_id = null');
  }
  if (sets.length) await all(`update tasks set ${sets.join(', ')} where id = $1`, params);
  if (patch.state !== undefined && patch.state !== before.state) await logTask(id, 'state', by, '', { from: before.state, to: patch.state });
  if (patch.priority !== undefined && patch.priority !== before.priority) await logTask(id, 'priority', by, '', { from: before.priority, to: patch.priority });
  if (patch.dueOn !== undefined && (patch.dueOn || null) !== before.dueOn) await logTask(id, 'due', by, '', { from: before.dueOn, to: patch.dueOn });
  if ((patch.title !== undefined && patch.title.trim() !== before.title) || (patch.detail !== undefined && patch.detail.trim() !== before.detail)) {
    await logTask(id, 'edited', by);
  }
  return getTask(id);
}

/** Bloquée : la raison, et la personne de l'équipe qui peut débloquer. */
export async function markStuck(id: string, input: { reason: string; unblockerId: string }, by: { id: string; name: string } | null): Promise<Task | null> {
  if (!(await getTask(id))) return null;
  await mustBeTeam([input.unblockerId], 'Who unblocks it');
  await all(
    `update tasks set state = 'stuck', stuck_reason = $2, unblocker_id = $3, done_at = null, done_by = null, done_by_name = '' where id = $1`,
    [id, input.reason, input.unblockerId],
  );
  await logTask(id, 'stuck', by, input.reason, { unblocker: await nameOf(input.unblockerId) });
  return getTask(id);
}

/** À valider : un mot éventuel, et la personne de l'équipe qui valide. */
export async function submitForValidation(id: string, input: { note: string; validatorId: string }, by: { id: string; name: string } | null): Promise<Task | null> {
  if (!(await getTask(id))) return null;
  await mustBeTeam([input.validatorId], 'Who validates it');
  await all(
    `update tasks set state = 'to_validate', validation_note = $2, validator_id = $3, stuck_reason = '', unblocker_id = null where id = $1`,
    [id, input.note, input.validatorId],
  );
  await logTask(id, 'submitted', by, input.note, { validator: await nameOf(input.validatorId) });
  return getTask(id);
}

/** Le valideur tranche : faite, ou renvoyée avec un mot. Lui seul — ou un administrateur. */
export async function validateTask(
  id: string,
  input: { action: 'approve' | 'send_back'; note: string },
  by: { id: string; name: string },
  isAdmin: boolean,
): Promise<Task | null> {
  const task = await getTask(id);
  if (!task) return null;
  if (task.state !== 'to_validate') throw new HttpError(409, 'This task is not waiting for a validation.');
  if (task.validator?.id !== by.id && !isAdmin) throw new HttpError(403, `Only ${task.validator?.name || 'its validator'} validates it.`);
  if (input.action === 'approve') {
    await all(
      `update tasks set state = 'done', done_at = now(), done_by = $2, done_by_name = $3 where id = $1`,
      [id, by.id, by.name],
    );
    await logTask(id, 'validated', by, input.note);
  } else {
    if (!input.note) throw new HttpError(422, 'Say what is missing.', { note: 'Say what is missing.' });
    await all(`update tasks set state = 'doing', validator_id = null, validation_note = '' where id = $1`, [id]);
    await logTask(id, 'sent_back', by, input.note);
  }
  return getTask(id);
}

/** Ce qui attend une personne : débloquer, ou valider. */
export async function waitingFor(recordId: string): Promise<Task[]> {
  return all<Task>(
    `${COLS} where (t.state = 'stuck' and t.unblocker_id = $1) or (t.state = 'to_validate' and t.validator_id = $1)
      order by t.created_at`,
    [recordId],
  );
}

/* ---------------------------------------------------------------- */
/* Pièces jointes                                                    */
/* ---------------------------------------------------------------- */

export async function taskAttachments(taskId: string): Promise<TaskAttachment[]> {
  return all<TaskAttachment>(
    `select id, upload_id as "uploadId", filename, mime, size, added_by_name as "addedByName", created_at::text as "createdAt"
       from task_attachments where task_id = $1 order by created_at`,
    [taskId],
  );
}

export async function attachToTask(taskId: string, uploadId: string, by: { id: string; name: string } | null): Promise<TaskAttachment[]> {
  if (!(await getTask(taskId))) throw new HttpError(404, 'Task not found.');
  const u = await one<{ filename: string; mime: string; size: number }>('select filename, mime, size from uploads where id = $1', [uploadId]);
  if (!u) throw new HttpError(422, 'Upload the file first.');
  await all(
    `insert into task_attachments (id, task_id, upload_id, filename, mime, size, added_by_name) values ($1, $2, $3, $4, $5, $6, $7)`,
    [newId('tat', 10), taskId, uploadId, u.filename, u.mime, u.size, by?.name ?? ''],
  );
  await logTask(taskId, 'attached', by, u.filename);
  return taskAttachments(taskId);
}

export async function detachFromTask(taskId: string, attachmentId: string, by: { id: string; name: string } | null): Promise<TaskAttachment[]> {
  const gone = await all<{ filename: string }>('delete from task_attachments where id = $1 and task_id = $2 returning filename', [attachmentId, taskId]);
  if (gone.length) await logTask(taskId, 'detached', by, gone[0]!.filename);
  return taskAttachments(taskId);
}

/* ------------------------------------------------------------------ */
/* La checklist                                                        */
/* ------------------------------------------------------------------ */

const ITEM_COLS = `id, label, position, done, done_at::text as "doneAt", done_by_name as "doneByName"`;

/**
 * Ajoute des lignes à la fin de la checklist.
 *
 * La seule porte d'entrée, qu'elles viennent de la fenêtre qui donne la tâche,
 * du panneau qui la détaille, ou d'une règle qui les écrira d'elle-même.
 */
export async function addItems(taskId: string, labels: string[]): Promise<TaskItem[]> {
  const clean = labels.map((l) => l.trim()).filter(Boolean);
  if (!clean.length) return [];
  const last = await one<{ n: number }>(
    'select coalesce(max(position), -1)::int as n from task_items where task_id = $1',
    [taskId],
  );
  const made: TaskItem[] = [];
  for (const [at, label] of clean.entries()) {
    const item = await one<TaskItem>(
      `insert into task_items (id, task_id, label, position) values ($1,$2,$3,$4) returning ${ITEM_COLS}`,
      [idOf.taskItem(), taskId, label, (last?.n ?? -1) + 1 + at],
    );
    if (item) made.push(item);
  }
  return made;
}

/**
 * Coche, décoche ou renomme une ligne.
 *
 * Cocher la première ligne d'une tâche encore « à faire » la met « en cours » :
 * quelqu'un a commencé, et le tableau doit le montrer sans qu'on pense à
 * déplacer la carte. Seulement depuis « à faire » — une tâche bloquée ou faite
 * ne change pas d'état parce qu'on a coché une ligne.
 */
export async function changeItem(
  taskId: string,
  itemId: string,
  patch: { label?: string; done?: boolean },
  by: { id: string; name: string } | null,
): Promise<TaskItem | null> {
  const sets: string[] = [];
  const params: unknown[] = [itemId, taskId];
  const put = (sql: string, value: unknown) => {
    params.push(value);
    sets.push(sql.replace('$n', `$${params.length}`));
  };
  if (patch.label !== undefined) put('label = $n', patch.label.trim());
  if (patch.done !== undefined) {
    put('done = $n', patch.done);
    if (patch.done) {
      sets.push('done_at = now()');
      put('done_by = $n', by?.id ?? null);
      put('done_by_name = $n', by?.name ?? '');
    } else {
      sets.push('done_at = null', 'done_by = null', "done_by_name = ''");
    }
  }
  if (!sets.length) return one<TaskItem>(`select ${ITEM_COLS} from task_items where id = $1 and task_id = $2`, params);
  const item = await one<TaskItem>(
    `update task_items set ${sets.join(', ')} where id = $1 and task_id = $2 returning ${ITEM_COLS}`,
    params,
  );
  if (item && patch.done) await all(`update tasks set state = 'doing' where id = $1 and state = 'open'`, [taskId]);
  return item;
}

export const dropItem = async (taskId: string, itemId: string): Promise<boolean> =>
  (await all('delete from task_items where id = $1 and task_id = $2 returning id', [itemId, taskId])).length > 0;

/** Range la checklist dans l'ordre donné ; une ligne qui n'en est pas est ignorée. */
export async function orderItems(taskId: string, ids: string[]): Promise<void> {
  await all(
    `update task_items i set position = o.at - 1
       from unnest($2::text[]) with ordinality as o(id, at)
      where i.id = o.id and i.task_id = $1`,
    [taskId, ids],
  );
}

export const dropTask = async (id: string): Promise<void> => {
  await all('delete from tasks where id = $1', [id]);
};
