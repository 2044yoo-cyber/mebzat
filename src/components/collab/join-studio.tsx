"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Link2Off, Loader2, LogIn, Shapes } from "lucide-react";

import { LEVELS, tokenFromHash } from "@/lib/collab/model";
import { roleLabel, type AgendaRole } from "@/lib/agenda/constants";

import { acceptInviteLink, previewInviteLink, type InvitePreview } from "@/app/(dashboard)/agenda/join/actions";

/**
 * Where an invitation link lands.
 *
 * The token arrives after `#`, is moved into this tab's session storage and
 * taken off the address at once — so it is not left in the history, a
 * bookmark or a screenshot — and survives the trip through signing in.
 * Nothing is granted until the person presses Join, and then by the database.
 */
const KEY = "medosha_join_token";

function readToken(): string | null {
  // A link in the address is the one being opened — even a broken one, which
  // must not quietly become whichever link this tab opened before.
  if (window.location.hash.length > 1) return tokenFromHash(window.location.hash);
  try { return tokenFromHash(sessionStorage.getItem(KEY) ?? ""); } catch { return null; }
}
const onHashChange = (changed: () => void) => { window.addEventListener("hashchange", changed); return () => window.removeEventListener("hashchange", changed); };

type Checked = { token: string; preview: InvitePreview | null; error: string | null };

export function JoinStudio({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  // `undefined` until the browser has read the address; `null` when there is no link.
  const token = useSyncExternalStore(onHashChange, readToken, () => undefined);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, start] = useTransition();

  useEffect(() => {
    if (!token) return;
    try { sessionStorage.setItem(KEY, token); } catch { /* private mode: the address still has it */ }
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [token]);

  useEffect(() => {
    if (!token || !signedIn) return;
    let live = true;
    previewInviteLink(token).then(
      (result) => { if (live) setChecked({ token, preview: result.ok ? result.preview : null, error: result.ok ? null : result.error }); },
      () => { if (live) setChecked({ token, preview: null, error: "The invitation could not be checked. Try again in a moment." }); },
    );
    return () => { live = false; };
  }, [token, signedIn]);

  const join = () => start(async () => {
    if (!token) return;
    setJoinError(null);
    const result = await acceptInviteLink(token);
    if (!result.ok) { setJoinError(result.error); return; }
    try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
    router.push(`/agenda/projects/${result.projectId}/collaborate`);
  });

  const forget = () => { try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ } };

  if (token === undefined) return <Frame><Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-label="Reading the link" /></Frame>;
  if (token === null) {
    return (
      <Frame>
        <Link2Off className="size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">No invitation here</h1>
        <p className="text-sm text-muted-foreground">Open the invitation link you were sent, all of it. If it was cut short in a message, ask for it again.</p>
      </Frame>
    );
  }
  if (!signedIn) {
    return (
      <Frame>
        <Shapes className="size-8 text-brand" />
        <h1 className="text-lg font-semibold">You have been invited to a project</h1>
        <p className="text-sm text-muted-foreground">Sign in, or create a Medosha account, to see who invited you and join. Keep this tab open: you come back here after signing in.</p>
        <Link href="/login?redirect=/agenda/join" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground"><LogIn className="size-4" />Sign in to join</Link>
      </Frame>
    );
  }
  if (!checked || checked.token !== token) return <Frame><Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-label="Checking the invitation" /></Frame>;
  if (checked.error) return <Frame><p role="alert" className="text-sm text-destructive">{checked.error}</p></Frame>;

  const preview = checked.preview;
  if (!preview) {
    return (
      <Frame>
        <Link2Off className="size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">This invitation link is not valid</h1>
        <p className="text-sm text-muted-foreground">It may have been mistyped or cut short. Ask whoever sent it for a new one.</p>
      </Frame>
    );
  }

  const level = LEVELS.find((entry) => entry.value === preview.level);
  const closed: Record<string, string> = {
    revoked: "This link was withdrawn by the project owner.",
    expired: "This link has expired.",
    used: "This link has already been used by as many people as it was made for.",
    removed: "Your access to this project was removed. Ask the project owner to add you again.",
  };

  return (
    <Frame>
      <Shapes className="size-8 text-brand" />
      <p className="text-sm text-muted-foreground">{preview.invited_by} invites you to</p>
      <h1 className="text-xl font-semibold">{preview.project_name}</h1>
      {preview.state === "member" ? (
        <>
          <p className="text-sm text-muted-foreground">You are already on this project. Using the link changes nothing.</p>
          <button type="button" onClick={join} disabled={joining} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground disabled:opacity-50">{joining ? <Loader2 className="size-4 animate-spin" /> : null}Open the Studio</button>
        </>
      ) : preview.state === "ok" ? (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-left text-sm">
            <dt className="text-muted-foreground">Access</dt><dd><span className="font-medium">{level?.label}</span> — {level?.summary.toLowerCase()}</dd>
            <dt className="text-muted-foreground">Role</dt><dd>{roleLabel(preview.role as AgendaRole)}</dd>
            <dt className="text-muted-foreground">Link expires</dt><dd>{new Date(preview.expires_at).toLocaleString()}</dd>
          </dl>
          <p className="text-xs text-muted-foreground">Joining shows you the project&apos;s Studio. Money, meetings and contracts stay private unless the owner shares them with you.</p>
          {joinError ? <p role="alert" className="text-sm text-destructive">{joinError}</p> : null}
          <button type="button" onClick={join} disabled={joining} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground disabled:opacity-50">{joining ? <Loader2 className="size-4 animate-spin" /> : null}Join the project</button>
        </>
      ) : (
        <>
          <p role="alert" className="text-sm text-destructive">{closed[preview.state] ?? "This link no longer works."}</p>
          <Link href="/agenda" onClick={forget} className="text-sm text-brand underline">Go to your projects</Link>
        </>
      )}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <section aria-label="Invitation" className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-2xl border bg-card p-6 text-center shadow-sm">{children}</section>;
}
