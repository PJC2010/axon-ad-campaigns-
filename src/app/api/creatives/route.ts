import { NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { UPLOADS_DIR } from "@/lib/env";
import { jsonError, sqliteErrorResponse } from "@/lib/api";
import { imageSize } from "@/lib/imageSize";
import { createCreative, listCreatives } from "@/lib/repo/creatives";
import type { Creative } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

const ALLOWED_MIMES: Record<string, "image" | "video"> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/svg+xml": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const creatives = listCreatives(getDb(), {
    kind: kind === "image" || kind === "video" ? kind : undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  return NextResponse.json({ creatives });
}

function storedName(original: string): string {
  const ext = path.extname(original).toLowerCase().slice(0, 10);
  const base = path
    .basename(original, path.extname(original))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${crypto.randomBytes(6).toString("hex")}-${base || "creative"}${ext}`;
}

export async function POST(req: Request) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return jsonError(413, "too_large", "Uploads are limited to 200 MB per request");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "bad_form", "Expected multipart form data");
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return jsonError(400, "no_files", "Attach at least one file under the 'file' field");
  }

  let tags: string[] = [];
  const rawTags = form.get("tags");
  if (typeof rawTags === "string" && rawTags.trim()) {
    try {
      const parsed: unknown = JSON.parse(rawTags);
      if (Array.isArray(parsed)) tags = parsed.map(String).slice(0, 20);
    } catch {
      tags = rawTags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
    }
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const db = getDb();
  const created: Creative[] = [];
  const rejected: { name: string; reason: string }[] = [];

  for (const file of files) {
    const kind = ALLOWED_MIMES[file.type];
    if (!kind) {
      rejected.push({ name: file.name, reason: `Unsupported type ${file.type || "unknown"}` });
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength === 0) {
      rejected.push({ name: file.name, reason: "Empty file" });
      continue;
    }
    const filename = storedName(file.name);
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    const dims = kind === "image" ? imageSize(buffer, file.type) : null;
    try {
      created.push(
        createCreative(db, {
          kind,
          filename,
          original_name: file.name,
          mime: file.type,
          size_bytes: buffer.byteLength,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          duration_seconds: null,
          tags,
        }),
      );
    } catch (e) {
      fs.rmSync(filePath, { force: true });
      return sqliteErrorResponse(e);
    }
  }

  if (created.length === 0) {
    return jsonError(400, "all_rejected", "No files could be accepted", { rejected });
  }
  return NextResponse.json({ creatives: created, rejected }, { status: 201 });
}
