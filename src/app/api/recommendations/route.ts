import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { parseBody } from "@/lib/api";
import { listRecommendations } from "@/lib/repo/recommendations";
import { buildAnalysisInput } from "@/lib/reco/data";
import { runHeuristics } from "@/lib/reco/heuristics";
import { generateClaudeRecommendations } from "@/lib/reco/claude";
import { persistDrafts } from "@/lib/reco/persist";
import type { RecoStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const valid = status === "new" || status === "dismissed" || status === "done";
  return NextResponse.json({
    recommendations: listRecommendations(getDb(), {
      status: valid ? (status as RecoStatus) : undefined,
    }),
  });
}

const generateInput = z.object({
  windowDays: z.number().int().min(7).max(60).default(14),
  useClaude: z.boolean().default(true),
});

export async function POST(req: Request) {
  const parsed = await parseBody(req, generateInput);
  if (parsed.error) return parsed.error;
  const db = getDb();

  const input = buildAnalysisInput(db, { windowDays: parsed.data.windowDays });
  const heuristicDrafts = runHeuristics(input);
  const heuristic = persistDrafts(db, "heuristic", heuristicDrafts);

  let claude: { status: string; reason?: string; created?: number; updated?: number } = {
    status: "skipped",
    reason: "disabled",
  };
  if (parsed.data.useClaude) {
    const result = await generateClaudeRecommendations(db, input, heuristicDrafts);
    if (result.status === "ok") {
      const persisted = persistDrafts(db, "claude", result.drafts);
      claude = { status: "ok", created: persisted.created, updated: persisted.updated };
    } else {
      claude = { status: result.status, reason: result.reason };
    }
  }

  return NextResponse.json({
    window: { from: input.from, to: input.to },
    heuristic,
    claude,
    recommendations: listRecommendations(db),
  });
}
