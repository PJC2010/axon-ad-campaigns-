"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";

type Health = {
  ok: boolean;
  db?: boolean;
  storage?: boolean;
  metaConfigured: boolean;
  claudeConfigured: boolean;
};

function Dot({ on, label, hint }: { on: boolean; label: string; hint: string }) {
  return (
    <span className="flex items-center gap-1.5" title={hint}>
      <span
        className={clsx(
          "inline-block h-1.5 w-1.5 rounded-full",
          on ? "bg-positive" : "bg-ink/20",
        )}
      />
      <span className={on ? "text-muted" : "text-faint"}>{label}</span>
    </span>
  );
}

export function ConfigBadge() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  if (!health) return null;
  return (
    <div className="flex items-center gap-3 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs">
      <Dot
        on={health.metaConfigured}
        label="Meta sync"
        hint={
          health.metaConfigured
            ? "Meta API sync is configured"
            : "Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID to enable API sync"
        }
      />
      <Dot
        on={health.claudeConfigured}
        label="Claude"
        hint={
          health.claudeConfigured
            ? "Claude recommendations are configured"
            : "Set ANTHROPIC_API_KEY to enable Claude recommendations"
        }
      />
    </div>
  );
}
