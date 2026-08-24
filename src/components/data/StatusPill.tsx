import { Badge } from "@/components/ui/Badge";
import type { EntityStatus } from "@/lib/meta/enums";

const toneByStatus = {
  DRAFT: "neutral",
  ACTIVE: "positive",
  PAUSED: "warn",
  ARCHIVED: "neutral",
} as const;

const labelByStatus: Record<EntityStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};

export function StatusPill({ status }: { status: EntityStatus }) {
  return <Badge tone={toneByStatus[status]}>{labelByStatus[status]}</Badge>;
}
