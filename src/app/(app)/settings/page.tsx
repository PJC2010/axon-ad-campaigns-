import { Settings } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";

export default function SettingsPage() {
  return (
    <>
      <TopBar title="Settings" subtitle="Workspace configuration" />
      <EmptyState
        icon={Settings}
        title="Settings land in a later build phase"
        hint="Connection status, currency, and the Claude model override will live here."
      />
    </>
  );
}
