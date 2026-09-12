"use client";

import { useActionState } from "react";
import Link from "next/link";
import { publishBoardPrices, type BoardPriceState } from "./actions";

export function BoardPriceForm() {
  const [state, action, pending] = useActionState<BoardPriceState, FormData>(publishBoardPrices, {});
  return (
    <form action={action} className="space-y-3">
      <button disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {pending ? "Publishing…" : "Publish / update these four prices"}
      </button>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm">All four prices are published. <Link className="underline" href="/price-exchange?sector=material">View Material Exchange</Link></p> : null}
    </form>
  );
}
