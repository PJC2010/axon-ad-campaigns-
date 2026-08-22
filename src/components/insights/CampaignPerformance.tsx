"use client";

import { useEffect, useState } from "react";
import { CalendarRange } from "lucide-react";
import { MetricCard } from "@/components/data/MetricCard";
import { DateRangePicker, lastNDays, type DateRange } from "@/components/data/DateRangePicker";
import { DataTable } from "@/components/data/DataTable";
import { ChartCard } from "@/components/charts/ChartCard";
import { CountBarsChart, SpendTrendChart } from "@/components/charts/TrendCharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/client";
import {
  formatCompact,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRatio,
} from "@/lib/format";
import type { CampaignInsightsPayload } from "@/lib/dashboard";

function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / prev;
}

export function CampaignPerformance({ campaignId }: { campaignId: number }) {
  const [range, setRange] = useState<DateRange>(() => lastNDays(30));
  const [data, setData] = useState<CampaignInsightsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<CampaignInsightsPayload>(
      `/api/campaigns/${campaignId}/insights?from=${range.from}&to=${range.to}`,
    )
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load campaign performance");
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, range]);

  if (error) return <p className="text-sm text-negative">{error}</p>;
  if (!data) return <p className="text-sm text-faint">Loading…</p>;

  const empty = data.kpis.totals.impressions === 0 && data.kpis.totals.spend_cents === 0;

  const breakdownColumns = <T extends { totals: CampaignInsightsPayload["kpis"]["totals"]; derived: CampaignInsightsPayload["kpis"]["derived"] }>() => [
    {
      key: "spend",
      header: "Spend",
      className: "text-right",
      render: (r: T) => <span className="numeric">{formatMoney(r.totals.spend_cents, true)}</span>,
    },
    {
      key: "impr",
      header: "Impr.",
      className: "text-right",
      render: (r: T) => <span className="numeric">{formatCompact(r.totals.impressions)}</span>,
    },
    {
      key: "clicks",
      header: "Clicks",
      className: "text-right",
      render: (r: T) => <span className="numeric">{formatCompact(r.totals.clicks)}</span>,
    },
    {
      key: "ctr",
      header: "CTR",
      className: "text-right",
      render: (r: T) => <span className="numeric">{formatPercent(r.derived.ctr)}</span>,
    },
    {
      key: "conv",
      header: "Conv.",
      className: "text-right",
      render: (r: T) => <span className="numeric">{formatNumber(r.totals.conversions)}</span>,
    },
    {
      key: "cpa",
      header: "CPA",
      className: "text-right",
      render: (r: T) => <span className="numeric">{formatMoney(r.derived.cpa_cents)}</span>,
    },
    {
      key: "roas",
      header: "ROAS",
      className: "text-right",
      render: (r: T) => <span className="numeric">{formatRatio(r.derived.roas)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {empty ? (
        <EmptyState
          icon={CalendarRange}
          title="No metrics in this range"
          hint="Import data on the Import page, add a manual entry, or run the seed script."
          action={<Button href="/import">Import data</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricCard
              label="Spend"
              value={formatMoney(data.kpis.totals.spend_cents, true)}
              delta={pctChange(data.kpis.totals.spend_cents, data.kpis.prev.totals.spend_cents)}
              goodWhen="neutral"
            />
            <MetricCard
              label="Link clicks"
              value={formatCompact(data.kpis.totals.clicks)}
              delta={pctChange(data.kpis.totals.clicks, data.kpis.prev.totals.clicks)}
            />
            <MetricCard
              label="CTR"
              value={formatPercent(data.kpis.derived.ctr)}
              delta={pctChange(data.kpis.derived.ctr, data.kpis.prev.derived.ctr)}
            />
            <MetricCard
              label="Conversions"
              value={formatNumber(data.kpis.totals.conversions)}
              delta={pctChange(data.kpis.totals.conversions, data.kpis.prev.totals.conversions)}
            />
            <MetricCard
              label="ROAS"
              value={formatRatio(data.kpis.derived.roas)}
              delta={pctChange(data.kpis.derived.roas, data.kpis.prev.derived.roas)}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ChartCard title="Spend" subtitle="Daily spend for this campaign">
              <SpendTrendChart data={data.series} />
            </ChartCard>
            <ChartCard title="Link clicks" subtitle="Daily clicks for this campaign">
              <CountBarsChart data={data.series} dataKey="clicks" name="Link clicks" />
            </ChartCard>
          </div>

          {data.hasUnattributedDays ? (
            <p className="text-xs text-faint">
              Some days in this range only have campaign-level metrics, so they appear in the
              totals but not in the ad set or ad breakdowns.
            </p>
          ) : null}

          {data.adSets.length > 0 ? (
            <Card>
              <CardHeader title="Ad sets" subtitle="Ranked by spend" />
              <DataTable
                rows={data.adSets}
                rowKey={(r) => r.id ?? "campaign-level"}
                columns={[
                  {
                    key: "name",
                    header: "Ad set",
                    render: (r) => <span className="font-medium">{r.name}</span>,
                  },
                  ...breakdownColumns<(typeof data.adSets)[number]>(),
                ]}
              />
            </Card>
          ) : null}

          {data.ads.length > 0 ? (
            <Card>
              <CardHeader title="Ads" subtitle="Ranked by spend" />
              <DataTable
                rows={data.ads}
                rowKey={(r) => r.id}
                columns={[
                  {
                    key: "name",
                    header: "Ad",
                    render: (r) => (
                      <span>
                        <span className="block font-medium">{r.name}</span>
                        <span className="block text-xs text-faint">{r.adset_name}</span>
                      </span>
                    ),
                  },
                  ...breakdownColumns<(typeof data.ads)[number]>(),
                ]}
              />
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
