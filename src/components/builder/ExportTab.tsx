"use client";

import { FileDown, FolderArchive } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { META_BULK_COLUMNS } from "@/lib/export/metaBulk";

export function ExportTab({ campaignId }: { campaignId: number }) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Meta Ads Manager import"
          subtitle="Recreate this campaign in Ads Manager without retyping anything"
        />
        <div className="p-5">
          <p className="max-w-2xl text-sm leading-relaxed text-ink/85">
            Download the campaign as a bulk-import sheet. In Ads Manager choose{" "}
            <span className="font-medium">Import &amp; export → Import ads in bulk</span>, upload
            the CSV, and match any columns it asks about. The zip bundle also includes every
            attached creative file so you can upload them alongside the sheet.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button href={`/api/campaigns/${campaignId}/export`} variant="primary">
              <Icon icon={FolderArchive} size={16} />
              Download bundle (.zip)
            </Button>
            <Button href={`/api/campaigns/${campaignId}/export?format=csv`}>
              <Icon icon={FileDown} size={16} />
              CSV only
            </Button>
          </div>
          <ul className="mt-5 max-w-2xl list-inside list-disc space-y-1 text-xs text-muted">
            <li>Draft and archived items are exported as paused.</li>
            <li>
              Carousel ads list their card files joined with a semicolon in one column — Ads
              Manager may ask you to arrange the cards after import.
            </li>
            <li>Audience details beyond location, age, and gender stay in this workspace.</li>
          </ul>
        </div>
      </Card>

      <Card>
        <CardHeader title="Columns in the sheet" />
        <p className="flex flex-wrap gap-1.5 p-5">
          {META_BULK_COLUMNS.map((c) => (
            <span key={c} className="rounded-full bg-ink/5 px-2.5 py-1 text-xs text-muted">
              {c}
            </span>
          ))}
        </p>
      </Card>
    </div>
  );
}
