/**
 * What a panel asks of the person on it.
 *
 * The member space and the workspace sidebar both show this number, and two
 * definitions of the same count would eventually disagree — so it is written
 * once, here, rather than in either screen. It sits in lib and takes the shape
 * it needs rather than the full ReviewPanel, so importing it does not drag the
 * review screen into whatever bundle asked for the count.
 */
interface Countable {
  state: 'open' | 'not_open' | 'closed';
  items: unknown[];
  done: number;
}

/** A panel that has not opened, or that has been shut, asks nothing. */
export const stillWaiting = (panels: Countable[]) =>
  panels.filter((p) => p.state === 'open').reduce((n, p) => n + (p.items.length - p.done), 0);
