import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { jsonError, parseBody } from "@/lib/api";
import { isDateStr } from "@/lib/dates";
import { GraphApiError } from "@/lib/meta/graph";
import { runSync, syncStatus } from "@/lib/meta/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(syncStatus(getDb()));
}

const syncInput = z.object({
  since: z.string().refine(isDateStr, "Use YYYY-MM-DD").optional(),
  until: z.string().refine(isDateStr, "Use YYYY-MM-DD").optional(),
});

export async function POST(req: Request) {
  const db = getDb();
  if (!syncStatus(db).configured) {
    return NextResponse.json({
      configured: false,
      message: "Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID to enable API sync",
    });
  }
  const parsed = await parseBody(req, syncInput);
  if (parsed.error) return parsed.error;
  try {
    const result = await runSync(db, parsed.data);
    return NextResponse.json({ configured: true, result });
  } catch (e) {
    if (e instanceof GraphApiError) {
      return jsonError(
        502,
        e.isAuthError ? "meta_token" : "meta_api",
        e.isAuthError
          ? `Meta rejected the access token — it may have expired. (${e.message})`
          : `Meta API error: ${e.message}`,
      );
    }
    return jsonError(502, "sync_failed", e instanceof Error ? e.message : "Sync failed");
  }
}
