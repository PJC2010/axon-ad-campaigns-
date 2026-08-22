"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  Layers,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusPill } from "@/components/data/StatusPill";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Tabs } from "@/components/ui/Tabs";
import { CampaignForm } from "@/components/builder/CampaignForm";
import { AdSetForm } from "@/components/builder/AdSetForm";
import { AdForm } from "@/components/builder/AdForm";
import { apiFetch } from "@/lib/client";
import { formatMoney } from "@/lib/format";
import { AD_FORMATS, GENDERS, OBJECTIVES, countryName } from "@/lib/meta/enums";
import type { AdSetTree, AdWithCreatives, CampaignTree } from "@/lib/types";

type Tab = "structure" | "performance" | "export";

function targetingSummary(s: AdSetTree): string {
  const parts: string[] = [];
  parts.push(
    s.countries.length === 0
      ? "All locations"
      : s.countries.length <= 3
        ? s.countries.map(countryName).join(", ")
        : `${s.countries.slice(0, 2).map(countryName).join(", ")} +${s.countries.length - 2}`,
  );
  parts.push(`${s.age_min}–${s.age_max === 65 ? "65+" : s.age_max}`);
  if (s.genders !== "all") {
    parts.push(GENDERS.find((g) => g.value === s.genders)?.label ?? s.genders);
  }
  if (s.interests.length > 0) parts.push(`${s.interests.length} interests`);
  parts.push(s.placement_type === "advantage_plus" ? "Advantage+ placements" : "Manual placements");
  return parts.join(" · ");
}

