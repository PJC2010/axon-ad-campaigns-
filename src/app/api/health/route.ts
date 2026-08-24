import { NextResponse } from "next/server";
import fs from "node:fs";
import { DATA_DIR, UPLOADS_DIR, claudeConfigured, metaConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  let storage = false;
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
    storage = true;
  } catch {
    storage = false;
  }

  return NextResponse.json({
    ok: storage,
    storage,
    metaConfigured: metaConfigured(),
    claudeConfigured: claudeConfigured(),
  });
}
