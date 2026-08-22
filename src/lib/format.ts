const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const moneyWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatMoney(cents: number | null | undefined, whole = false): string {
  if (cents == null || Number.isNaN(cents)) return "—";
  const dollars = cents / 100;
  return whole ? moneyWhole.format(dollars) : money.format(dollars);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return number.format(Math.round(n * 100) / 100);
}

export function formatCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return compact.format(n);
}

/** fraction in, percent out: 0.0123 -> "1.23%" */
export function formatPercent(fraction: number | null | undefined, digits = 2): string {
  if (fraction == null || Number.isNaN(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatRatio(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}×`;
}

/** '2026-08-04' -> 'Aug 4' (display only). */
export function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${MONTHS[m - 1]} ${d}${new Date().getUTCFullYear() !== y ? `, ${y}` : ""}`;
}
