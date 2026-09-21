import { suggestPassword } from '@ceed/shared';
import * as dir from '../db/directory.js';
import { db } from '../db/client.js';
import { createAccount, findAccount, reissueProvisionalPassword, setStaffRole } from './auth.js';

const EMAIL = (process.env.CEED_ADMIN_EMAIL ?? 'saadjennane@gmail.com').trim().toLowerCase();
const NAME = process.env.CEED_ADMIN_NAME ?? 'CEED Admin';

/**
 * The first way in. A workspace nobody can sign in to is a workspace nobody can
 * open an account from, so the door has to exist before anyone can be let
 * through it.
 *
 * The password is provisional and re-issued on every start for as long as
 * nobody has claimed this account — a lockout is then never more than a restart
 * away. Once somebody chooses their own password this stops touching it, which
 * is the same rule that protects every other account here: a password its owner
 * chose is never overwritten from outside.
 *
 * It is printed and nowhere else. Not written to disk, not stored in the
 * repository, not sent anywhere.
 */
export async function bootstrapAdmin(log: (message: string) => void): Promise<void> {
  const client = await db();
  const staff = await client.query<{ n: number }>(
    'select count(*)::int as n from accounts where staff_role is not null',
  );
  const existing = await findAccount(EMAIL);

  if (Number(staff[0]?.n ?? 0) > 0 && existing && !existing.mustChangePassword) return;

  const password = suggestPassword();

  if (existing) {
    if (!existing.mustChangePassword) {
      // Somebody else already holds the workspace and this account is claimed.
      await setStaffRole(existing.id, 'admin');
      return;
    }
    await reissueProvisionalPassword(existing.id, password);
    await setStaffRole(existing.id, 'admin');
  } else {
    const record =
      (await dir.findByEmail('person', EMAIL)) ??
      (await dir.createRecord({ kind: 'person', name: NAME, email: EMAIL, origin: 'manual' }));
    const account = await createAccount({ email: EMAIL, password, recordId: record.id, mustChangePassword: true });
    await setStaffRole(account.id, 'admin');
  }

  log(
    `\n  CEED workspace — first sign-in\n` +
      `  ${EMAIL}\n` +
      `  ${password}\n` +
      `  Provisional: you will be asked to replace it. Re-issued on every start until you do.\n`,
  );
}
