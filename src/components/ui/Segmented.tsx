"use client";

import { clsx } from "clsx";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-btn border border-hairline bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-[5px] px-3 py-1.5 text-[13px] font-medium transition-colors duration-150",
            o.value === value
              ? "bg-ocean text-paper shadow-soft"
              : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
