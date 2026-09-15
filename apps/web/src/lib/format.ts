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
