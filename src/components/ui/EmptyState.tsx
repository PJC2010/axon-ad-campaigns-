import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-hairline-strong bg-surface/60 px-6 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ocean-wash text-ocean">
        <Icon icon={icon} size={20} />
      </div>
      <h3 className="mt-4 font-display text-[15px] font-semibold">{title}</h3>
      {hint ? <p className="mt-1 max-w-sm text-[13px] text-muted">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
