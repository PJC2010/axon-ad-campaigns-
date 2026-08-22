import { BarChart3 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export default function DashboardPage() {
  return (
    <>
      <TopBar
        title="Dashboard"
        subtitle="Spend, results, and creative performance at a glance"
      />
      <EmptyState
        icon={BarChart3}
        title="No performance data yet"
        hint="Create a campaign and import metrics from Meta Ads Manager — or run the seed script for sample data."
        action={<Button href="/campaigns/new" variant="primary">Create campaign</Button>}
      />
    </>
  );
}
