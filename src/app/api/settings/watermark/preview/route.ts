import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { applyWatermark } from "@/lib/images/watermark";
import {
  DEFAULT_WATERMARK,
  normaliseSettings,
  type WatermarkSettings,
} from "@/lib/images/watermark-settings";
import { createClient } from "@/lib/supabase/server";

/**
 * The preview on the settings screen.
 *
 * It would be quicker to draw an approximation of the mark in the browser with
 * absolutely-positioned text, and it would be wrong: the preview would agree
 * with itself and disagree with the file people actually publish. This runs the
 * same `applyWatermark` on a sample photograph, with the signed-in person's own
 * name and handle, so what they see is what gets burned in.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 960;
const HEIGHT = 640;

/**
 * A stand-in photograph.
 *
 * Deliberately a light sky over a dark foreground: a white mark vanishes on
 * one half and a dark one vanishes on the other, so anybody moving the
 * position around can see immediately whether their choice survives both.
 */
function sample(): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">` +
      `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="#dfe9f3"/><stop offset="100%" stop-color="#b7c7d6"/>` +
      `</linearGradient></defs>` +
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>` +
      `<rect x="0" y="330" width="${WIDTH}" height="${HEIGHT - 330}" fill="#3f4a55"/>` +
      `<rect x="90" y="140" width="230" height="330" fill="#8d9aa6"/>` +
      `<rect x="360" y="200" width="180" height="270" fill="#6f7d8a"/>` +
      `<rect x="600" y="110" width="260" height="360" fill="#a4b0bb"/>` +
      `<rect x="0" y="470" width="${WIDTH}" height="${HEIGHT - 470}" fill="#2b333b"/>` +
      `</svg>`,
  );
}

function flag(params: URLSearchParams, key: string, fallback: boolean): boolean {
  const raw = params.get(key);
  if (raw === null) return fallback;
  return raw === "1" || raw === "true";
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The preview draws the viewer's own name and, if they have asked for it,
  // their own phone number. It is not something an anonymous caller may render.
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const settings: WatermarkSettings = normaliseSettings({
    enabled: flag(params, "enabled", DEFAULT_WATERMARK.enabled),
    use_username: flag(params, "username", DEFAULT_WATERMARK.use_username),
    use_display_name: flag(params, "name", DEFAULT_WATERMARK.use_display_name),
    use_company: flag(params, "company", DEFAULT_WATERMARK.use_company),
    use_logo: flag(params, "logo", DEFAULT_WATERMARK.use_logo),
    use_phone: flag(params, "phone", false),
    position: params.get("position") as WatermarkSettings["position"],
    size: params.get("size") as WatermarkSettings["size"],
    opacity: Number(params.get("opacity")),
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, full_name, company_name, phone, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  let logo: Buffer | null = null;
  if (settings.use_logo && profile?.avatar_url) {
    try {
      const response = await fetch(profile.avatar_url, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) logo = Buffer.from(await response.arrayBuffer());
    } catch {
      logo = null;
    }
  }

  const base = await sharp(sample()).jpeg({ quality: 90 }).toBuffer();

  const result = await applyWatermark({
    bytes: base,
    mime: "image/jpeg",
    identity: {
      username: profile?.username ?? null,
      full_name: profile?.full_name ?? null,
      company_name: profile?.company_name ?? null,
      // Same rule as the publishing path: the number is read only under the
      // explicit opt-in, so a preview cannot show one that would not be drawn.
      phone: settings.use_phone ? (profile?.phone ?? null) : null,
    },
    settings,
    logo,
  });

  const body = result?.buffer ?? base;

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": result?.mime ?? "image/jpeg",
      // Personal, and changes with every adjustment of the slider.
      "Cache-Control": "private, no-store",
      "X-Watermarked": result?.watermarked ? "1" : "0",
    },
  });
}
