"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Contains any failure inside the map.
 *
 * The map is the one part of this page that pulls in a large third-party
 * library and talks to the network, so it is the part most likely to break on
 * an unusual browser or a restricted connection. Everything around it — the
 * filters, the listings, the header — is ordinary React that works regardless,
 * and should stay on screen when the map does not.
 *
 * A class component because that is still the only way to catch a render
 * error in React.
 */
export class MapBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error("[medosha:map] map failed to render:", error);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex size-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-10 text-center">
          <AlertTriangle className="size-8 text-amber-500" />
          <p className="font-medium">The map could not start</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Listings are still searchable in the panel beside this. The rest of
            Medosha is unaffected.
          </p>
          <code className="max-w-sm overflow-x-auto rounded-lg bg-muted px-2 py-1 text-xs">
            {this.state.error.message}
          </code>
        </div>
      );
    }

    return this.props.children;
  }
}
