import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StudioWorkspace } from "@/features/berchuma-studio/components/studio-workspace";
import { marketRates } from "@/features/berchuma-studio/services/rates";
import type { MarketRate } from "@/features/berchuma-studio/types/cost";
import { getDesign, listOwnDesigns } from "@/features/berchuma-studio/services/designs";
import {
  designKinds,
  type DesignKind,
  type DesignSpec,
} from "@/features/berchuma-studio/types/spec";
import { CABINET_TYPES, findTemplate } from "@/features/berchuma-studio/services/cabinet-templates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Cabinet Design",
  description:
    "Design cabinets — wardrobes, kitchens, vanities, TV units and more — and get a drawing, a cut list and a price built from live Ethiopian supplier rates.",
};

/**
 * Berchuma Studio.
 *
 * Rates are fetched here, once, on the server. The alternative — the browser
 * asking for prices — would put a request between the customer and the first
 * number they see, and would mean the cost panel could not recalculate while a
 * slider moves. Fetched once and passed down, every subsequent edit is
 * arithmetic.
 *
 * Nothing on this page is allowed to turn an unreachable database into a blank
 * "Internal Server Error". The studio's whole value — the drawing, the parts,
 * the price — is computed in the browser from a spec, so it works with no
 * rates at all; the only thing that genuinely needs Supabase is knowing who
 * you are, and that failing is worth saying out loud rather than crashing.
 */
export default async function StudioPage(props: {
  searchParams: Promise<{ kind?: string; width?: string; design?: string; template?: string }>;
}) {
  const session = await currentUser();

  if (session.state === "unreachable") {
    return <Unreachable detail={session.detail} />;
  }

  if (session.state === "anonymous") {
    redirect(`/login?redirect=${encodeURIComponent("/studio")}`);
  }

  // Never fatal: `marketRates` swallows its own failures and an empty list
  // means every line is priced from the catalogue and labelled as an estimate.
  let rates: MarketRate[] = [];
  try {
    rates = await marketRates();
  } catch {
    rates = [];
  }

  const { kind, width, design, template } = await props.searchParams;

  // Cabinet Design opens as a project dashboard: the latest saved work is
  // visible immediately instead of hiding behind the old Berchuma chat tab.
  const recentProjects = await listOwnDesigns(6).catch(() => []);

  /**
   * Opened from a saved design: /studio?design=<slug>.
   *
   * This is what "Open in Studio" on a design page does. It used to be a bare
   * link to `/studio`, which opened the picker — so pressing it on a design
   * you had spent an hour on gave you an empty studio, and the design was
   * still only on its own page.
   *
   * Loaded here rather than in the browser for the reason everything else on
   * this page is: `getDesign` runs under the viewer's own session, so a slug
   * somebody types by hand is subject to the same row-level rules as the page
   * it came from, and an unreadable design is simply not found.
   *
   * Only for the owner. Somebody else's design opens through Remix, which
   * makes them their own copy and credits the original — editing it in place
   * would either fail on save or quietly overwrite another person's work.
   */
  let editing: { spec: DesignSpec; designId: string; slug: string } | null = null;
  if (design) {
    const record = await getDesign(design).catch(() => null);
    if (record?.isOwner) {
      editing = { spec: record.spec, designId: record.id, slug: record.slug };
    }
  }

  // Do not silently show the new-design picker when a saved-project link
  // fails. A missing, inaccessible or invalid design needs an explicit error.
  if (design && !editing) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold">Could not open this cabinet design</h1>
        <p className="text-sm text-muted-foreground">
          This project may have been deleted, may belong to another account, or
          may contain design data that can no longer be opened. Your other
          designs have not been changed.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/designs?mine=1" className="rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground">
            My projects
          </Link>
          <Link href="/studio" className="rounded-lg border px-4 py-3 text-sm">
            New cabinet design
          </Link>
        </div>
      </div>
    );
  }

  // Opened from a furniture calculator: /studio?kind=wardrobe&width=2400.
  // Anything that is not a real design kind is ignored rather than trusted, so
  // a hand-edited URL gets the ordinary start panel instead of a crash.
  const parsedWidth = Number(width);
  // Or from the template gallery's "Use Template": /studio?template=<id>. The
  // start steps open on that template, asking for the space it is to fit.
  const chosenTemplate = template ? findTemplate(template) : undefined;
  const templateKind = chosenTemplate ? CABINET_TYPES.find((entry) => entry.type === chosenTemplate.type)?.kind : undefined;
  const opening =
    !editing && chosenTemplate && templateKind
      ? { kind: templateKind, template: chosenTemplate.id }
      : !editing && kind && (designKinds as readonly string[]).includes(kind)
      ? {
          kind: kind as DesignKind,
          width: Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : undefined,
        }
      : null;

  return (
    <StudioWorkspace
      // The Studio owns an initialised React design controller. Next.js can
      // preserve it while changing only the search query, so force a fresh
      // controller when opening another saved design or going back to Start.
      key={editing ? `saved:${editing.designId}` : opening ? `new:${opening.kind}:${opening.width ?? ""}:${opening.template ?? ""}` : "dashboard"}
      rates={rates}
      opening={opening}
      editing={editing}
      recentProjects={recentProjects}
      // The draft is keyed by who is looking, so a shared phone never shows
      // one owner's unfinished work to the next person to sign in.
      userId={session.state === "signed-in" ? session.userId : null}
    />
  );
}

