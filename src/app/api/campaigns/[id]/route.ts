import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { idFromParam, jsonError, parseBody, sqliteErrorResponse } from "@/lib/api";
import { campaignPatch } from "@/lib/validation/schemas";
import { deleteCampaign, getCampaign, updateCampaign } from "@/lib/repo/campaigns";
import { getCampaignTree } from "@/lib/repo/ads";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/api/campaigns/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid campaign id");
  const db = getDb();
  const url = new URL(req.url);
  if (url.searchParams.get("tree") === "1") {
    const tree = getCampaignTree(db, id);
    if (!tree) return jsonError(404, "not_found", "Campaign not found");
    return NextResponse.json({ campaign: tree });
  }
  const campaign = getCampaign(db, id);
  if (!campaign) return jsonError(404, "not_found", "Campaign not found");
  return NextResponse.json({ campaign });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/campaigns/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid campaign id");
  const db = getDb();
  if (!getCampaign(db, id)) return jsonError(404, "not_found", "Campaign not found");
  const parsed = await parseBody(req, campaignPatch);
  if (parsed.error) return parsed.error;
  try {
    return NextResponse.json({ campaign: updateCampaign(db, id, parsed.data) });
  } catch (e) {
    return sqliteErrorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/campaigns/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid campaign id");
  const deleted = deleteCampaign(getDb(), id);
  if (!deleted) return jsonError(404, "not_found", "Campaign not found");
  return NextResponse.json({ ok: true });
}
