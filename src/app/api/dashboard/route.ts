import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { isDateStr } from "@/lib/dates";
import { buildDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!isDateStr(from) || !isDateStr(to) || from > to) {
    return jsonError(400, "bad_range", "Pass from and to as YYYY-MM-DD with from <= to");
  }
  return NextResponse.json(buildDashboard(getDb(), from, to));
}
