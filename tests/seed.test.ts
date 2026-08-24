import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "@/lib/db/open";
import type { DB } from "@/lib/repo/util";
import { seed } from "@/lib/seed";
import { buildDashboard } from "@/lib/dashboard";
import { selectEffectiveDaily } from "@/lib/metrics/effective";
import { aggregate } from "@/lib/metrics/derive";
import { addDays, todayStr } from "@/lib/dates";

let db: DB;
let uploads: string;

beforeEach(() => {
  db = openDb(":memory:");
  uploads = fs.mkdtempSync(path.join(os.tmpdir(), "axon-seed-"));
});

afterEach(() => {
  fs.rmSync(uploads, { recursive: true, force: true });
});

describe("seed", () => {
  it("creates the documented structure with 60 days of metrics", () => {
    const result = seed(db, uploads);
    expect(result.campaigns).toBe(3);
    expect(result.adSets).toBe(4);
    expect(result.ads).toBe(6);
    expect(result.creatives).toBe(8);
    expect(result.metricRows).toBe(6 * 60 + 60);
    expect(fs.readdirSync(uploads)).toHaveLength(8);
  });

  it("gives the awareness campaign campaign-level rows only", () => {
    seed(db, uploads);
    const rows = db
      .prepare(
        `SELECT DISTINCT level FROM metric_daily
         WHERE campaign_id = (SELECT id FROM campaigns WHERE name = 'Brand awareness — reels')`,
      )
      .all() as { level: string }[];
    expect(rows.map((r) => r.level)).toEqual(["campaign"]);
  });

  it("bakes in the scenarios the heuristics need", () => {
    const result = seed(db, uploads);
    const recent14 = { from: addDays(result.to, -13), to: result.to };

    // The loser never converts.
    const loser = db
      .prepare(
        `SELECT SUM(conversions) AS conv, SUM(spend_cents) AS spend FROM metric_daily
         WHERE ad_id = (SELECT id FROM ads WHERE name = 'Hook B — product grid')`,
      )
      .get() as { conv: number; spend: number };
    expect(loser.conv).toBe(0);
    expect(loser.spend).toBeGreaterThan(3000); // well past any pause threshold

    // The carousel fatigues: recent frequency above 3.5.
    const fatigue = db
      .prepare(
        `SELECT AVG(frequency) AS freq FROM metric_daily
         WHERE ad_id = (SELECT id FROM ads WHERE name = 'Carousel — bestsellers')
           AND date BETWEEN ? AND ?`,
      )
      .get(recent14.from, recent14.to) as { freq: number };
    expect(fatigue.freq).toBeGreaterThan(3.5);

    // CPM creep on the checklist ad: recent 7 days ≥ 1.3× the 7 before.
    const cpmFor = (from: string, to: string) => {
      const r = db
        .prepare(
          `SELECT SUM(spend_cents) AS s, SUM(impressions) AS i FROM metric_daily
           WHERE ad_id = (SELECT id FROM ads WHERE name = 'Lead magnet — checklist')
             AND date BETWEEN ? AND ?`,
        )
        .get(from, to) as { s: number; i: number };
      return (r.s / r.i) * 1000;
    };
    const h2 = cpmFor(addDays(result.to, -6), result.to);
    const h1 = cpmFor(addDays(result.to, -13), addDays(result.to, -7));
    expect(h2).toBeGreaterThan(h1 * 1.3); // enough creep to trip the cpm_alert rule
  });

  it("dashboard totals equal the sum of the leaderboard", () => {
    const result = seed(db, uploads);
    const payload = buildDashboard(db, result.from, result.to);
    const leaderboardSpend = payload.leaderboard.reduce((s, r) => s + r.totals.spend_cents, 0);
    expect(leaderboardSpend).toBe(payload.kpis.totals.spend_cents);
    const effective = aggregate(selectEffectiveDaily(db, { from: result.from, to: result.to }));
    expect(effective.spend_cents).toBe(payload.kpis.totals.spend_cents);
    expect(payload.series).toHaveLength(60);
    expect(payload.creatives.length).toBeGreaterThan(0);
  });

  it("is deterministic run to run", () => {
    const r1 = seed(db, uploads);
    const total1 = aggregate(selectEffectiveDaily(db, { from: r1.from, to: r1.to }));

    const db2 = openDb(":memory:");
    const uploads2 = fs.mkdtempSync(path.join(os.tmpdir(), "axon-seed-2-"));
    try {
      const r2 = seed(db2, uploads2);
      const total2 = aggregate(selectEffectiveDaily(db2, { from: r2.from, to: r2.to }));
      expect(total2).toEqual(total1);
    } finally {
      fs.rmSync(uploads2, { recursive: true, force: true });
    }
  });

  it("ends yesterday so every seeded day is complete", () => {
    const result = seed(db, uploads);
    expect(result.to).toBe(addDays(todayStr(), -1));
  });
});
