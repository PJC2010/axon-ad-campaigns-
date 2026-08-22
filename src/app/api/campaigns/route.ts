import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { jsonError, parseBody, sqliteErrorResponse } from "@/lib/api";
import { campaignCreate } from "@/lib/validation/schemas";
import { createCampaign, listCampaigns } from "@/lib/repo/campaigns";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  return NextResponse.json({ campaigns: listCampaigns(db) });
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, campaignCreate);
  if (parsed.error) return parsed.error;
  try {
    const campaign = createCampaign(getDb(), parsed.data);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (e) {
    return sqliteErrorResponse(e) ?? jsonError(500, "internal", "Could not create campaign");
  }
}
