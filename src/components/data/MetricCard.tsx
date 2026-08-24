import { clsx } from "clsx";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Icon } from "@/components/ui/Icon";

/**
 * KPI stat tile. `delta` is the fractional change vs the previous window
 * (0.12 = +12%). `goodWhen` maps direction to tone — costs improve downward.
 */
export function MetricCard({
  label,
  value,
  delta,
  goodWhen = "up",
  sub,
}: {
  label: string;
  value: string;
  delta?: number | null;
  goodWhen?: "up" | "down" | "neutral";
  sub?: string;
}) {
  let deltaEl = null;
  if (delta != null && Number.isFinite(delta)) {
    const flat = Math.abs(delta) < 0.005 || goodWhen === "neutral";
    const up = delta > 0;
    const good = flat ? null : (up && goodWhen === "up") || (!up && goodWhen === "down");
    deltaEl = (
      <span
        className={clsx(
          "numeric inline-flex items-center gap-0.5 text-xs font-medium",
          flat ? "text-faint" : good ? "text-positive" : "text-negative",
        )}
        title="vs the previous period of the same length"
      >
        <Icon
          icon={Math.abs(delta) < 0.005 ? Minus : up ? ArrowUpRight : ArrowDownRight}
          size={13}
        />
        {Math.abs(delta) < 0.005
          ? "flat"
          : `${Math.abs(delta * 100).toFixed(Math.abs(delta) >= 1 ? 0 : 1)}%`}
      </span>
    );
  }

  return (
    <div className="rounded-card border border-hairline bg-surface px-4 py-3.5 shadow-soft">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="numeric text-xl font-semibold tracking-tight">{value}</span>
        {deltaEl}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] text-faint">{sub}</p> : null}
    </div>
  );
}
