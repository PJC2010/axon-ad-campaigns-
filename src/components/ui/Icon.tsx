import type { LucideIcon } from "lucide-react";

// All iconography is lucide at 1.5px stroke — never emoji.
export function Icon({
  icon: Glyph,
  size = 18,
  className,
}: {
  icon: LucideIcon;
  size?: number;
  className?: string;
}) {
  return <Glyph size={size} strokeWidth={1.5} className={className} aria-hidden />;
}
