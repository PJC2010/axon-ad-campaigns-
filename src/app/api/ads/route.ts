import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { jsonError, parseBody, sqliteErrorResponse } from "@/lib/api";
import { adCreate } from "@/lib/validation/schemas";
import { createAd } from "@/lib/repo/ads";
import { getAdSet } from "@/lib/repo/adsets";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseBody(req, adCreate);
  if (parsed.error) return parsed.error;
  const db = getDb();
  if (!getAdSet(db, parsed.data.adset_id)) {
    return jsonError(404, "not_found", "Ad set not found");
  }
  try {
    const ad = createAd(db, parsed.data);
    return NextResponse.json({ ad }, { status: 201 });
  } catch (e) {
    return sqliteErrorResponse(e);
  }
}