type Session =
  | { state: "signed-in"; userId: string }
  | { state: "anonymous" }
  | { state: "unreachable"; detail: string };

/**
 * Who is asking, or why we cannot tell.
 *
 * `getUser` throws rather than returning an error when the host is
 * unreachable, when the anon key is missing, or when the URL points at a
 * project that no longer exists. Each of those is a setup problem with a
 * specific fix, and each of them used to render as a bare
 * "Internal Server Error" with the real message only in the terminal.
 *
 * `redirect()` is deliberately outside this function: it works by throwing,
 * and a `catch` around it would swallow the redirect and report the
 * navigation as a database failure.
 */
async function currentUser(): Promise<Session> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    // A missing session is not an error — it is a signed-out visitor, and
    // Supabase reports it as one.
    if (error && !data.user) {
      const missing = /Auth session missing/i.test(error.message);
      return missing
        ? { state: "anonymous" }
        : { state: "unreachable", detail: error.message };
    }

    return data.user
      ? { state: "signed-in", userId: data.user.id }
      : { state: "anonymous" };
  } catch (problem) {
    return {
      state: "unreachable",
      detail: problem instanceof Error ? problem.message : "unknown error",
    };
  }
}

function Unreachable({ detail }: { detail: string }) {
  return (
    <div className="mx-auto w-full max-w-lg p-6">
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
        <h1 className="text-lg font-semibold">Cabinet Design cannot reach Medosha</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The studio needs to know who you are before it can save anything, and
          the database did not answer. Everything else here is unaffected — this
          is a connection or configuration problem, not a fault in the design
          tools.
        </p>

        <ol className="mt-4 space-y-2 text-sm">
          <li>
            1. Check <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            and{" "}
            <code className="rounded bg-muted px-1">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            are set in <code className="rounded bg-muted px-1">.env.local</code>,
            then restart the dev server — Next.js reads that file once, at
            startup.
          </li>
          <li>2. Check the Supabase project is not paused.</li>
          <li>3. Check this machine can reach the internet.</li>
        </ol>

        {/* The provider's own words, on the page rather than only in a
            terminal the person looking at this may not have open. It names the
            host, which is usually the whole answer. */}
        <p className="mt-4 rounded-lg bg-muted p-2 font-mono text-xs break-words">
          {detail}
        </p>

        <Link
          href="/"
          className="mt-4 inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          Back to the feed
        </Link>
      </div>
    </div>
  );
}
