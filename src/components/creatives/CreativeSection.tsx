"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { AdFormat } from "@/lib/meta/enums";
import type { AdCreativeLink, Creative } from "@/lib/types";
import { CreativePicker } from "./CreativePicker";
import { CreativeThumb } from "./CreativeThumb";

const MAX_BY_FORMAT: Record<AdFormat, number> = {
  single_image: 1,
  single_video: 1,
  carousel: 10,
};

/** The attachment block inside the ad form: current creatives + picker. */
export function CreativeSection({
  format,
  value,
  onChange,
}: {
  format: AdFormat;
  value: AdCreativeLink[];
  onChange: (links: AdCreativeLink[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const max = MAX_BY_FORMAT[format];
  const kindFilter =
    format === "single_image" ? "image" : format === "single_video" ? "video" : undefined;
  const overLimit = value.length > max;

  function handlePick(creatives: Creative[]) {
    onChange(
      creatives.map((c, i) => {
        const existing = value.find((v) => v.creative_id === c.id);
        return {
          ad_id: 0,
          creative_id: c.id,
          position: i,
          card_headline: existing?.card_headline ?? null,
          card_url: existing?.card_url ?? null,
          creative: c,
        };
      }),
    );
  }

  function move(index: number, delta: number) {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((l, i) => ({ ...l, position: i })));
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index).map((l, i) => ({ ...l, position: i })));
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      {value.length === 0 ? (
        <p className="mb-3 text-[13px] text-muted">
          No creative attached yet
          {format === "carousel" ? " — carousels take up to 10 cards, in order." : "."}
        </p>
      ) : (
        <div className="mb-3 flex flex-wrap gap-2">
          {value.map((link, i) => (
            <div
              key={`${link.creative_id}-${i}`}
              className="group relative h-24 w-24 overflow-hidden rounded-card border border-hairline"
            >
              {link.creative ? (
                <CreativeThumb creative={link.creative} />
              ) : (
                <div className="flex h-full items-center justify-center bg-ink/5 text-xs text-muted">
                  #{link.creative_id}
                </div>
              )}
              <div className="absolute inset-x-0 top-0 flex justify-between p-1 opacity-0 transition-opacity group-hover:opacity-100">
                {format === "carousel" ? (
                  <span className="flex gap-0.5">
                    <IconBtn label="Move earlier" onClick={() => move(i, -1)} icon={ArrowLeft} />
                    <IconBtn label="Move later" onClick={() => move(i, 1)} icon={ArrowRight} />
                  </span>
                ) : (
                  <span />
                )}
                <IconBtn label="Remove" onClick={() => remove(i)} icon={X} />
              </div>
              {format === "carousel" ? (
                <span className="numeric absolute bottom-1 left-1 rounded bg-ink/70 px-1 text-[10px] text-paper">
                  {i + 1}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {overLimit ? (
        <p className="mb-2 text-xs text-warn">
          This format takes {max === 1 ? "one creative" : `${max} creatives`} — extra attachments
          will be trimmed when you save.
        </p>
      ) : null}
      <Button size="sm" onClick={() => setPickerOpen(true)}>
        <Icon icon={ImagePlus} size={15} />
        {value.length > 0 ? "Change creatives" : "Choose from library"}
      </Button>
      <CreativePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
        max={max}
        kindFilter={kindFilter}
        initialSelected={value.map((v) => v.creative_id)}
      />
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: typeof X;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-5 w-5 items-center justify-center rounded bg-ink/70 text-paper hover:bg-ink"
    >
      <Icon icon={icon} size={12} />
    </button>
  );
}
