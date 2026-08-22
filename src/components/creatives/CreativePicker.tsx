"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/client";
import type { Creative } from "@/lib/types";
import { CreativeThumb } from "./CreativeThumb";

export function CreativePicker({
  open,
  onClose,
  onPick,
  max,
  kindFilter,
  initialSelected = [],
}: {
  open: boolean;
  onClose: () => void;
  onPick: (creatives: Creative[]) => void;
  /** Maximum number of creatives selectable (1 for single formats, 10 for carousel). */
  max: number;
  kindFilter?: "image" | "video";
  initialSelected?: number[];
}) {
  const [creatives, setCreatives] = useState<Creative[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(initialSelected.slice(0, max));
    setQ("");
    setError(null);
    apiFetch<{ creatives: Creative[] }>("/api/creatives")
      .then((r) => setCreatives(r.creatives))
      .catch(() => setError("Could not load the creative library"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when opening
  }, [open]);

  const visible = useMemo(() => {
    if (!creatives) return [];
    return creatives.filter(
      (c) =>
        (!kindFilter || c.kind === kindFilter) &&
        (!q || c.original_name.toLowerCase().includes(q.toLowerCase())),
    );
  }, [creatives, kindFilter, q]);

  function toggle(id: number) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (max === 1) return [id];
      if (prev.length >= max) return prev;
      return [...prev, id];
    });
  }

  function confirm() {
    if (!creatives) return;
    const byId = new Map(creatives.map((c) => [c.id, c]));
    onPick(selected.map((id) => byId.get(id)!).filter(Boolean));
    onClose();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Choose creatives"
      subtitle={max === 1 ? "Pick one from your library" : `Pick up to ${max}, in order`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} disabled={selected.length === 0}>
            Attach {selected.length > 0 ? `(${selected.length})` : ""}
          </Button>
        </>
      }
    >
      <Input placeholder="Search by file name…" value={q} onChange={(e) => setQ(e.target.value)} />
      {error ? <p className="mt-4 text-sm text-negative">{error}</p> : null}
      {creatives && creatives.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          The library is empty — upload images or videos on the Creatives page first.
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {visible.map((c) => {
          const idx = selected.indexOf(c.id);
          const picked = idx >= 0;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={clsx(
                "group relative aspect-square overflow-hidden rounded-card border transition-shadow",
                picked ? "border-ocean ring-2 ring-ocean/25" : "border-hairline hover:shadow-soft",
              )}
              title={c.original_name}
            >
              <CreativeThumb creative={c} />
              {picked ? (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ocean text-paper">
                  {max > 1 ? (
                    <span className="numeric text-[11px] font-semibold">{idx + 1}</span>
                  ) : (
                    <Icon icon={Check} size={12} />
                  )}
                </span>
              ) : null}
              <span className="absolute inset-x-0 bottom-0 truncate bg-ink/60 px-1.5 py-0.5 text-left text-[11px] text-paper">
                {c.original_name}
              </span>
            </button>
          );
        })}
      </div>
    </Drawer>
  );
}
