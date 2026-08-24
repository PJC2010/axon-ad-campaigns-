// All day-level date math is string-based ('YYYY-MM-DD'). Never construct
// new Date('YYYY-MM-DD') for day math — it parses as UTC midnight and shifts
// a day in negative-offset timezones.

const DAY_MS = 86_400_000;

export function isDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return (
    t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
  );
}

function toUtcMs(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Inclusive difference in days: diffDays('2026-01-01','2026-01-03') === 2 */
export function diffDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** Every day from `from` to `to` inclusive. */
export function dayRange(from: string, to: string): string[] {
  const days: string[] = [];
  for (let t = toUtcMs(from); t <= toUtcMs(to); t += DAY_MS) {
    days.push(fromUtcMs(t));
  }
  return days;
}

/** The window of equal length immediately before [from, to]. */
export function previousWindow(from: string, to: string): { from: string; to: string } {
  const len = diffDays(from, to) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}
