"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Images, Trash2, UploadCloud, X } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { CreativeThumb } from "@/components/creatives/CreativeThumb";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ApiError, apiFetch } from "@/lib/client";
import { formatCompact } from "@/lib/format";
import type { Creative } from "@/lib/types";
import type { CreativeUsage } from "@/lib/repo/creatives";

function metaLine(c: Creative): string {
  const parts: string[] = [];
  if (c.width && c.height) parts.push(`${c.width}×${c.height}`);
  if (c.duration_seconds) parts.push(`${Math.round(c.duration_seconds)}s`);
  parts.push(`${formatCompact(c.size_bytes)}B`);
  return parts.join(" · ");
}

export default function CreativesPage() {
  const [creatives, setCreatives] = useState<Creative[] | null>(null);
  const [kind, setKind] = useState<string>("");
  const [q, setQ] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ creative: Creative; usage: CreativeUsage[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (q) params.set("q", q);
    apiFetch<{ creatives: Creative[] }>(`/api/creatives?${params}`)
      .then((r) => setCreatives(r.creatives))
      .catch(() => setNotice("Could not load creatives"));
  }, [kind, q]);

  useEffect(reload, [reload]);

  async function upload(files: FileList | File[]) {
    const list = [...files];
    if (list.length === 0) return;
    setUploading(true);
    setNotice(null);
    const form = new FormData();
    for (const f of list) form.append("file", f);
    try {
      const res = await apiFetch<{ creatives: Creative[]; rejected: { name: string; reason: string }[] }>(
        "/api/creatives",
        { method: "POST", body: form },
      );
      if (res.rejected.length > 0) {
        setNotice(
          `Skipped ${res.rejected.length} file${res.rejected.length > 1 ? "s" : ""}: ${res.rejected
            .map((r) => `${r.name} (${r.reason.toLowerCase()})`)
            .join(", ")}`,
        );
      }
      reload();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Upload failed — try again");
    } finally {
      setUploading(false);
    }
  }

  async function saveTags(creative: Creative, tags: string[]) {
    const res = await apiFetch<{ creative: Creative }>(`/api/creatives/${creative.id}`, {
      method: "PATCH",
      body: JSON.stringify({ tags }),
    });
    setDetail((d) => (d ? { ...d, creative: res.creative } : d));
    reload();
  }

  async function deleteCreative(creative: Creative) {
    if (
      !window.confirm(
        `Delete "${creative.original_name}"? Ads using it will lose the attachment.`,
      )
    )
      return;
    await apiFetch(`/api/creatives/${creative.id}`, { method: "DELETE" });
    setDetail(null);
    reload();
  }

  return (
    <>
      <TopBar
        title="Creatives"
        subtitle="Your image and video library"
        actions={
          <Button variant="primary" onClick={() => fileInput.current?.click()} disabled={uploading}>
            <Icon icon={UploadCloud} size={16} />
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        }
      />

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        className={clsx(
          "mb-5 flex items-center justify-center rounded-card border border-dashed px-6 py-8 text-center transition-colors",
          dragOver ? "border-ocean bg-ocean-wash" : "border-hairline-strong bg-surface/60",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void upload(e.dataTransfer.files);
        }}
      >
        <p className="text-[13px] text-muted">
          Drop images or videos here, or use the upload button — PNG, JPG, GIF, WebP, SVG, MP4,
          MOV, WebM.
        </p>
      </div>

      {notice ? <p className="mb-4 text-[13px] text-warn">{notice}</p> : null}

      <div className="mb-5 flex items-center gap-3">
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-36">
          <option value="">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </Select>
        <Input
          placeholder="Search by file name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {creatives && creatives.length === 0 ? (
        <EmptyState
          icon={Images}
          title={q || kind ? "Nothing matches those filters" : "No creatives yet"}
          hint={
            q || kind
              ? "Try clearing the search or type filter."
              : "Upload images and videos, then attach them to ads in the campaign builder."
          }
        />
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {(creatives ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() =>
              apiFetch<{ creative: Creative; usage: CreativeUsage[] }>(`/api/creatives/${c.id}`)
                .then(setDetail)
                .catch(() => setNotice("Could not open that creative"))
            }
            className="group overflow-hidden rounded-card border border-hairline bg-surface text-left shadow-soft transition-shadow hover:shadow-pop"
          >
            <div className="aspect-square overflow-hidden bg-ink/4">
              <CreativeThumb creative={c} />
            </div>
            <div className="px-3 py-2.5">
              <p className="truncate text-[13px] font-medium">{c.original_name}</p>
              <p className="numeric mt-0.5 text-xs text-faint">{metaLine(c)}</p>
              {c.tags.length > 0 ? (
                <p className="mt-1.5 flex flex-wrap gap-1">
                  {c.tags.slice(0, 3).map((t) => (
                    <span key={t} className="rounded-full bg-ink/6 px-2 py-0.5 text-[11px] text-muted">
                      {t}
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
          </button>
        ))}
      </div>

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.creative.original_name ?? ""}
        subtitle={detail ? metaLine(detail.creative) : undefined}
      >
        {detail ? (
          <CreativeDetail
            creative={detail.creative}
            usage={detail.usage}
            onSaveTags={(tags) => void saveTags(detail.creative, tags)}
            onDelete={() => void deleteCreative(detail.creative)}
          />
        ) : null}
      </Drawer>
    </>
  );
}

function CreativeDetail({
  creative,
  usage,
  onSaveTags,
  onDelete,
}: {
  creative: Creative;
  usage: CreativeUsage[];
  onSaveTags: (tags: string[]) => void;
  onDelete: () => void;
}) {
  const [tagDraft, setTagDraft] = useState("");

  function addTag() {
    const v = tagDraft.trim();
    setTagDraft("");
    if (!v || creative.tags.includes(v)) return;
    onSaveTags([...creative.tags, v]);
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-card border border-hairline bg-ink/4">
        {creative.kind === "image" ? (
          <CreativeThumb creative={creative} className="max-h-80 !object-contain" />
        ) : (
          <video
            src={`/api/creatives/${creative.id}/file`}
            controls
            className="max-h-80 w-full"
            preload="metadata"
          />
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Tags</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {creative.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-ink/6 px-2.5 py-1 text-xs font-medium"
            >
              {t}
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                className="text-muted hover:text-ink"
                onClick={() => onSaveTags(creative.tags.filter((v) => v !== t))}
              >
                <Icon icon={X} size={12} />
              </button>
            </span>
          ))}
          <input
            className="min-w-24 rounded-btn border border-hairline bg-raised px-2 py-1 text-xs outline-none placeholder:text-faint focus:border-ocean"
            placeholder="Add tag…"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Used in</p>
        {usage.length === 0 ? (
          <p className="text-[13px] text-muted">Not attached to any ad yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {usage.map((u) => (
              <li key={u.ad_id} className="text-[13px]">
                <Link href={`/campaigns/${u.campaign_id}`} className="text-ocean hover:underline">
                  {u.campaign_name}
                </Link>
                <span className="text-muted"> — {u.ad_name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-hairline pt-4">
        <Button variant="danger" size="sm" onClick={onDelete}>
          <Icon icon={Trash2} size={14} />
          Delete creative
        </Button>
      </div>
    </div>
  );
}
