"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "@/lib/metrics/derive";
import { formatCompact, formatDay, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { AXIS_TICK, CHART } from "./chartTheme";
import { ChartTip } from "./ChartTip";

const MARGIN = { top: 8, right: 8, bottom: 0, left: 4 };

function dayTick(value: string): string {
  return formatDay(value).replace(/, \d{4}$/, "");
}

function sharedAxes(maxTicks = 6) {
  return {
    x: (
      <XAxis
        dataKey="date"
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={{ stroke: CHART.grid }}
        tickFormatter={dayTick}
        minTickGap={42}
        interval="preserveStartEnd"
      />
    ),
    maxTicks,
  };
}

/** Spend over time — single-series area, money axis. */
export function SpendTrendChart({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={MARGIN}>
        <defs>
          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.series1} stopOpacity={0.2} />
            <stop offset="100%" stopColor={CHART.series1} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        {sharedAxes().x}
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(v: number) => `$${formatCompact(v / 100)}`}
        />
        <Tooltip
          cursor={{ stroke: CHART.cursor, strokeWidth: 1 }}
          content={({ active, label, payload }) => (
            <ChartTip
              active={active}
              label={label as string}
              rows={
                payload?.length
                  ? [
                      {
                        name: "Spend",
                        value: formatMoney((payload[0].payload as SeriesPoint).spend_cents),
                        swatch: CHART.series1,
                      },
                    ]
                  : []
              }
            />
          )}
        />
        <Area
          type="monotone"
          dataKey="spend_cents"
          stroke={CHART.series1}
          strokeWidth={2}
          fill="url(#spendFill)"
          activeDot={{ r: 4, strokeWidth: 2, stroke: "#fdfbf7" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Count over time — single-series bars with rounded data-ends. */
export function CountBarsChart({
  data,
  dataKey,
  name,
  color = CHART.series4,
}: {
  data: SeriesPoint[];
  dataKey: "clicks" | "conversions" | "impressions";
  name: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={MARGIN} barCategoryGap="28%">
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        {sharedAxes().x}
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => formatCompact(v)}
        />
        <Tooltip
          cursor={{ fill: "rgba(22, 24, 29, 0.04)" }}
          content={({ active, label, payload }) => (
            <ChartTip
              active={active}
              label={label as string}
              rows={
                payload?.length
                  ? [
                      {
                        name,
                        value: formatNumber((payload[0].payload as SeriesPoint)[dataKey]),
                        swatch: color,
                      },
                    ]
                  : []
              }
            />
          )}
        />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Rate over time — single-series 2px line, percent axis. */
export function RateLineChart({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={MARGIN}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        {sharedAxes().x}
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v: number) => formatPercent(v, 1)}
        />
        <Tooltip
          cursor={{ stroke: CHART.cursor, strokeWidth: 1 }}
          content={({ active, label, payload }) => (
            <ChartTip
              active={active}
              label={label as string}
              rows={
                payload?.length
                  ? [
                      {
                        name: "CTR",
                        value: formatPercent((payload[0].payload as SeriesPoint).ctr),
                        swatch: CHART.series3,
                      },
                    ]
                  : []
              }
            />
          )}
        />
        <Line
          type="monotone"
          dataKey="ctr"
          stroke={CHART.series3}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "#fdfbf7" }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
