import { clsx } from "clsx";
import type { InputHTMLAttributes } from "react";
import { inputCls } from "./Field";

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(inputCls, className)} {...rest} />;
}
