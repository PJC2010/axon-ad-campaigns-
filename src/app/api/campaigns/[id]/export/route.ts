import { getDb } from "@/lib/db";
import { idFromParam, jsonError } from "@/lib/api";
import { getCampaignTree } from "@/lib/repo/ads";
import { campaignToBulkCsv, exportSlug } from "@/lib/export/metaBulk";
import { buildExportZip } from "@/lib/export/zip";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/api/campaigns/[id]/export">) {
  const { id: rawId } = await ctx.params;
  const id = idFromParam(rawId);
  if (!id) return jsonError(400, "bad_id", "Invalid campaign id");
  const tree = getCampaignTree(getDb(), id);
  if (!tree) return jsonError(404, "not_found", "Campaign not found");

  const slug = exportSlug(tree.name);
  const url = new URL(req.url);

  if (url.searchParams.get("format") === "csv") {
    return new Response(campaignToBulkCsv(tree), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-meta-import.csv"`,
      },
    });
  }

  const zip = await buildExportZip(tree);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}-meta-import.zip"`,
      "Content-Length": String(zip.byteLength),
    },
  });
}
