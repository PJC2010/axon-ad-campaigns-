"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { addDays, todayStr } from "@/lib/dates";

export interface DateRange {
  from: string;
  to: string;
}

const PRESETS = [7, 14, 30, 60] as const;

export function lastNDays(n: number): DateRange {
  const to = addDays(todayStr(), -1); // full days only — today is still in flight
  return { from: addDays(to, -(n - 1)), to };
}

function presetFor(value: DateRange): number | null {
  for (const n of PRESETS) {
    const p = lastNDays(n);
    if (p.from === value.from && p.to === value.to) return n;
  }
  return null;
}

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const activePreset = presetFor(value);
  const [custom, setCustom] = useState(activePreset == null);

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex rounded-btn border border-hairline bg-surface p-0.5">
        {PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setCustom(false);
              onChange(lastNDays(n));
            }}
            className={clsx(
              "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors",
              !custom && activePreset === n
                ? "bg-ocean text-paper"
                : "text-muted hover:text-ink",
            )}
          >
            {n}d
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustom(true)}
          className={clsx(
            "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors",
            custom || activePreset == null ? "bg-ocean text-paper" : "text-muted hover:text-ink",
          )}
        >
          Custom
        </button>
      </div>
      {custom || activePreset == null ? (
        <span className="flex items-center gap-1.5">
          <input
            type="date"
            className="rounded-btn border border-hairline bg-raised px-2 py-1 text-xs"
            value={value.from}
            max={value.to}
            onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
          />
          <span className="text-xs text-faint">to</span>
          <input
            type="date"
            className="rounded-btn border border-hairline bg-raised px-2 py-1 text-xs"
            value={value.to}
            min={value.from}
            max={todayStr()}
            onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
          />
        </span>
      ) : null}
    </div>
  );
}
