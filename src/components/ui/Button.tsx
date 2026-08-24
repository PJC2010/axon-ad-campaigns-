import Link from "next/link";
import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-btn font-medium transition-colors duration-150 disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap select-none";

const variants: Record<Variant, string> = {
  primary: "bg-ocean text-paper hover:bg-ocean-deep shadow-soft",
  secondary:
    "bg-surface text-ink border border-hairline hover:border-hairline-strong hover:bg-raised",
  ghost: "text-muted hover:text-ink hover:bg-ink/5",
  danger: "bg-surface text-negative border border-hairline hover:border-negative/40",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[13px]",
  md: "h-9 px-3.5 text-sm",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  href?: string;
  children: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  href,
  className,
  children,
  type = "button",
  ...rest
}: Props) {
  const cls = clsx(base, variants[variant], sizes[size], className);
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
