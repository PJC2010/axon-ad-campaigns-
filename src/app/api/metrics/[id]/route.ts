import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { idFromParam, jsonError } from "@/lib/api";
import { deleteMetric } from "@/lib/repo/metrics";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/metrics/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid metric id");
  const deleted = deleteMetric(getDb(), id);
  if (!deleted) return jsonError(404, "not_found", "Metric row not found");
  return NextResponse.json({ ok: true });
}
