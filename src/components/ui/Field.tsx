import type { ReactNode } from "react";
import { clsx } from "clsx";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-negative">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-faint">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputCls =
  "w-full rounded-btn border border-hairline bg-raised px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ocean focus:outline-none focus:ring-2 focus:ring-ocean/15 disabled:opacity-50 disabled:bg-surface";
