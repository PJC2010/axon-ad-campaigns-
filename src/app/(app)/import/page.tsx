import { ArrowDownToLine } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ImportPage() {
  return (
    <>
      <TopBar title="Import data" subtitle="Bring in performance metrics from Meta" />
      <EmptyState
        icon={ArrowDownToLine}
        title="Import lands in a later build phase"
        hint="CSV import, manual entry, and Meta API sync will live here."
      />
    </>
  );
}
