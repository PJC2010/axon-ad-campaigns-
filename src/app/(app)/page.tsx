"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { MetricCard } from "@/components/data/MetricCard";
import { DateRangePicker, lastNDays, type DateRange } from "@/components/data/DateRangePicker";
import { DataTable } from "@/components/data/DataTable";
import { StatusPill } from "@/components/data/StatusPill";
import { ChartCard } from "@/components/charts/ChartCard";
import { CreativeCompare } from "@/components/charts/CreativeCompare";
import {
  CountBarsChart,
  RateLineChart,
  SpendTrendChart,
} from "@/components/charts/TrendCharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { apiFetch } from "@/lib/client";
import {
  formatCompact,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRatio,
} from "@/lib/format";
import { OBJECTIVES } from "@/lib/meta/enums";
import type { DashboardPayload } from "@/lib/dashboard";
import { CHART } from "@/components/charts/chartTheme";

function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / prev;
}

export default function DashboardPage() {
  const [range, setRange] = useState<DateRange>(() => lastNDays(30));
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    apiFetch<DashboardPayload>(`/api/dashboard?from=${range.from}&to=${range.to}`)
      .then(setData)
      .catch(() => setError("Could not load the dashboard"));
  }, [range]);

  const empty = data != null && data.kpis.totals.impressions === 0 && data.kpis.totals.spend_cents === 0;

  return (
    <>
      <TopBar
        title="Dashboard"
        subtitle="Spend, results, and creative performance at a glance"
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />
      {error ? <p className="text-sm text-negative">{error}</p> : null}
      {!data && !error ? <p className="text-sm text-faint">Loading…</p> : null}

      {data && empty ? (
        <EmptyState
          icon={BarChart3}
          title="No performance data in this range"
          hint="Import metrics from Meta Ads Manager on the Import page — or run `npm run seed` for sample data."
          action={<Button href="/import" variant="primary">Import data</Button>}
        />
      ) : null}

      {data && !empty ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Spend"
              value={formatMoney(data.kpis.totals.spend_cents, true)}
              delta={pctChange(data.kpis.totals.spend_cents, data.kpis.prev.totals.spend_cents)}
              goodWhen="neutral"
            />
            <MetricCard
              label="Impressions"
              value={formatCompact(data.kpis.totals.impressions)}
              delta={pctChange(data.kpis.totals.impressions, data.kpis.prev.totals.impressions)}
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
              label="CPC"
              value={formatMoney(data.kpis.derived.cpc_cents)}
              delta={pctChange(data.kpis.derived.cpc_cents, data.kpis.prev.derived.cpc_cents)}
              goodWhen="down"
            />
            <MetricCard
              label="CPM"
              value={formatMoney(data.kpis.derived.cpm_cents)}
              delta={pctChange(data.kpis.derived.cpm_cents, data.kpis.prev.derived.cpm_cents)}
              goodWhen="down"
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
            <ChartCard title="Spend" subtitle="Daily spend across all campaigns">
              <SpendTrendChart data={data.series} />
            </ChartCard>
            <ChartCard title="Link clicks" subtitle="Daily clicks across all campaigns">
              <CountBarsChart data={data.series} dataKey="clicks" name="Link clicks" />
            </ChartCard>
            <ChartCard title="CTR" subtitle="Click-through rate by day">
              <RateLineChart data={data.series} />
            </ChartCard>
            <ChartCard title="Conversions" subtitle="Results recorded by day">
              <CountBarsChart
                data={data.series}
                dataKey="conversions"
                name="Conversions"
                color={CHART.series2}
              />
            </ChartCard>
          </div>

          <Card>
            <CardHeader
              title="Campaigns"
              subtitle="Ranked by spend in the selected range"
            />
            <DataTable
              rows={data.leaderboard}
              rowKey={(r) => r.campaign.id}
              columns={[
                {
                  key: "name",
                  header: "Campaign",
                  render: (r) => (
                    <Link
                      href={`/campaigns/${r.campaign.id}`}
                      className="font-medium hover:text-ocean"
                    >
                      {r.campaign.name}
                    </Link>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (r) => <StatusPill status={r.campaign.status} />,
                },
                {
                  key: "objective",
                  header: "Objective",
                  render: (r) => (
                    <span className="text-muted">
                      {OBJECTIVES.find((o) => o.value === r.campaign.objective)?.label}
                    </span>
                  ),
                },
                {
                  key: "spend",
                  header: "Spend",
                  className: "text-right",
                  render: (r) => (
                    <span className="numeric">{formatMoney(r.totals.spend_cents, true)}</span>
                  ),
                },
                {
                  key: "impr",
                  header: "Impr.",
                  className: "text-right",
                  render: (r) => (
                    <span className="numeric">{formatCompact(r.totals.impressions)}</span>
                  ),
                },
                {
                  key: "ctr",
                  header: "CTR",
                  className: "text-right",
                  render: (r) => <span className="numeric">{formatPercent(r.derived.ctr)}</span>,
                },
                {
                  key: "cpa",
                  header: "CPA",
                  className: "text-right",
                  render: (r) => <span className="numeric">{formatMoney(r.derived.cpa_cents)}</span>,
                },
                {
                  key: "roas",
                  header: "ROAS",
                  className: "text-right",
                  render: (r) => <span className="numeric">{formatRatio(r.derived.roas)}</span>,
                },
              ]}
            />
          </Card>

          <Card>
            <CardHeader
              title="Creative performance"
              subtitle="Derived from ad-level metrics via each ad's attached creatives"
            />
            <CreativeCompare rows={data.creatives} />
          </Card>
        </div>
      ) : null}
    </>
  );
}
