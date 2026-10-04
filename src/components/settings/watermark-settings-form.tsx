"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ImageOff, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { saveWatermarkSettings } from "@/app/(dashboard)/settings/watermark-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OPACITY_MAX,
  OPACITY_MIN,
  POSITION_LABELS,
  SIZE_LABELS,
  WATERMARK_POSITIONS,
  WATERMARK_SIZES,
  type WatermarkPosition,
  type WatermarkSettings,
  type WatermarkSize,
} from "@/lib/images/watermark-settings";
import { cn } from "@/lib/utils";

/**
 * Privacy & Security → Image watermark.
 *
 * The preview is a real render from the server, not a CSS mock-up, so the
 * picture on this screen is the picture that gets published. That costs a
 * request per adjustment, which is why the URL is debounced.
 */

type Props = {
  initial: WatermarkSettings;
  /** Drives the "you have no handle yet" and "no number on file" hints. */
  identity: {
    username: string | null;
    fullName: string | null;
    companyName: string | null;
    hasPhone: boolean;
    hasAvatar: boolean;
  };
};

function previewUrl(settings: WatermarkSettings): string {
  const params = new URLSearchParams({
    enabled: settings.enabled ? "1" : "0",
    username: settings.use_username ? "1" : "0",
    name: settings.use_display_name ? "1" : "0",
    company: settings.use_company ? "1" : "0",
    logo: settings.use_logo ? "1" : "0",
    phone: settings.use_phone ? "1" : "0",
    position: settings.position,
    size: settings.size,
    opacity: String(settings.opacity),
  });
  return `/api/settings/watermark/preview?${params.toString()}`;
}

function Toggle({
  id,
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex min-h-11 items-start gap-3", disabled && "opacity-60")}>
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-1"
      />
      <div className="space-y-0.5">
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

export function WatermarkSettingsForm({ initial, identity }: Props) {
  const [settings, setSettings] = useState<WatermarkSettings>(initial);
  const [saving, startSaving] = useTransition();

  // The preview is a network render, so it follows the controls rather than
  // leading them: moving the opacity slider should not fire twenty requests.
  const [debounced, setDebounced] = useState(() => previewUrl(initial));
  const target = useMemo(() => previewUrl(settings), [settings]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(target), 350);
    return () => clearTimeout(timer);
  }, [target]);

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(initial),
    [settings, initial],
  );

  const nothingSelected =
    !settings.use_username &&
    !settings.use_display_name &&
    !settings.use_company &&
    !settings.use_logo &&
    !settings.use_phone;

  function set<K extends keyof WatermarkSettings>(key: K, value: WatermarkSettings[K]) {
    setSettings((previous) => ({ ...previous, [key]: value }));
  }

  function save() {
    startSaving(async () => {
      const result = await saveWatermarkSettings(settings);
      if (result.ok) toast.success("Watermark settings saved");
      else toast.error(result.message);
    });
  }

  return (
    <section className="space-y-5 rounded-2xl border p-4 sm:p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-brand" />
          <h2 className="text-lg font-semibold tracking-tight">Image watermark</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Your mark is drawn into the picture itself before it is published, so it
          survives a download or a screenshot. Medosha keeps the unmarked original
          privately for you — nobody else can reach it.
        </p>
        <p className="text-xs text-muted-foreground">
          Applies to new uploads of project photos, marketplace photos and property
          listing photos. Profile pictures, cover images, logos, 360° panoramas and
          floor plans are never marked. Images you have already published are left
          as they are.
        </p>
      </header>

      <Toggle
        id="watermark-enabled"
        checked={settings.enabled}
        onChange={(value) => set("enabled", value)}
        label="Watermark my uploads"
        hint="Turn this off and your photos publish exactly as you took them."
      />

      <div
        className={cn(
          "space-y-5",
          !settings.enabled && "pointer-events-none opacity-50",
        )}
        aria-hidden={!settings.enabled}
      >
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">What it says</legend>

          <Toggle
            id="watermark-username"
            checked={settings.use_username}
            onChange={(value) => set("use_username", value)}
            label="Username"
            hint={
              identity.username
                ? `@${identity.username}`
                : "Pick a username on your profile first — there is nothing to draw yet."
            }
            disabled={!identity.username}
          />
          <Toggle
            id="watermark-logo"
            checked={settings.use_logo}
            onChange={(value) => set("use_logo", value)}
            label="Profile picture or logo"
            hint={
              identity.hasAvatar
                ? "Shown as a small round badge beside the text."
                : "Add a profile picture first — there is nothing to draw yet."
            }
            disabled={!identity.hasAvatar}
          />
          <Toggle
            id="watermark-name"
            checked={settings.use_display_name}
            onChange={(value) => set("use_display_name", value)}
            label="Your name"
            hint={identity.fullName ?? "Add your name on your profile first."}
            disabled={!identity.fullName}
          />
          <Toggle
            id="watermark-company"
            checked={settings.use_company}
            onChange={(value) => set("use_company", value)}
            label="Company name"
            hint={identity.companyName ?? "Add a company name on your profile first."}
            disabled={!identity.companyName}
          />

          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <Toggle
              id="watermark-phone"
              checked={settings.use_phone}
              onChange={(value) => set("use_phone", value)}
              label="Phone number"
              hint={
                identity.hasPhone
                  ? "Off by default. A number written into a photograph cannot be taken back out of the copies that spread — turn this on only if you want buyers to call you from a reposted image."
                  : "Add a phone number to your account first."
              }
              disabled={!identity.hasPhone}
            />
          </div>

          {nothingSelected ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Nothing is selected, so your photos will publish unmarked.
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="watermark-position">Position</Label>
            <Select
              value={settings.position}
              onValueChange={(value) => set("position", value as WatermarkPosition)}
            >
              <SelectTrigger id="watermark-position" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WATERMARK_POSITIONS.map((position) => (
                  <SelectItem key={position} value={position}>
                    {POSITION_LABELS[position]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {settings.position === "tiled" ? (
              <p className="text-xs text-muted-foreground">
                Hardest to crop out, and the most visible. The logo is left off a
                tiled mark.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="watermark-size">Size</Label>
            <Select
              value={settings.size}
              onValueChange={(value) => set("size", value as WatermarkSize)}
            >
              <SelectTrigger id="watermark-size" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WATERMARK_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>
                    {SIZE_LABELS[size]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="watermark-opacity">Strength</Label>
            <span className="text-sm tabular-nums text-muted-foreground">
              {settings.opacity}%
            </span>
          </div>
          <input
            id="watermark-opacity"
            type="range"
            min={OPACITY_MIN}
            max={OPACITY_MAX}
            step={5}
            value={settings.opacity}
            onChange={(event) => set("opacity", Number(event.target.value))}
            className="h-11 w-full accent-brand"
          />
          <p className="text-xs text-muted-foreground">
            A faint mark is easy to paint out; a heavy one spoils the photograph.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Preview</p>
          <div className="overflow-hidden rounded-xl border bg-muted">
            {/* Rendered by the same code that publishes, on a sample photo.
                Not next/image: this is a per-request, private, uncacheable
                render, which is the opposite of what the image optimiser is
                for. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={debounced}
              src={debounced}
              alt="A sample photograph with your watermark drawn on it"
              width={960}
              height={640}
              className="block h-auto w-full"
            />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ImageOff className="size-3.5" />
            Sample image. Your own photos are never uploaded to make this preview.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save watermark settings
        </Button>
        {dirty ? (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        ) : null}
      </div>
    </section>
  );
}
