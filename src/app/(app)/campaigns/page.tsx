import { Megaphone } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export default function CampaignsPage() {
  return (
    <>
      <TopBar title="Campaigns" subtitle="Plan and track your Meta campaigns" />
      <EmptyState
        icon={Megaphone}
        title="No campaigns yet"
        hint="Build your first campaign with Meta's structure — objective, ad sets, ads, and creatives."
        action={<Button href="/campaigns/new" variant="primary">Create campaign</Button>}
      />
    </>
  );
}
