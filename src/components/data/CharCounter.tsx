import { clsx } from "clsx";

/**
 * Soft-limit counter for ad copy. Meta truncates rather than rejects, so going
 * over the recommended length is a warning, never a blocker.
 */
export function CharCounter({ value, limit }: { value: string; limit: number }) {
  const n = value.length;
  const over = n > limit;
  return (
    <span
      className={clsx(
        "numeric text-xs",
        over ? "font-medium text-warn" : "text-faint",
      )}
      title={
        over
          ? `Meta recommends up to ${limit} characters — longer text may be truncated`
          : `Recommended up to ${limit} characters`
      }
    >
      {n}/{limit}
    </span>
  );
}
