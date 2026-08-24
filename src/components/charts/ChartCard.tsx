"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui/Card";

const emptySubscribe = () => () => {};
/** True after hydration, false during SSR — the lint-clean mount gate. */
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * Chart container: fixed-height body (ResponsiveContainer needs a sized parent)
 * plus a mount gate so Recharts only renders client-side after hydration.
 */
export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  height = 240,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  height?: number;
}) {
  const mounted = useMounted();
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} actions={actions} />
      <div className="px-3 py-3" style={{ height }}>
        {mounted ? children : null}
      </div>
    </Card>
  );
}
