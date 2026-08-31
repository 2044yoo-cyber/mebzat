import { NextResponse } from "next/server";

import { listWorkshops } from "@/features/berchuma-studio/services/quotes";

/** Joineries that could build a design. Loaded only when somebody asks. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const city = new URL(request.url).searchParams.get("city");
  return NextResponse.json({ workshops: await listWorkshops(city) });
}
