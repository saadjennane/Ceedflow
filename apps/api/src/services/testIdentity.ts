/**
 * Qui est un test, en deux questions que tout le reste pose — l'envoi des
 * mails d'abord. Sans dépendance vers le courrier, pour que le courrier
 * puisse la poser.
 */
import { db } from '../db/client.js';

/** `saad+jury@x.org` → `saad@x.org`; null when the address carries no `+`. */
export function aliasBase(email: string): string | null {
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (!local || !domain || !local.includes('+')) return null;
  return `${local.split('+')[0]}@${domain}`;
}

/** The colleague behind a test alias: the CEED account whose address it extends. */
export async function testOwnerOf(email: string): Promise<{ accountId: string; email: string } | null> {
  const base = aliasBase(email);
  if (!base) return null;
  const rows = await (await db()).query<{ id: string; email: string }>(
    'select id, email from accounts where lower(email) = $1 and staff_role is not null and disabled_at is null',
    [base],
  );
  return rows[0] ? { accountId: rows[0].id, email: rows[0].email } : null;
}

/** Whether a letter to this address stays inside the sandbox. */
export async function isTestAddress(email: string): Promise<boolean> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return false;
  if (await testOwnerOf(wanted)) return true;
  const rows = await (await db()).query<{ id: string }>(
    `select id from records
      where test_owner is not null
        and exists (select 1 from jsonb_array_elements_text(emails) e where lower(e) = $1)
      limit 1`,
    [wanted],
  );
  return rows.length > 0;
}

/**
 * Whether a letter is about a test programme: its brick, or its candidacy,
 * sits in a programme marked as a test.
 */
export async function inTestContext(letter: { blockId?: string | null; candidateId?: string | null }): Promise<boolean> {
  if (!letter.blockId && !letter.candidateId) return false;
  const rows = await (await db()).query<{ t: boolean }>(
    `select p.is_test as t
       from programs p join editions e on e.program_id = p.id
      where e.id = coalesce(
        (select t.edition_id from blocks b join phases ph on ph.id = b.phase_id join tracks t on t.id = ph.track_id where b.id = $1),
        (select c.edition_id from candidates c where c.id = $2))`,
    [letter.blockId ?? null, letter.candidateId ?? null],
  );
  return Boolean(rows[0]?.t);
}

/** Whether this person is a test identity — they see test programmes, and only they do. */
export async function isTestRecord(recordId: string): Promise<boolean> {
  const rows = await (await db()).query<{ t: string | null }>('select test_owner as t from records where id = $1', [recordId]);
  return Boolean(rows[0]?.t);
}
