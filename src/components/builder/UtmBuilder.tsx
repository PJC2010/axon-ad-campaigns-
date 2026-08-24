"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/Input";

const KNOWN = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const LABELS: Record<(typeof KNOWN)[number], string> = {
  utm_source: "Source",
  utm_medium: "Medium",
  utm_campaign: "Campaign",
  utm_content: "Content",
  utm_term: "Term",
};

function parse(value: string): { known: Record<string, string>; rest: [string, string][] } {
  const params = new URLSearchParams(value);
  const known: Record<string, string> = {};
  const rest: [string, string][] = [];
  for (const [k, v] of params.entries()) {
    if ((KNOWN as readonly string[]).includes(k)) known[k] = v;
    else rest.push([k, v]);
  }
  return { known, rest };
}

/** Edits a raw query-string of URL parameters (Meta's "URL tags") via UTM fields. */
export function UtmBuilder({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { known, rest } = useMemo(() => parse(value), [value]);

  function setKnown(key: string, v: string) {
    const params = new URLSearchParams();
    for (const k of KNOWN) {
      const next = k === key ? v : (known[k] ?? "");
      if (next) params.set(k, next);
    }
    for (const [k, v2] of rest) params.set(k, v2);
    onChange(params.toString());
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {KNOWN.map((k) => (
          <label key={k} className="block">
            <span className="mb-1 block text-xs text-muted">{LABELS[k]}</span>
            <Input
              className="!py-1.5 text-[13px]"
              placeholder={k === "utm_source" ? "facebook" : k === "utm_medium" ? "paid_social" : ""}
              value={known[k] ?? ""}
              onChange={(e) => setKnown(k, e.target.value)}
            />
          </label>
        ))}
      </div>
      {value ? (
        <p className="numeric mt-2 break-all rounded-btn bg-ink/4 px-2.5 py-1.5 text-xs text-muted">
          ?{value}
        </p>
      ) : null}
    </div>
  );
}
