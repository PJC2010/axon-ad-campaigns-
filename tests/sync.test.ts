import { beforeEach, describe, expect, it } from "vitest";
import { openDb } from "@/lib/db/open";
import type { DB } from "@/lib/repo/util";
import { createCampaign, findCampaignByMetaId, getCampaign } from "@/lib/repo/campaigns";
import { campaignCreate } from "@/lib/validation/schemas";
import { fetchAllPages, type GraphFetcher } from "@/lib/meta/graph";
import {
  CONVERSION_ACTION_PRIORITY,
  insightRowToDraft,
  pickAction,
  runSync,
  syncStatus,
  upsertRemoteCampaign,
  type RemoteInsightRow,
} from "@/lib/meta/sync";
import { selectEffectiveDaily } from "@/lib/metrics/effective";
import { getSetting } from "@/lib/repo/settings";

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});

const INSIGHT_ROW: RemoteInsightRow = {
  date_start: "2026-08-20",
  date_stop: "2026-08-20",
  campaign_id: "c100",
  adset_id: "s200",
  ad_id: "a300",
  impressions: "12450",
  reach: "9800",
  frequency: "1.27",
  clicks: "342",
  inline_link_clicks: "310",
  spend: "142.1",
  actions: [
    { action_type: "landing_page_view", value: "250" },
    { action_type: "lead", value: "3" },
    { action_type: "omni_purchase", value: "12" },
  ],
  action_values: [{ action_type: "omni_purchase", value: "1180.5" }],
};

describe("insight transform", () => {
  it("maps a Graph insights row to a metric draft", () => {
    const draft = insightRowToDraft(INSIGHT_ROW)!;
    expect(draft.date).toBe("2026-08-20");
    expect(draft.impressions).toBe(12450);
    expect(draft.clicks).toBe(310); // inline_link_clicks preferred over clicks
    expect(draft.spend_cents).toBe(14210);
    expect(draft.conversions).toBe(12); // omni_purchase beats lead
    expect(draft.conversion_value_cents).toBe(118050);
    expect(draft.frequency).toBeCloseTo(1.27);
  });

  it("falls back to all clicks and lead actions when purchases are absent", () => {
    const draft = insightRowToDraft({
      ...INSIGHT_ROW,
      inline_link_clicks: undefined,
      actions: [{ action_type: "lead", value: "7" }],
      action_values: undefined,
    })!;
    expect(draft.clicks).toBe(342);
    expect(draft.conversions).toBe(7);
    expect(draft.conversion_value_cents).toBe(0);
  });

  it("rejects rows without a valid date", () => {
    expect(insightRowToDraft({ ...INSIGHT_ROW, date_start: "not-a-date" })).toBeNull();
  });

  it("picks actions by the exported priority order", () => {
    expect(CONVERSION_ACTION_PRIORITY[0]).toBe("omni_purchase");
    expect(pickAction([{ action_type: "unknown", value: "9" }])).toBe(0);
    expect(pickAction(undefined)).toBe(0);
  });
});

describe("entity upserts", () => {
  it("adopts an existing local campaign by name and stamps its Meta id", () => {
    const local = createCampaign(
      db,
      campaignCreate.parse({ name: "Spring sale", objective: "OUTCOME_SALES" }),
    );
    const id = upsertRemoteCampaign(db, {
      id: "c100",
      name: "Spring sale",
      objective: "OUTCOME_SALES",
      status: "ACTIVE",
      daily_budget: "15000",
    });
    expect(id).toBe(local.id);
    const updated = getCampaign(db, local.id)!;
    expect(updated.meta_campaign_id).toBe("c100");
    expect(updated.status).toBe("ACTIVE");
    expect(updated.budget_cents).toBe(15000);
  });

  it("creates new campaigns and maps DELETED to ARCHIVED", () => {
    const id = upsertRemoteCampaign(db, {
      id: "c9",
      name: "Old push",
      objective: "OUTCOME_TRAFFIC",
      status: "DELETED",
    });
    expect(findCampaignByMetaId(db, "c9")?.id).toBe(id);
    expect(getCampaign(db, id)?.status).toBe("ARCHIVED");
  });
});

describe("pagination", () => {
  it("follows paging.next until exhausted", async () => {
    const fetcher: GraphFetcher = async () => ({
      data: [{ id: "1" }, { id: "2" }],
      paging: { next: "https://graph.example/page2" },
    });
    const fetchNext = async () => ({ data: [{ id: "3" }] });
    const rows = await fetchAllPages<{ id: string }>("act_1/campaigns", {}, fetcher, fetchNext);
    expect(rows.map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});

describe("runSync with a stubbed Graph API", () => {
  const fixtures: Record<string, unknown> = {
    campaigns: {
      data: [
        {
          id: "c100",
          name: "Spring sale",
          objective: "OUTCOME_SALES",
          status: "ACTIVE",
          daily_budget: "15000",
        },
      ],
    },
    adsets: {
      data: [
        { id: "s200", name: "Prospecting", campaign_id: "c100", status: "ACTIVE", daily_budget: "5000" },
      ],
    },
    ads: {
      data: [{ id: "a300", name: "Hook A", adset_id: "s200", status: "ACTIVE" }],
    },
    insights: {
      data: [
        INSIGHT_ROW,
        { ...INSIGHT_ROW, date_start: "2026-08-21", impressions: "9000", spend: "100" },
      ],
    },
  };
  const fetcher: GraphFetcher = async (path) => {
    const key = path.split("/").pop()!;
    return fixtures[key] ?? { data: [] };
  };

  it("creates entities, upserts ad-level metrics, and records the run", async () => {
    const result = await runSync(db, { since: "2026-08-19", until: "2026-08-21" }, fetcher);
    expect(result.campaigns).toBe(1);
    expect(result.rowsUpserted).toBe(2);

    const campaign = findCampaignByMetaId(db, "c100")!;
    const rows = selectEffectiveDaily(db, { from: "2026-08-19", to: "2026-08-21" });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.level === "ad" && r.source === "api")).toBe(true);
    expect(rows[0].campaign_id).toBe(campaign.id);

    expect(getSetting(db, "last_sync_until")).toBe("2026-08-21");
    const status = syncStatus(db);
    expect(status.lastRun?.status).toBe("ok");
    expect(status.lastRun?.rows_upserted).toBe(2);
  });

  it("supersedes coarse CSV rows for the same days via precedence", async () => {
    // Coarse campaign-level row lands first (e.g. from an early CSV).
    const local = createCampaign(
      db,
      campaignCreate.parse({ name: "Spring sale", objective: "OUTCOME_SALES" }),
    );
    db.prepare(
      `INSERT INTO metric_daily (date, level, campaign_id, impressions, clicks, spend_cents, conversions, conversion_value_cents, source)
       VALUES ('2026-08-20', 'campaign', ?, 99999, 1, 999999, 0, 0, 'csv')`,
    ).run(local.id);

    await runSync(db, { since: "2026-08-19", until: "2026-08-21" }, fetcher);
    const day = selectEffectiveDaily(db, { from: "2026-08-20", to: "2026-08-20" });
    expect(day).toHaveLength(1);
    expect(day[0].level).toBe("ad");
    expect(day[0].impressions).toBe(12450);
  });

  it("records failed runs with the error message", async () => {
    const failing: GraphFetcher = async () => {
      throw new Error("token expired");
    };
    await expect(runSync(db, { since: "2026-08-19", until: "2026-08-21" }, failing)).rejects.toThrow(
      "token expired",
    );
    expect(syncStatus(db).lastRun?.status).toBe("error");
    expect(syncStatus(db).lastRun?.error).toContain("token expired");
  });
});
