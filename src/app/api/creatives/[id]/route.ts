import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { UPLOADS_DIR } from "@/lib/env";
import { idFromParam, jsonError, parseBody } from "@/lib/api";
import { creativePatch } from "@/lib/validation/schemas";
import {
  creativeUsage,
  deleteCreative,
  getCreative,
  updateCreative,
} from "@/lib/repo/creatives";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/creatives/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid creative id");
  const db = getDb();
  const creative = getCreative(db, id);
  if (!creative) return jsonError(404, "not_found", "Creative not found");
  return NextResponse.json({ creative, usage: creativeUsage(db, id) });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/creatives/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid creative id");
  const db = getDb();
  if (!getCreative(db, id)) return jsonError(404, "not_found", "Creative not found");
  const parsed = await parseBody(req, creativePatch);
  if (parsed.error) return parsed.error;
  return NextResponse.json({ creative: updateCreative(db, id, parsed.data) });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/creatives/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid creative id");
  const removed = deleteCreative(getDb(), id);
  if (!removed) return jsonError(404, "not_found", "Creative not found");
  fs.rmSync(path.join(UPLOADS_DIR, removed.filename), { force: true });
  return NextResponse.json({ ok: true });
}
