"use client";

import { formatDay } from "@/lib/format";

/** Brand tooltip body shared by every chart: surface card, mono numerals. */
export function ChartTip({
  active,
  label,
  rows,
}: {
  active?: boolean;
  label?: string;
  rows: { name: string; value: string; swatch?: string }[];
}) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="rounded-card border border-hairline bg-raised px-3 py-2 shadow-pop">
      {label ? <p className="mb-1 text-xs font-medium text-muted">{formatDay(label)}</p> : null}
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2 text-[13px]">
          {r.swatch ? (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: r.swatch }}
            />
          ) : null}
          <span className="text-muted">{r.name}</span>
          <span className="numeric ml-auto pl-4 font-medium text-ink">{r.value}</span>
        </p>
      ))}
    </div>
  );
}
