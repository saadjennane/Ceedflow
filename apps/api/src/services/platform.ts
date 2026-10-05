/**
 * Where this platform lives, as far as it can tell.
 *
 * A letter that says "go to your space" needs an address to point at. That used
 * to be an environment variable somebody had to set, which is a configuration
 * step that is forgotten exactly once and then shows up as a link that goes
 * nowhere in four hundred inboxes.
 *
 * But the platform is not in any doubt about its own address: every request it
 * serves carries it in the Host header, and this same process serves the built
 * front on that host. So it remembers what it is answering to, and the sender
 * reads it back. `APP_URL` stays as an override for the case the host cannot
 * speak for itself — a worker that serves nothing, a domain change made before
 * anybody visits.
 */
import { ACCESS_DEFAULT } from '@ceed/shared';
import { db } from '../db/client.js';

const KEY = 'public_origin';

/**
 * What we last managed to write down — not what we last saw.
 *
 * It exists only to keep an upsert off every single request. Reads deliberately
 * do not use it: a cached read would be wrong in three ordinary situations at
 * once — two processes serving the same site, a domain changed on one of them,
 * and a write that failed while memory went on claiming it had worked.
 */
let written: string | null = null;

/**
 * Hosts that are real to somebody outside.
 *
 * A health check hitting `localhost`, or a platform's internal mesh name, is
 * this process talking to itself. Remembering one of those as the public
 * address is how a letter ends up inviting a founder to visit
 * `postgres.railway.internal`.
 */
function reachable(host: string): boolean {
  const name = host.split(':')[0]!.toLowerCase();
  if (!name || name === 'localhost' || name.endsWith('.local') || name.endsWith('.internal')) return false;
  // A bare address is a machine, not a place anybody was given.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name) || name.includes(':')) return false;
  return name.includes('.');
}

/**
 * Notes the address this request came in on.
 *
 * Writes only when it changes, so a cutover to a new domain is picked up
 * without a deploy while an ordinary request costs nothing.
 */
export async function noteOrigin(protocol: string | undefined, host: string | undefined): Promise<void> {
  if (!host || !reachable(host)) return;
  /* https unless the proxy in front says otherwise.
     Only public hosts get this far, and the two ways to be wrong are not
     equal: an https link to a site that only speaks http fails in front of
     the person, loudly, once. An http link sent to four hundred founders
     walks every one of them onto an unencrypted page, quietly. The scheme a
     proxy declares is believed; its absence is not a reason to downgrade. */
  const scheme = protocol === 'http' ? 'http' : 'https';
  const origin = `${scheme}://${host}`;
  if (origin === written) return;
  try {
    await (await db()).query(
      `insert into settings (key, value) values ($1, $2)
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [KEY, origin],
    );
    // Only once it is actually down: claiming it earlier is how a failed write
    // becomes a value nobody ever retries.
    written = origin;
  } catch {
    // Remembering where we live is never worth failing a request over.
  }
}

/**
 * The platform's own address, or '' when nothing has told it yet.
 *
 * Read from the database every time rather than from memory: a notice going
 * out at seven in the morning, on a process that has served nothing since it
 * started, has to find what some other process learned yesterday.
 */
export async function publicOrigin(): Promise<string> {
  const given = process.env.APP_URL?.trim();
  if (given) return given.replace(/\/$/, '');
  try {
    const rows = await (await db()).query<{ value: string }>('select value from settings where key = $1', [KEY]);
    return rows[0]?.value ?? '';
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* What a first login says                                             */
/* ------------------------------------------------------------------ */

const ACCESS_KEY = 'access_message';

/**
 * The paragraph that hands somebody their first password.
 *
 * One place for the whole workspace rather than one per block: this is the
 * platform telling a person how to sign in, not a programme's own vocabulary,
 * and five copies of it would be five chances to say it differently.
 */
export async function accessMessage(): Promise<string> {
  try {
    const rows = await (await db()).query<{ value: string }>('select value from settings where key = $1', [ACCESS_KEY]);
    return rows[0]?.value || ACCESS_DEFAULT;
  } catch {
    return ACCESS_DEFAULT;
  }
}

export async function setAccessMessage(text: string): Promise<void> {
  await (await db()).query(
    `insert into settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [ACCESS_KEY, text],
  );
}
