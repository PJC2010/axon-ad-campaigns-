"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  ArrowDownToLine,
  Images,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  Settings,
} from "lucide-react";
import { Icon } from "@/components/ui/Icon";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/creatives", label: "Creatives", icon: Images },
  { href: "/import", label: "Import data", icon: ArrowDownToLine },
  { href: "/recommendations", label: "Recommendations", icon: Lightbulb },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-hairline bg-paper">
      <Link href="/" className="flex items-baseline gap-2 px-5 pb-5 pt-6">
        <span className="font-display text-xl font-bold tracking-tight">Axon</span>
        <span className="text-xs font-medium text-muted">Ad campaigns</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {nav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-2.5 rounded-btn px-2.5 py-2 text-[13px] font-medium transition-colors duration-150",
                active
                  ? "bg-ocean-wash text-ocean"
                  : "text-muted hover:bg-ink/4 hover:text-ink",
              )}
            >
              <Icon icon={item.icon} size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-hairline px-5 py-4">
        <p className="text-[11px] leading-relaxed text-faint">
          Local workspace — data stays on this machine.
        </p>
      </div>
    </aside>
  );
}
