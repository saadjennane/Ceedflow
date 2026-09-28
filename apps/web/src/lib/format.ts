const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-10-10' -> '10 Oct 2026'. Parsed by hand so no timezone shifts the day. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatRange(from: string | null, to: string | null): string {
  if (!from && !to) return 'No dates yet';
  if (from && to) {
    const [y1] = from.split('-');
    const [y2] = to.split('-');
    return y1 === y2 ? `${formatDate(from).replace(` ${y1}`, '')} – ${formatDate(to)}` : `${formatDate(from)} – ${formatDate(to)}`;
  }
  return from ? `From ${formatDate(from)}` : `Until ${formatDate(to)}`;
}

export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const today = new Date();
  const target = new Date(`${value.slice(0, 10)}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-GB').format(value);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The shortest name that still tells two people apart.
 *
 * A column of jurors is too narrow for full names, so it shows first names —
 * until two jurors on the same panel are both called Nawal and the table
 * silently stops meaning anything. Hovering answers the question, but only for
 * somebody who already suspects there is one. So the header disambiguates
 * itself: Nawal Cherkaoui and Nawal Berrada become "Nawal C." and "Nawal B.",
 * and two people with the same first name and the same initial get their full
 * names, narrow column or not.
 */
export function shortNames(names: string[]): string[] {
  const first = names.map((n) => n.trim().split(/\s+/)[0] ?? n);
  const clashes = new Set(first.filter((f, i) => first.indexOf(f) !== i));
  if (!clashes.size) return first;

  const withInitial = names.map((n, i) => {
    if (!clashes.has(first[i])) return first[i];
    const rest = n.trim().split(/\s+/).slice(1).join(' ');
    return rest ? `${first[i]} ${rest[0]}.` : first[i];
  });
  // Two Nawal C. are no better than two Nawal: fall back to saying it in full.
  const stillClashing = new Set(withInitial.filter((s, i) => withInitial.indexOf(s) !== i));
  return withInitial.map((s, i) => (stillClashing.has(s) ? names[i].trim() : s));
}
