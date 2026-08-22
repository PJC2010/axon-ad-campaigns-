import { Lightbulb } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";

export default function RecommendationsPage() {
  return (
    <>
      <TopBar title="Recommendations" subtitle="What to scale, pause, and refresh" />
      <EmptyState
        icon={Lightbulb}
        title="No recommendations yet"
        hint="Once performance data is in, generate recommendations from the rules engine and Claude."
      />
    </>
  );
}
