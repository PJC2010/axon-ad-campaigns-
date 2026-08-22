"use client";

import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/Card";
import { CampaignForm } from "@/components/builder/CampaignForm";

export default function NewCampaignPage() {
  const router = useRouter();
  return (
    <>
      <TopBar
        title="New campaign"
        subtitle="Start at the campaign level — you add ad sets and ads next"
      />
      <Card className="max-w-3xl p-6">
        <CampaignForm
          onSaved={(c) => router.push(`/campaigns/${c.id}`)}
          onCancel={() => router.push("/campaigns")}
        />
      </Card>
    </>
  );
}
