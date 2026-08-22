"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-ink/30"
        onClick={onClose}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-pop ${
          wide ? "max-w-2xl" : "max-w-xl"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-4">
          <div>
            <h2 className="font-display text-[17px] font-semibold">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn p-1.5 text-muted hover:bg-ink/5 hover:text-ink"
            aria-label="Close drawer"
          >
            <Icon icon={X} size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-hairline px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
