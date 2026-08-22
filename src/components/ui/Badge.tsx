import { clsx } from "clsx";
import type { ReactNode } from "react";

type Tone = "neutral" | "ocean" | "positive" | "negative" | "warn";

const tones: Record<Tone, string> = {
  neutral: "bg-ink/6 text-muted",
  ocean: "bg-ocean-wash text-ocean",
  positive: "bg-positive/10 text-positive",
  negative: "bg-negative/10 text-negative",
  warn: "bg-warn/10 text-warn",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
