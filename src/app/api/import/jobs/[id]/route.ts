import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { idFromParam, jsonError } from "@/lib/api";
import { deleteImportJob } from "@/lib/repo/jobs";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/import/jobs/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid job id");
  const result = deleteImportJob(getDb(), id);
  if (!result) return jsonError(404, "not_found", "Import job not found");
  return NextResponse.json({ ok: true, ...result });
}
