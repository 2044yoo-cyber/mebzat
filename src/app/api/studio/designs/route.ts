import { NextResponse } from "next/server";

import {
  publishDesign,
  remixDesign,
  saveDesign,
} from "@/features/berchuma-studio/services/designs";
import { requestQuote } from "@/features/berchuma-studio/services/quotes";
import { upgradeSpec, designSpecSchema } from "@/features/berchuma-studio/types/spec";

/**
 * Saving, publishing and remixing.
 *
 * One route with an `action` rather than three, because all three are the same
 * shape — a design id, a small payload, a slug back — and three routes would
 * be three copies of the same auth and parse preamble.
 *
 * Nothing here trusts a price from the browser. The cost is recomputed from
 * the spec on the server every time, which is the only version a public page
 * is allowed to quote.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "save";

  if (action === "save") {
    const parsed = designSpecSchema.safeParse(upgradeSpec(body.spec));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "That design could not be read." },
        { status: 400 },
      );
    }

    const result = await saveDesign({
      designId: typeof body.designId === "string" ? body.designId : undefined,
      spec: parsed.data,
      note: typeof body.note === "string" ? body.note.slice(0, 300) : undefined,
    });

    return result.ok
      ? NextResponse.json(result.design)
      : NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (action === "publish") {
    if (typeof body.designId !== "string") {
      return NextResponse.json({ error: "Save the design first." }, { status: 400 });
    }
    // Unlisted is a real choice — a link to send a client without it appearing
    // in the feed or the gallery — so it is accepted, and anything else is not.
    const visibility = body.visibility === "unlisted" ? "unlisted" : "public";

    const result = await publishDesign(body.designId, visibility);
    return result.ok
      ? NextResponse.json({ slug: result.slug })
      : NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (action === "remix") {
    if (typeof body.designId !== "string") {
      return NextResponse.json({ error: "Nothing to remix." }, { status: 400 });
    }
    const result = await remixDesign(
      body.designId,
      typeof body.title === "string" ? body.title.slice(0, 160) : undefined,
    );
    return result.ok
      ? NextResponse.json({ slug: result.slug })
      : NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (action === "quote") {
    if (typeof body.designId !== "string" || typeof body.companyId !== "string") {
      return NextResponse.json(
        { error: "Choose a workshop first." },
        { status: 400 },
      );
    }

    const result = await requestQuote({
      designId: body.designId,
      companyId: body.companyId,
      note: typeof body.note === "string" ? body.note.slice(0, 2000) : undefined,
      // A date the browser could not have produced is dropped rather than
      // rejected: the request is still worth sending without one.
      neededBy:
        typeof body.neededBy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.neededBy)
          ? body.neededBy
          : null,
    });

    return result.ok
      ? NextResponse.json({ id: result.id })
      : NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
