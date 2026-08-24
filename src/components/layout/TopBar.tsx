import type { ReactNode } from "react";
import { ConfigBadge } from "./ConfigBadge";

export function TopBar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4 border-b border-hairline pb-5">
      <div>
        <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-[13px] text-muted">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {actions}
        <ConfigBadge />
      </div>
    </header>
  );
}
