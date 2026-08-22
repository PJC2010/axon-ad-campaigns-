import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { idFromParam, jsonError } from "@/lib/api";
import { isDateStr } from "@/lib/dates";
import { getCampaign } from "@/lib/repo/campaigns";
import { buildCampaignInsights } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/api/campaigns/[id]/insights">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid campaign id");
  const db = getDb();
  if (!getCampaign(db, id)) return jsonError(404, "not_found", "Campaign not found");
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!isDateStr(from) || !isDateStr(to) || from > to) {
    return jsonError(400, "bad_range", "Pass from and to as YYYY-MM-DD with from <= to");
  }
  return NextResponse.json(buildCampaignInsights(db, id, from, to));
}
