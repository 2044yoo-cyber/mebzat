import { NextResponse } from "next/server";

import {
  IMAGE_PROVIDERS,
  type ImageProviderName,
} from "@/lib/ai/image-models";
import {
  catalogueModels,
  healthSnapshot,
  validateAll,
  validateProvider,
} from "@/lib/ai/provider-health";
import { isUsable, type ProviderHealth } from "@/lib/ai/provider-status";
import { createClient } from "@/lib/supabase/server";

/**
 * The provider manager's data.
 *
 * GET returns the health of every provider — names, statuses and reasons,
 * never a key, never a partial key, never a length. The studio calls it so the
 * model picker can grey out what does not work and the setup panel can name
 * exactly what to fix, instead of every model looking available until one
 * fails.
 *
 * POST re-tests: one provider by name, or all of them at once for the "Test
 * Providers" button. Testing forces a fresh probe rather than reading the
 * cache, because the reason someone presses it is that they just changed a
 * key.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Health plus the catalogue's view, shaped for the client. */
function present(health: ProviderHealth) {
  return {
    ...health,
    label: IMAGE_PROVIDERS[health.provider].label,
    signupUrl: IMAGE_PROVIDERS[health.provider].signupUrl,
    blurb: IMAGE_PROVIDERS[health.provider].blurb,
    selfHosted: IMAGE_PROVIDERS[health.provider].selfHosted ?? false,
    /** What Medosha knows how to run there, whatever the provider lists. */
    catalogue: catalogueModels(health.provider),
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Which providers a deployment pays for is not public information.
  if (!user) {
    return NextResponse.json({ configured: [], providers: [] }, { status: 401 });
  }

  // `?probe=1` waits for validation; the default reads whatever startup and
  // previous requests already established, so the studio opens instantly.
  const probe = new URL(request.url).searchParams.get("probe") === "1";
  const health = probe ? await validateAll() : healthSnapshot();

  return NextResponse.json(
    {
      /** Providers a generation may actually use. */
      configured: health
        .filter((entry) => isUsable(entry.status))
        .map((entry) => entry.provider),
      providers: health.map(present),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let provider: ImageProviderName | null = null;
  let all = false;
  try {
    const body = (await request.json()) as { provider?: unknown; all?: unknown };
    if (body.all === true) all = true;
    if (typeof body.provider === "string" && body.provider in IMAGE_PROVIDERS) {
      provider = body.provider as ImageProviderName;
    }
  } catch {
    // Falls through to the 400 below.
  }

  if (all) {
    const health = await validateAll({ force: true });
    return NextResponse.json({
      providers: health.map(present),
      testedAt: Date.now(),
    });
  }

  if (!provider) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }

  const health = await validateProvider(provider, { force: true });
  return NextResponse.json({
    provider: present(health),
    ok: isUsable(health.status),
    testedAt: Date.now(),
  });
}
