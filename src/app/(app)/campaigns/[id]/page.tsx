import { TopBar } from "@/components/layout/TopBar";

export default async function CampaignDetailPage({
  params,
}: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  return (
    <>
      <TopBar title={`Campaign ${id}`} />
      <p className="text-sm text-muted">Campaign detail lands in the next build phase.</p>
    </>
  );
}
