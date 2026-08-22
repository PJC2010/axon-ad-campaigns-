import { clsx } from "clsx";
import type { SelectHTMLAttributes } from "react";
import { inputCls } from "./Field";

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(inputCls, "appearance-none pr-8", className)} {...rest}>
      {children}
    </select>
  );
}
