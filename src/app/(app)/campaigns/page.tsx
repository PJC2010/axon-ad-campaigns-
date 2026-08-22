"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { DataTable } from "@/components/data/DataTable";
import { StatusPill } from "@/components/data/StatusPill";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { apiFetch } from "@/lib/client";
import { formatDay, formatMoney } from "@/lib/format";
import { OBJECTIVES } from "@/lib/meta/enums";
import type { Campaign } from "@/lib/types";

function objectiveLabel(value: Campaign["objective"]): string {
  return OBJECTIVES.find((o) => o.value === value)?.label ?? value;
}

function budgetLabel(c: Campaign): string {
  if (!c.is_cbo) return "Ad set budgets";
  if (c.budget_cents == null) return "—";
  return `${formatMoney(c.budget_cents, true)} ${c.budget_type === "daily" ? "/ day" : "lifetime"}`;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ campaigns: Campaign[] }>("/api/campaigns")
      .then((r) => setCampaigns(r.campaigns))
      .catch(() => setError("Could not load campaigns"));
  }, []);

  return (
    <>
      <TopBar
        title="Campaigns"
        subtitle="Plan and track your Meta campaigns"
        actions={
          <Button href="/campaigns/new" variant="primary">
            <Icon icon={Plus} size={16} />
            New campaign
          </Button>
        }
      />
      {error ? <p className="text-sm text-negative">{error}</p> : null}
      {campaigns ? (
        <DataTable
          rows={campaigns}
          rowKey={(c) => c.id}
          empty={
            <EmptyState
              icon={Megaphone}
              title="No campaigns yet"
              hint="Build your first campaign with Meta's structure — objective, ad sets, ads, and creatives."
              action={
                <Button href="/campaigns/new" variant="primary">
                  Create campaign
                </Button>
              }
            />
          }
          columns={[
            {
              key: "name",
              header: "Campaign",
              render: (c) => (
                <Link
                  href={`/campaigns/${c.id}`}
                  className="font-medium text-ink hover:text-ocean"
                >
                  {c.name}
                </Link>
              ),
            },
            { key: "status", header: "Status", render: (c) => <StatusPill status={c.status} /> },
            {
              key: "objective",
              header: "Objective",
              render: (c) => <span className="text-muted">{objectiveLabel(c.objective)}</span>,
            },
            {
              key: "budget",
              header: "Budget",
              className: "text-right",
              render: (c) => <span className="numeric">{budgetLabel(c)}</span>,
            },
            {
              key: "created",
              header: "Created",
              className: "text-right",
              render: (c) => (
                <span className="text-muted">{formatDay(c.created_at.slice(0, 10))}</span>
              ),
            },
          ]}
        />
      ) : !error ? (
        <p className="text-sm text-faint">Loading…</p>
      ) : null}
    </>
  );
}
