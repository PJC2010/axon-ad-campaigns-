"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ApiError, apiFetch } from "@/lib/client";

interface SettingsPayload {
  settings: Record<string, string>;
  metaConfigured: boolean;
  claudeConfigured: boolean;
  claudeModel: string;
  claudeModelDefault: string;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [model, setModel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<SettingsPayload>("/api/settings")
      .then((d) => {
        setData(d);
        setModel(d.settings.claude_model ?? "");
      })
      .catch(() => setError("Could not load settings"));
  }, []);

  async function saveModel() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ claude_model: model.trim() }),
      });
      setMessage("Saved");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <TopBar title="Settings" subtitle="Workspace configuration" />
      {error ? <p className="mb-4 text-sm text-negative">{error}</p> : null}
      {data ? (
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader
              title="Connections"
              subtitle="Configured through environment variables in .env — see .env.example"
            />
            <div className="space-y-3 px-5 py-4 text-[13px]">
              <p className="flex items-center gap-2.5">
                <Badge tone={data.metaConfigured ? "positive" : "neutral"}>
                  {data.metaConfigured ? "Connected" : "Not configured"}
                </Badge>
                <span className="font-medium">Meta Marketing API</span>
                <span className="text-muted">
                  META_ACCESS_TOKEN + META_AD_ACCOUNT_ID — enables one-click sync on the Import
                  page
                </span>
              </p>
              <p className="flex items-center gap-2.5">
                <Badge tone={data.claudeConfigured ? "positive" : "neutral"}>
                  {data.claudeConfigured ? "Connected" : "Not configured"}
                </Badge>
                <span className="font-medium">Claude</span>
                <span className="text-muted">
                  ANTHROPIC_API_KEY — enables narrative recommendations
                </span>
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Claude model"
              subtitle={`Blank uses ${data.claudeModelDefault} (or the ANTHROPIC_MODEL environment variable)`}
            />
            <div className="flex items-end gap-3 px-5 py-4">
              <Field label="Model override" className="flex-1">
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={data.claudeModelDefault}
                />
              </Field>
              <Button variant="primary" onClick={() => void saveModel()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
            {message ? <p className="px-5 pb-4 text-[13px] text-positive">{message}</p> : null}
          </Card>

          <Card>
            <CardHeader title="Data" />
            <div className="px-5 py-4 text-[13px] leading-relaxed text-muted">
              <p>
                Everything lives on this machine: the database at{" "}
                <code className="numeric">data/app.db</code> and uploaded creatives under{" "}
                <code className="numeric">data/uploads/</code>. Both are excluded from version
                control. Currency is assumed USD throughout.
              </p>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
