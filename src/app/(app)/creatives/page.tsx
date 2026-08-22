import { Images } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";

export default function CreativesPage() {
  return (
    <>
      <TopBar title="Creatives" subtitle="Your image and video library" />
      <EmptyState
        icon={Images}
        title="No creatives yet"
        hint="Upload images and videos, then attach them to ads in the campaign builder."
      />
    </>
  );
}
