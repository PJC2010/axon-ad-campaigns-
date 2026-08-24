import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { parseBody } from "@/lib/api";
import { claudeConfigured, metaConfigured } from "@/lib/env";
import { getAllSettings, setSetting } from "@/lib/repo/settings";
import { DEFAULT_CLAUDE_MODEL, resolveClaudeModel } from "@/lib/reco/claude";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  return NextResponse.json({
    settings: getAllSettings(db),
    metaConfigured: metaConfigured(),
    claudeConfigured: claudeConfigured(),
    claudeModel: resolveClaudeModel(db),
    claudeModelDefault: DEFAULT_CLAUDE_MODEL,
  });
}

const settingsPatch = z.object({
  claude_model: z
    .string()
    .trim()
    .regex(/^claude-[a-z0-9.-]+$/, "Model ids look like claude-opus-5")
    .max(60)
    .or(z.literal(""))
    .optional(),
});

export async function PATCH(req: Request) {
  const parsed = await parseBody(req, settingsPatch);
  if (parsed.error) return parsed.error;
  const db = getDb();
  if (parsed.data.claude_model !== undefined) {
    setSetting(db, "claude_model", parsed.data.claude_model);
  }
  return NextResponse.json({ settings: getAllSettings(db) });
}
