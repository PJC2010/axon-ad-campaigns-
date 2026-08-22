import type { Ad, AdCreativeLink, AdWithCreatives, CampaignTree, Creative } from "@/lib/types";
import type { AdCreativesPutInput, AdCreateInput, AdPatchInput } from "@/lib/validation/schemas";
import { getCampaign } from "./campaigns";
import { listAdSets } from "./adsets";
import { runUpdate, type DB } from "./util";

export function getAd(db: DB, id: number): Ad | null {
  return (db.prepare("SELECT * FROM ads WHERE id = ?").get(id) as Ad | undefined) ?? null;
}

export function listAds(db: DB, adsetId: number): Ad[] {
  return db.prepare("SELECT * FROM ads WHERE adset_id = ? ORDER BY id").all(adsetId) as Ad[];
}

export function findAdByName(db: DB, adsetId: number, name: string): Ad | null {
  return (
    (db
      .prepare("SELECT * FROM ads WHERE adset_id = ? AND name = ?")
      .get(adsetId, name.trim()) as Ad | undefined) ?? null
  );
}

export function findAdByMetaId(db: DB, metaId: string): Ad | null {
  return (
    (db.prepare("SELECT * FROM ads WHERE meta_ad_id = ?").get(metaId) as Ad | undefined) ?? null
  );
}

export function createAd(db: DB, input: AdCreateInput & { meta_ad_id?: string | null }): Ad {
  const info = db
    .prepare(
      `INSERT INTO ads
        (adset_id, name, status, identity_page, identity_instagram, format, primary_text,
         headline, description, destination_url, display_link, cta, utm_params, meta_ad_id)
       VALUES (@adset_id, @name, @status, @identity_page, @identity_instagram, @format, @primary_text,
         @headline, @description, @destination_url, @display_link, @cta, @utm_params, @meta_ad_id)`,
    )
    .run({
      adset_id: input.adset_id,
      name: input.name,
      status: input.status,
      identity_page: input.identity_page,
      identity_instagram: input.identity_instagram,
      format: input.format,
      primary_text: input.primary_text,
      headline: input.headline,
      description: input.description,
      destination_url: input.destination_url,
      display_link: input.display_link,
      cta: input.cta,
      utm_params: input.utm_params,
      meta_ad_id: input.meta_ad_id ?? null,
    });
  return getAd(db, Number(info.lastInsertRowid))!;
}

export function updateAd(
  db: DB,
  id: number,
  patch: AdPatchInput & { meta_ad_id?: string | null },
): Ad | null {
  runUpdate(db, "ads", id, {
    name: patch.name,
    status: patch.status,
    identity_page: patch.identity_page,
    identity_instagram: patch.identity_instagram,
    format: patch.format,
    primary_text: patch.primary_text,
    headline: patch.headline,
    description: patch.description,
    destination_url: patch.destination_url,
    display_link: patch.display_link,
    cta: patch.cta,
    utm_params: patch.utm_params,
    meta_ad_id: patch.meta_ad_id,
  });
  return getAd(db, id);
}

export function deleteAd(db: DB, id: number): boolean {
  return db.prepare("DELETE FROM ads WHERE id = ?").run(id).changes > 0;
}

type LinkRow = AdCreativeLink & {
  c_kind: Creative["kind"];
  c_filename: string;
  c_original_name: string;
  c_mime: string;
  c_size_bytes: number;
  c_width: number | null;
  c_height: number | null;
  c_duration_seconds: number | null;
  c_tags: string;
  c_created_at: string;
};

export function getAdCreativeLinks(db: DB, adIds: number[]): Map<number, AdCreativeLink[]> {
  const map = new Map<number, AdCreativeLink[]>();
  if (adIds.length === 0) return map;
  const placeholders = adIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT ac.ad_id, ac.creative_id, ac.position, ac.card_headline, ac.card_url,
              c.kind AS c_kind, c.filename AS c_filename, c.original_name AS c_original_name,
              c.mime AS c_mime, c.size_bytes AS c_size_bytes, c.width AS c_width,
              c.height AS c_height, c.duration_seconds AS c_duration_seconds,
              c.tags AS c_tags, c.created_at AS c_created_at
       FROM ad_creatives ac
       JOIN creatives c ON c.id = ac.creative_id
       WHERE ac.ad_id IN (${placeholders})
       ORDER BY ac.ad_id, ac.position`,
    )
    .all(...adIds) as LinkRow[];
  for (const r of rows) {
    const link: AdCreativeLink = {
      ad_id: r.ad_id,
      creative_id: r.creative_id,
      position: r.position,
      card_headline: r.card_headline,
      card_url: r.card_url,
      creative: {
        id: r.creative_id,
        kind: r.c_kind,
        filename: r.c_filename,
        original_name: r.c_original_name,
        mime: r.c_mime,
        size_bytes: r.c_size_bytes,
        width: r.c_width,
        height: r.c_height,
        duration_seconds: r.c_duration_seconds,
        tags: JSON.parse(r.c_tags),
        created_at: r.c_created_at,
      },
    };
    const list = map.get(r.ad_id) ?? [];
    list.push(link);
    map.set(r.ad_id, list);
  }
  return map;
}

export function replaceAdCreatives(db: DB, adId: number, input: AdCreativesPutInput): void {
  const run = db.transaction(() => {
    db.prepare("DELETE FROM ad_creatives WHERE ad_id = ?").run(adId);
    const insert = db.prepare(
      `INSERT INTO ad_creatives (ad_id, creative_id, position, card_headline, card_url)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const item of input.items) {
      insert.run(adId, item.creative_id, item.position, item.card_headline, item.card_url || null);
    }
  });
  run();
}

export function getCampaignTree(db: DB, campaignId: number): CampaignTree | null {
  const campaign = getCampaign(db, campaignId);
  if (!campaign) return null;
  const adSets = listAdSets(db, campaignId);
  const allAds =
    adSets.length === 0
      ? []
      : (db
          .prepare(
            `SELECT * FROM ads WHERE adset_id IN (${adSets.map(() => "?").join(",")}) ORDER BY id`,
          )
          .all(...adSets.map((s) => s.id)) as Ad[]);
  const links = getAdCreativeLinks(db, allAds.map((a) => a.id));
  const withCreatives = (ad: Ad): AdWithCreatives => ({
    ...ad,
    creatives: links.get(ad.id) ?? [],
  });
  return {
    ...campaign,
    ad_sets: adSets.map((s) => ({
      ...s,
      ads: allAds.filter((a) => a.adset_id === s.id).map(withCreatives),
    })),
  };
}
