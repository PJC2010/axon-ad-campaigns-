import { clsx } from "clsx";
import type { TextareaHTMLAttributes } from "react";
import { inputCls } from "./Field";

export function TextArea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(inputCls, "min-h-20 resize-y", className)} {...rest} />;
}
