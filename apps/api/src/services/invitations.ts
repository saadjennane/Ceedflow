/**
 * Inviter des gens dans leur compte, un par un ou quatre cents à la fois.
 *
 * The same act either way, which is why it lives here rather than inside a
 * route: open an account for somebody who has none, hand them a password that
 * works, and write to them. An invitation that carries no password is a letter
 * saying "you have an account somewhere" — the person then writes back to ask
 * how to get in, which is the opposite of what inviting them was for.
 */
import { suggestPassword } from '@ceed/shared';
import * as dir from '../db/directory.js';
import {
  accountOfRecord,
  createAccount,
  markInvited,
  reissueProvisionalPassword,
} from './auth.js';
import { appLink } from './deliverables.js';
import { post, sendingIsLive } from './mail.js';

/** Why somebody hears nothing, in words a screen prints. */
export type InviteBlock = 'no_email' | 'claimed' | 'disabled';

export interface InviteResult {
  recordId: string;
  name: string;
  /** '' when they were written to. */
  blocked: InviteBlock | '';
  /** Returned only for a single invitation, where a screen shows it once. */
  password?: string;
  emailed?: boolean;
}

/** Whether this person can be invited, and why not when they cannot. */
export async function inviteBlock(recordId: string): Promise<InviteBlock | ''> {
  const record = await dir.getRecord(recordId);
  if (!record?.email?.trim()) return 'no_email';
  const account = await accountOfRecord(recordId);
  if (!account) return '';
  if (account.state === 'disabled') return 'disabled';
  /* Somebody who chose their own password cannot be invited: re-issuing would
     be a password reset without saying so, and the reset route exists, says
     what it does, and ends their sessions. */
  if (account.state === 'claimed') return 'claimed';
  return '';
}

/**
 * Opens an account where there is none, hands over a fresh password, writes.
 *
 * The password is new every time, because inviting twice is somebody saying
 * the first never arrived — what has to work is the one in their hand now.
 */
export async function invite(recordId: string, sendAfter: Date | null = null): Promise<InviteResult> {
  const record = await dir.getRecord(recordId);
  const blocked = await inviteBlock(recordId);
  if (!record || blocked) return { recordId, name: record?.name ?? '', blocked: blocked || 'no_email' };

  const email = record.email!.trim();
  const password = suggestPassword();
  let account = await accountOfRecord(recordId);
  if (!account) {
    await createAccount({ email, password, recordId, mustChangePassword: true });
    account = await accountOfRecord(recordId);
  } else {
    await reissueProvisionalPassword(account.id, password);
  }
  await markInvited(account!.id);

  const origin = await appLink();
  const letter = await post({
    kind: 'account_invite',
    to: email,
    toName: record.name,
    recordId,
    sendAfter,
    subject: 'Your CEED account',
    body: [
      `${record.name},`,
      '',
      'CEED has opened an account for you. Sign in with the password below and you will be asked to choose your own.',
      '',
      `    ${email}`,
      `    ${password}`,
      '',
      ...(origin ? [`    ${origin.replace(/\/me\?tab=Programs$/, '/login')}`, ''] : []),
      'If you were not expecting this, you can ignore it — nothing happens until somebody signs in.',
    ].join('\n'),
  });

  return { recordId, name: record.name, blocked: '', password, emailed: sendingIsLive() && Boolean(letter) };
}

/**
 * Inviting a whole list, spread over days.
 *
 * `perDay` exists because a new sending domain has no reputation: four hundred
 * letters on its first morning is how it is classed as spam, and once it is,
 * every other letter the programme sends goes to the same place — the jury
 * convocations and the results included. Spreading costs a few days once;
 * getting it wrong costs the whole season.
 */
export async function inviteMany(
  recordIds: string[],
  perDay: number | null,
): Promise<{ written: number; blocked: InviteResult[]; days: number }> {
  const results: InviteResult[] = [];
  const size = perDay && perDay > 0 ? perDay : recordIds.length || 1;

  for (const [index, recordId] of recordIds.entries()) {
    const day = Math.floor(index / size);
    // The first slice goes now; each later one waits its own whole day.
    const after = day === 0 ? null : new Date(Date.now() + day * 86_400_000);
    results.push(await invite(recordId, after));
  }

  const blocked = results.filter((r) => r.blocked);
  return {
    written: results.length - blocked.length,
    blocked,
    days: Math.ceil((recordIds.length || 0) / size) || 0,
  };
}
