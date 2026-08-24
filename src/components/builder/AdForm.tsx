"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { TextArea } from "@/components/ui/TextArea";
import { CharCounter } from "@/components/data/CharCounter";
import { CreativeSection } from "@/components/creatives/CreativeSection";
import { UtmBuilder } from "./UtmBuilder";
import { ApiError, apiFetch, type FieldErrors } from "@/lib/client";
import { AD_FORMATS, CTAS, STATUSES, TEXT_LIMITS } from "@/lib/meta/enums";
import type { Ad, AdCreativeLink, AdWithCreatives } from "@/lib/types";

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-3 mt-7 border-b border-hairline pb-1.5 text-xs font-semibold uppercase tracking-wide text-faint first:mt-0">
      {children}
    </p>
  );
}

export function AdForm({
  open,
  ...props
}: {
  open: boolean;
  adsetId: number;
  initial?: AdWithCreatives | null;
  onClose: () => void;
  onSaved: (ad: Ad) => void;
}) {
  // Mount fresh per open (keyed by the ad being edited) so field state
  // initializes straight from props — no sync-in-effect needed.
  if (!open) return null;
  return <AdFormFields key={props.initial?.id ?? "new"} {...props} />;
}

function AdFormFields({
  adsetId,
  initial,
  onClose,
  onSaved,
}: {
  adsetId: number;
  initial?: AdWithCreatives | null;
  onClose: () => void;
  onSaved: (ad: Ad) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [status, setStatus] = useState<Ad["status"]>(initial?.status ?? "DRAFT");
  const [identityPage, setIdentityPage] = useState(initial?.identity_page ?? "");
  const [identityInstagram, setIdentityInstagram] = useState(initial?.identity_instagram ?? "");
  const [format, setFormat] = useState<Ad["format"]>(initial?.format ?? "single_image");
  const [primaryText, setPrimaryText] = useState(initial?.primary_text ?? "");
  const [headline, setHeadline] = useState(initial?.headline ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [destinationUrl, setDestinationUrl] = useState(initial?.destination_url ?? "");
  const [displayLink, setDisplayLink] = useState(initial?.display_link ?? "");
  const [cta, setCta] = useState<Ad["cta"]>(initial?.cta ?? "LEARN_MORE");
  const [utmParams, setUtmParams] = useState(initial?.utm_params ?? "");
  const [creatives, setCreatives] = useState<AdCreativeLink[]>(initial?.creatives ?? []);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setErrors({});
    setFormError(null);
    const payload = {
      name,
      status,
      identity_page: identityPage.trim() || null,
      identity_instagram: identityInstagram.trim() || null,
      format,
      primary_text: primaryText,
      headline,
      description,
      destination_url: destinationUrl.trim(),
      display_link: displayLink.trim() || null,
      cta,
      utm_params: utmParams,
    };
    try {
      const res = initial
        ? await apiFetch<{ ad: Ad }>(`/api/ads/${initial.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ ad: Ad }>("/api/ads", {
            method: "POST",
            body: JSON.stringify({ ...payload, adset_id: adsetId }),
          });
      // Persist creative attachments (existing ads only get them synced on change;
      // new ads attach whatever was picked in the drawer).
      if (creatives.length > 0 || initial) {
        await apiFetch(`/api/ads/${res.ad.id}/creatives`, {
          method: "PUT",
          body: JSON.stringify({
            items: creatives.map((c, i) => ({
              creative_id: c.creative_id,
              position: i,
              card_headline: c.card_headline,
              card_url: c.card_url,
            })),
          }),
        });
      }
      onSaved(res.ad);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fieldErrors ?? {});
        if (e.code === "duplicate_name") setErrors({ name: e.message });
        else if (!e.fieldErrors) setFormError(e.message);
      } else {
        setFormError("Something went wrong — try again");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={initial ? "Edit ad" : "New ad"}
      subtitle="Identity, creative, and copy"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : initial ? "Save changes" : "Create ad"}
          </Button>
        </>
      }
    >
      <SectionLabel>Basics</SectionLabel>
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <Field label="Ad name" error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lifestyle video — hook A" />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as Ad["status"])}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Field label="Facebook page" hint="The page the ad runs from">
          <Input
            value={identityPage}
            onChange={(e) => setIdentityPage(e.target.value)}
            placeholder="Your page name"
          />
        </Field>
        <Field label="Instagram account" hint="Optional">
          <Input
            value={identityInstagram}
            onChange={(e) => setIdentityInstagram(e.target.value)}
            placeholder="@yourbrand"
          />
        </Field>
      </div>

      <SectionLabel>Creative</SectionLabel>
      <div className="mb-3">
        <Segmented
          options={AD_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
          value={format}
          onChange={setFormat}
        />
      </div>
      <CreativeSection format={format} value={creatives} onChange={setCreatives} />

      <SectionLabel>Copy</SectionLabel>
      <Field label="Primary text" error={errors.primary_text}>
        <TextArea
          value={primaryText}
          onChange={(e) => setPrimaryText(e.target.value)}
          placeholder="The message people see above the creative"
          rows={3}
        />
        <span className="mt-1 flex justify-end">
          <CharCounter value={primaryText} limit={TEXT_LIMITS.primary_text} />
        </span>
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <Field label="Headline" error={errors.headline}>
          <Input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Short, punchy line"
          />
          <span className="mt-1 flex justify-end">
            <CharCounter value={headline} limit={TEXT_LIMITS.headline} />
          </span>
        </Field>
        <Field label="Description" error={errors.description}>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Extra context (some placements)"
          />
          <span className="mt-1 flex justify-end">
            <CharCounter value={description} limit={TEXT_LIMITS.description} />
          </span>
        </Field>
      </div>

      <SectionLabel>Destination</SectionLabel>
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <Field label="Destination URL" error={errors.destination_url}>
          <Input
            value={destinationUrl}
            onChange={(e) => setDestinationUrl(e.target.value)}
            placeholder="https://example.com/offer"
          />
        </Field>
        <Field label="Display link" hint="Optional, shown instead of the full URL">
          <Input
            value={displayLink}
            onChange={(e) => setDisplayLink(e.target.value)}
            placeholder="example.com"
          />
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_2fr] gap-4">
        <Field label="Call to action">
          <Select value={cta} onChange={(e) => setCta(e.target.value as Ad["cta"])}>
            {CTAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium">URL parameters</span>
          <UtmBuilder value={utmParams} onChange={setUtmParams} />
        </div>
      </div>

      {formError ? <p className="mt-4 text-sm text-negative">{formError}</p> : null}
    </Drawer>
  );
}
