import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { idFromParam, jsonError, parseBody, sqliteErrorResponse } from "@/lib/api";
import { adCreativesPut } from "@/lib/validation/schemas";
import { getAd, getAdCreativeLinks, replaceAdCreatives } from "@/lib/repo/ads";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: RouteContext<"/api/ads/[id]/creatives">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid ad id");
  const db = getDb();
  if (!getAd(db, id)) return jsonError(404, "not_found", "Ad not found");
  const parsed = await parseBody(req, adCreativesPut);
  if (parsed.error) return parsed.error;
  try {
    replaceAdCreatives(db, id, parsed.data);
    return NextResponse.json({ creatives: getAdCreativeLinks(db, [id]).get(id) ?? [] });
  } catch (e) {
    return sqliteErrorResponse(e);
  }
}