export default function CampaignDetailPage({ params }: PageProps<"/campaigns/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const [tree, setTree] = useState<CampaignTree | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("structure");
  const [editCampaign, setEditCampaign] = useState(false);
  const [adSetDrawer, setAdSetDrawer] = useState<{ open: boolean; initial: AdSetTree | null }>({
    open: false,
    initial: null,
  });
  const [adDrawer, setAdDrawer] = useState<{
    open: boolean;
    adsetId: number;
    initial: AdWithCreatives | null;
  }>({ open: false, adsetId: 0, initial: null });

  const reload = useCallback(() => {
    apiFetch<{ campaign: CampaignTree }>(`/api/campaigns/${id}?tree=1`)
      .then((r) => setTree(r.campaign))
      .catch(() => setNotFound(true));
  }, [id]);

  useEffect(reload, [reload]);

  async function toggleStatus() {
    if (!tree) return;
    const next = tree.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    await apiFetch(`/api/campaigns/${tree.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    reload();
  }

  async function deleteCampaign() {
    if (!tree) return;
    if (!window.confirm(`Delete "${tree.name}" and all its ad sets, ads, and metrics?`)) return;
    await apiFetch(`/api/campaigns/${tree.id}`, { method: "DELETE" });
    router.push("/campaigns");
  }

  async function deleteAdSet(s: AdSetTree) {
    if (!window.confirm(`Delete ad set "${s.name}" and its ads?`)) return;
    await apiFetch(`/api/adsets/${s.id}`, { method: "DELETE" });
    reload();
  }

  async function deleteAd(a: AdWithCreatives) {
    if (!window.confirm(`Delete ad "${a.name}"?`)) return;
    await apiFetch(`/api/ads/${a.id}`, { method: "DELETE" });
    reload();
  }

  if (notFound) {
    return (
      <>
        <TopBar title="Campaign not found" />
        <EmptyState
          icon={Layers}
          title="This campaign does not exist"
          action={<Button href="/campaigns">Back to campaigns</Button>}
        />
      </>
    );
  }

  if (!tree) {
    return (
      <>
        <TopBar title="Campaign" />
        <p className="text-sm text-faint">Loading…</p>
      </>
    );
  }

  const objective = OBJECTIVES.find((o) => o.value === tree.objective);
  const budget = tree.is_cbo
    ? `${formatMoney(tree.budget_cents, true)} ${tree.budget_type === "daily" ? "per day" : "lifetime"} · Advantage campaign budget`
    : "Budgets set per ad set";

  return (
    <>
      <TopBar
        title={tree.name}
        subtitle={`${objective?.label ?? tree.objective} · ${budget}`}
        actions={
          <>
            <Button size="sm" onClick={() => void toggleStatus()}>
              {tree.status === "ACTIVE" ? "Pause" : "Activate"}
            </Button>
            <Button size="sm" onClick={() => setEditCampaign(true)}>
              <Icon icon={Pencil} size={14} />
              Edit
            </Button>
            <Button size="sm" variant="danger" onClick={() => void deleteCampaign()}>
              <Icon icon={Trash2} size={14} />
            </Button>
            <StatusPill status={tree.status} />
          </>
        }
      />

      <Tabs
        tabs={[
          { value: "structure", label: "Structure" },
          { value: "performance", label: "Performance" },
          { value: "export", label: "Export" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "structure" ? (
        <div className="space-y-5">
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setAdSetDrawer({ open: true, initial: null })}
            >
              <Icon icon={Plus} size={15} />
              Add ad set
            </Button>
          </div>

          {tree.ad_sets.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No ad sets yet"
              hint="An ad set defines audience, budget, placements, and delivery. Ads live inside it."
              action={
                <Button
                  variant="primary"
                  onClick={() => setAdSetDrawer({ open: true, initial: null })}
                >
                  Add ad set
                </Button>
              }
            />
          ) : (
            tree.ad_sets.map((s) => (
              <Card key={s.id}>
                <CardHeader
                  title={s.name}
                  subtitle={targetingSummary(s)}
                  actions={
                    <>
                      <StatusPill status={s.status} />
                      {!tree.is_cbo && s.budget_cents != null ? (
                        <Badge tone="neutral">
                          <span className="numeric">
                            {formatMoney(s.budget_cents, true)}
                            {s.budget_type === "daily" ? "/day" : " lifetime"}
                          </span>
                        </Badge>
                      ) : null}
                      <Button
                        size="sm"
                        onClick={() => setAdDrawer({ open: true, adsetId: s.id, initial: null })}
                      >
                        <Icon icon={Plus} size={14} />
                        Ad
                      </Button>
                      <Button size="sm" onClick={() => setAdSetDrawer({ open: true, initial: s })}>
                        <Icon icon={Pencil} size={14} />
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void deleteAdSet(s)}>
                        <Icon icon={Trash2} size={14} />
                      </Button>
                    </>
                  }
                />
                {s.ads.length === 0 ? (
                  <p className="px-5 py-4 text-[13px] text-muted">
                    No ads in this ad set yet.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {s.ads.map((a) => (
                        <tr
                          key={a.id}
                          className="border-b border-hairline last:border-b-0 hover:bg-ink/2"
                        >
                          <td className="px-5 py-3 font-medium">{a.name}</td>
                          <td className="px-3 py-3 text-muted">
                            {AD_FORMATS.find((f) => f.value === a.format)?.label}
                          </td>
                          <td className="px-3 py-3">
                            <StatusPill status={a.status} />
                          </td>
                          <td className="px-3 py-3 text-muted">
                            {a.creatives.length > 0
                              ? `${a.creatives.length} creative${a.creatives.length > 1 ? "s" : ""}`
                              : "No creative"}
                          </td>
                          <td className="px-5 py-3">
                            <span className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setAdDrawer({ open: true, adsetId: s.id, initial: a })
                                }
                              >
                                <Icon icon={Pencil} size={14} />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => void deleteAd(a)}>
                                <Icon icon={Trash2} size={14} />
                              </Button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            ))
          )}
        </div>
      ) : null}

      {tab === "performance" ? (
        <EmptyState
          icon={CalendarRange}
          title="Performance lands with the metrics phase"
          hint="Import data or run the seed script, then this tab shows the campaign's trends and breakdowns."
        />
      ) : null}

      {tab === "export" ? (
        <EmptyState
          icon={Layers}
          title="Export lands with the bulk-export phase"
          hint="You will download a Meta Ads Manager import sheet plus the attached creative files."
        />
      ) : null}

      <Drawer
        open={editCampaign}
        onClose={() => setEditCampaign(false)}
        title="Edit campaign"
        wide
      >
        <CampaignForm
          initial={tree}
          onSaved={() => {
            setEditCampaign(false);
            reload();
          }}
          onCancel={() => setEditCampaign(false)}
        />
      </Drawer>

      <AdSetForm
        open={adSetDrawer.open}
        campaignId={tree.id}
        campaignIsCbo={tree.is_cbo}
        initial={adSetDrawer.initial}
        onClose={() => setAdSetDrawer((d) => ({ ...d, open: false }))}
        onSaved={reload}
      />

      <AdForm
        open={adDrawer.open}
        adsetId={adDrawer.adsetId}
        initial={adDrawer.initial}
        onClose={() => setAdDrawer((d) => ({ ...d, open: false }))}
        onSaved={reload}
      />
    </>
  );
}
