import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { idFromParam, jsonError, parseBody, sqliteErrorResponse } from "@/lib/api";
import { adSetPatch } from "@/lib/validation/schemas";
import { deleteAdSet, getAdSet, updateAdSet } from "@/lib/repo/adsets";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/adsets/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid ad set id");
  const adSet = getAdSet(getDb(), id);
  if (!adSet) return jsonError(404, "not_found", "Ad set not found");
  return NextResponse.json({ adSet });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/adsets/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid ad set id");
  const db = getDb();
  if (!getAdSet(db, id)) return jsonError(404, "not_found", "Ad set not found");
  const parsed = await parseBody(req, adSetPatch);
  if (parsed.error) return parsed.error;
  try {
    return NextResponse.json({ adSet: updateAdSet(db, id, parsed.data) });
  } catch (e) {
    return sqliteErrorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/adsets/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid ad set id");
  const deleted = deleteAdSet(getDb(), id);
  if (!deleted) return jsonError(404, "not_found", "Ad set not found");
  return NextResponse.json({ ok: true });
}
