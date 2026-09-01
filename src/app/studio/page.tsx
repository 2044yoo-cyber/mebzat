import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StudioWorkspace } from "@/features/berchuma-studio/components/studio-workspace";
import { marketRates } from "@/features/berchuma-studio/services/rates";
import type { MarketRate } from "@/features/berchuma-studio/types/cost";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Berchuma Studio",
  description:
    "Describe fitted furniture and get a drawing, a parts list and a price built from live Ethiopian supplier rates.",
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
export default async function StudioPage() {
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

  return <StudioWorkspace rates={rates} />;
}

type Session =
  | { state: "signed-in" }
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

    return data.user ? { state: "signed-in" } : { state: "anonymous" };
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
        <h1 className="text-lg font-semibold">Berchuma cannot reach Medosha</h1>
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
