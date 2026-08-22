import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { jsonError, parseBody, sqliteErrorResponse } from "@/lib/api";
import { adSetCreate } from "@/lib/validation/schemas";
import { createAdSet } from "@/lib/repo/adsets";
import { getCampaign } from "@/lib/repo/campaigns";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseBody(req, adSetCreate);
  if (parsed.error) return parsed.error;
  const db = getDb();
  if (!getCampaign(db, parsed.data.campaign_id)) {
    return jsonError(404, "not_found", "Campaign not found");
  }
  try {
    const adSet = createAdSet(db, parsed.data);
    return NextResponse.json({ adSet }, { status: 201 });
  } catch (e) {
    return sqliteErrorResponse(e);
  }
}
