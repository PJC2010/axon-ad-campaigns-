import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { jsonError, parseBody, sqliteErrorResponse } from "@/lib/api";
import { manualMetricInput } from "@/lib/validation/schemas";
import { isDateStr } from "@/lib/dates";
import { listMetrics, upsertMetricDaily } from "@/lib/repo/metrics";
import { selectEffectiveDaily } from "@/lib/metrics/effective";
import { aggregate, derive } from "@/lib/metrics/derive";
import { getAdSet } from "@/lib/repo/adsets";
import { getAd } from "@/lib/repo/ads";
import { getCampaign } from "@/lib/repo/campaigns";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!isDateStr(from) || !isDateStr(to) || from > to) {
    return jsonError(400, "bad_range", "Pass from and to as YYYY-MM-DD with from <= to");
  }
  const num = (k: string): number | undefined => {
    const v = url.searchParams.get(k);
    return v ? Number(v) : undefined;
  };
  const db = getDb();
  const rows =
    url.searchParams.get("effective") === "1"
      ? selectEffectiveDaily(db, { from, to, campaignId: num("campaignId") })
      : listMetrics(db, {
          from,
          to,
          campaignId: num("campaignId"),
          adSetId: num("adSetId"),
          adId: num("adId"),
        });
  const totals = aggregate(rows);
  return NextResponse.json({ rows, totals, derived: derive(totals) });
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, manualMetricInput);
  if (parsed.error) return parsed.error;
  const m = parsed.data;
  const db = getDb();

  if (!getCampaign(db, m.campaign_id)) return jsonError(404, "not_found", "Campaign not found");
  if (m.adset_id) {
    const adSet = getAdSet(db, m.adset_id);
    if (!adSet || adSet.campaign_id !== m.campaign_id) {
      return jsonError(400, "bad_reference", "That ad set does not belong to the campaign");
    }
  }
  if (m.ad_id) {
    const ad = getAd(db, m.ad_id);
    if (!ad || ad.adset_id !== m.adset_id) {
      return jsonError(400, "bad_reference", "That ad does not belong to the ad set");
    }
  }

  try {
    const outcome = upsertMetricDaily(db, { ...m, source: "manual" });
    return NextResponse.json({ ok: true, outcome }, { status: outcome === "inserted" ? 201 : 200 });
  } catch (e) {
    return sqliteErrorResponse(e);
  }
}
