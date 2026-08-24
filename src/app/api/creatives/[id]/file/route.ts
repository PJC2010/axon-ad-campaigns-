import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getDb } from "@/lib/db";
import { UPLOADS_DIR } from "@/lib/env";
import { idFromParam, jsonError } from "@/lib/api";
import { getCreative } from "@/lib/repo/creatives";
import type { Creative } from "@/lib/types";

export const dynamic = "force-dynamic";

function resolveFile(rawId: string): { creative: Creative; filePath: string; size: number; etag: string } | null {
  const id = idFromParam(rawId);
  if (!id) return null;
  const creative = getCreative(getDb(), id);
  if (!creative) return null;
  const filePath = path.join(UPLOADS_DIR, creative.filename);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }
  return {
    creative,
    filePath,
    size: stat.size,
    etag: `W/"${stat.size}-${Math.round(stat.mtimeMs)}"`,
  };
}

function baseHeaders(f: NonNullable<ReturnType<typeof resolveFile>>): Record<string, string> {
  return {
    "Content-Type": f.creative.mime,
    "Accept-Ranges": "bytes",
    ETag: f.etag,
    "Cache-Control": "private, max-age=3600",
  };
}

/** Parse a Range header against a file size; null = no/invalid range. */
function parseRange(header: string | null, size: number): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    // suffix: last N bytes
    const n = Number(m[2]);
    if (n === 0) return "unsatisfiable";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

export async function GET(req: Request, ctx: RouteContext<"/api/creatives/[id]/file">) {
  const { id: rawId } = await ctx.params;
  const f = resolveFile(rawId);
  if (!f) return jsonError(404, "not_found", "Creative file not found");

  if (req.headers.get("if-none-match") === f.etag) {
    return new Response(null, { status: 304, headers: { ETag: f.etag } });
  }

  const range = parseRange(req.headers.get("range"), f.size);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${f.size}` },
    });
  }

  if (range) {
    const stream = Readable.toWeb(
      fs.createReadStream(f.filePath, { start: range.start, end: range.end }),
    ) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...baseHeaders(f),
        "Content-Range": `bytes ${range.start}-${range.end}/${f.size}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  }

  const stream = Readable.toWeb(fs.createReadStream(f.filePath)) as ReadableStream;
  return new Response(stream, {
    status: 200,
    headers: { ...baseHeaders(f), "Content-Length": String(f.size) },
  });
}

export async function HEAD(_req: Request, ctx: RouteContext<"/api/creatives/[id]/file">) {
  const { id: rawId } = await ctx.params;
  const f = resolveFile(rawId);
  if (!f) return new Response(null, { status: 404 });
  return new Response(null, {
    status: 200,
    headers: { ...baseHeaders(f), "Content-Length": String(f.size) },
  });
}
