import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { idFromParam, jsonError, parseBody, sqliteErrorResponse } from "@/lib/api";
import { adPatch } from "@/lib/validation/schemas";
import { deleteAd, getAd, getAdCreativeLinks, updateAd } from "@/lib/repo/ads";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/ads/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid ad id");
  const db = getDb();
  const ad = getAd(db, id);
  if (!ad) return jsonError(404, "not_found", "Ad not found");
  const creatives = getAdCreativeLinks(db, [id]).get(id) ?? [];
  return NextResponse.json({ ad: { ...ad, creatives } });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/ads/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid ad id");
  const db = getDb();
  if (!getAd(db, id)) return jsonError(404, "not_found", "Ad not found");
  const parsed = await parseBody(req, adPatch);
  if (parsed.error) return parsed.error;
  try {
    return NextResponse.json({ ad: updateAd(db, id, parsed.data) });
  } catch (e) {
    return sqliteErrorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/ads/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid ad id");
  const deleted = deleteAd(getDb(), id);
  if (!deleted) return jsonError(404, "not_found", "Ad not found");
  return NextResponse.json({ ok: true });
}
