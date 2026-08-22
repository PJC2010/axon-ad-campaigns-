"use client";

import { clsx } from "clsx";

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { value: T; label: string }[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-6 flex gap-1 border-b border-hairline">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={clsx(
            "-mb-px border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors duration-150",
            t.value === active
              ? "border-ocean text-ocean"
              : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
