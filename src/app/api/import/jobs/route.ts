import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listImportJobs } from "@/lib/repo/jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ jobs: listImportJobs(getDb()) });
}
