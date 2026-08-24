import { clsx } from "clsx";
import { Film } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import type { Creative } from "@/lib/types";

/** Square-ish thumbnail for a creative; images render inline, videos get a film tile. */
export function CreativeThumb({
  creative,
  className,
}: {
  creative: Pick<Creative, "id" | "kind" | "original_name" | "mime">;
  className?: string;
}) {
  if (creative.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local API-served file, next/image adds nothing here
      <img
        src={`/api/creatives/${creative.id}/file`}
        alt={creative.original_name}
        className={clsx("h-full w-full object-cover", className)}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={clsx(
        "flex h-full w-full items-center justify-center bg-ink/85 text-paper",
        className,
      )}
      title={creative.original_name}
    >
      <Icon icon={Film} size={22} />
    </div>
  );
}
