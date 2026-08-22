import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { idFromParam, jsonError, parseBody } from "@/lib/api";
import { setRecommendationStatus } from "@/lib/repo/recommendations";

export const dynamic = "force-dynamic";

const statusInput = z.object({ status: z.enum(["new", "dismissed", "done"]) });

export async function PATCH(req: Request, ctx: RouteContext<"/api/recommendations/[id]">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid recommendation id");
  const parsed = await parseBody(req, statusInput);
  if (parsed.error) return parsed.error;
  const updated = setRecommendationStatus(getDb(), id, parsed.data.status);
  if (!updated) return jsonError(404, "not_found", "Recommendation not found");
  return NextResponse.json({ recommendation: updated });
}
