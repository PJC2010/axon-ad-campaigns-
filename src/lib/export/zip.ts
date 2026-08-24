import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import type { CampaignTree } from "@/lib/types";
import { UPLOADS_DIR } from "@/lib/env";
import { campaignToBulkCsv, exportSlug } from "./metaBulk";

/**
 * Bundle the bulk-import CSV with every creative file the campaign's ads
 * reference, under creatives/{original name} (deduped; renamed on collision
 * so two different files never overwrite each other).
 */
export async function buildExportZip(
  tree: CampaignTree,
  uploadsDir: string = UPLOADS_DIR,
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(`${exportSlug(tree.name)}.csv`, campaignToBulkCsv(tree));

  const used = new Map<string, string>(); // original_name -> stored filename already added
  let collision = 0;
  for (const adSet of tree.ad_sets) {
    for (const ad of adSet.ads) {
      for (const link of ad.creatives) {
        const c = link.creative;
        if (!c) continue;
        const already = used.get(c.original_name);
        if (already === c.filename) continue; // same file, already bundled
        let entryName = c.original_name;
        if (already && already !== c.filename) {
          collision += 1;
          const ext = path.extname(c.original_name);
          entryName = `${path.basename(c.original_name, ext)}-${collision}${ext}`;
        }
        used.set(entryName === c.original_name ? c.original_name : entryName, c.filename);
        const filePath = path.join(uploadsDir, c.filename);
        if (fs.existsSync(filePath)) {
          zip.file(`creatives/${entryName}`, fs.readFileSync(filePath));
        }
      }
    }
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
