"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check } from "lucide-react";

import {
  setAutoPublishAvailable,
  setEnabledPlatforms,
  setOperationCost,
  setPlanLimits,
} from "@/lib/actions/admin-content";
import { PLATFORM_SPECS, SOCIAL_PLATFORMS } from "@/lib/social/platforms";
import { PLAN_ORDER, planLabel } from "@/lib/billing/operations";
import { cn } from "@/lib/utils";
import type { AiOperationCost } from "@/types/database.types";

/**
 * The operator's screen.
 *
 * Everything here writes to a table the server reads at request time, so a
 * change takes effect on the next request rather than the next deploy. That
 * was the brief's requirement and it is also what makes a price a business
 * decision rather than an engineering ticket.
 *
 * Each control says what it does *not* do, where that is not obvious. The
 * platform switches are the important case: turning Instagram on does not make
 * Instagram work, and an admin who does not know that will turn it on, watch
 * nothing happen, and file a bug.
 */

type Props = {
  costs: AiOperationCost[];
  limits: Record<string, Record<string, number>>;
  enabled: string[];
  autoPublish: boolean;
  /** Which platforms the server actually holds credentials for. */
  configured: Record<string, boolean>;
};

export function AdminControls({
  costs,
  limits,
  enabled,
  autoPublish,
  configured,
}: Props) {
  const [message, setMessage] = useState<
    { ok: boolean; text: string } | null
  >(null);

  return (
    <div className="space-y-8">
      {message ? (
        <p
          className={cn(
            "flex items-start gap-2 rounded-lg border p-3 text-sm",
            message.ok
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/40 bg-destructive/5 text-destructive",
          )}
        >
          {message.ok ? (
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          {message.text}
        </p>
      ) : null}

      <CostTable costs={costs} onMessage={setMessage} />

      <LimitTable
        title="Weekly posting limit"
        description="Successful publishes per rolling seven days. Zero means the plan cannot use AI posting at all."
        settingKey="weekly_post_limit"
        values={limits.weekly_post_limit ?? {}}
        onMessage={setMessage}
      />

      <LimitTable
        title="Monthly posting limit"
        description="Per rolling thirty days. Zero disables the monthly check and leaves only the weekly one."
        settingKey="monthly_post_limit"
        values={limits.monthly_post_limit ?? {}}
        onMessage={setMessage}
      />

      <LimitTable
        title="Connected accounts"
        description="How many social accounts a member on each plan may connect."
        settingKey="max_connected_accounts"
        values={limits.max_connected_accounts ?? {}}
        onMessage={setMessage}
      />

      <PlatformSwitches
        enabled={enabled}
        configured={configured}
        onMessage={setMessage}
      />

      <AutoPublishSwitch available={autoPublish} onMessage={setMessage} />
    </div>
  );
}

type Notify = (message: { ok: boolean; text: string }) => void;

/* -------------------------------------------------------------------------- */

function CostTable({
  costs,
  onMessage,
}: {
  costs: AiOperationCost[];
  onMessage: Notify;
}) {
  const social = costs.filter((cost) => cost.operation.startsWith("social."));
  const other = costs.filter((cost) => !cost.operation.startsWith("social."));

  return (
    <section>
      <h2 className="text-sm font-semibold">Credit price and plan</h2>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">
        The minimum plan is the feature permission — a member below it is
        refused by the server before anything is generated. Changing a price
        here changes what the next request costs; nothing is cached and nothing
        needs a deploy.
      </p>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2 font-medium">Operation</th>
              <th className="p-2 font-medium">Credits</th>
              <th className="p-2 font-medium">Minimum plan</th>
              <th className="p-2 font-medium">Active</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {[...social, ...other].map((cost) => (
              <CostRow key={cost.operation} cost={cost} onMessage={onMessage} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CostRow({
  cost,
  onMessage,
}: {
  cost: AiOperationCost;
  onMessage: Notify;
}) {
  const [credits, setCredits] = useState(String(cost.credits));
  const [minPlan, setMinPlan] = useState(cost.min_plan);
  const [active, setActive] = useState(cost.active);
  const [pending, startTransition] = useTransition();

  const dirty =
    credits !== String(cost.credits) ||
    minPlan !== cost.min_plan ||
    active !== cost.active;

  return (
    <tr className="border-b last:border-0">
      <td className="p-2">
        <span className="font-medium">{cost.label}</span>
        <span className="block font-mono text-[10px] text-muted-foreground">
          {cost.operation}
        </span>
      </td>
      <td className="p-2">
        <input
          type="number"
          min={0}
          max={10_000}
          value={credits}
          onChange={(event) => setCredits(event.target.value)}
          className="w-20 rounded border bg-background px-2 py-1 text-right tabular-nums"
        />
      </td>
      <td className="p-2">
        <select
          value={minPlan}
          onChange={(event) => setMinPlan(event.target.value as typeof minPlan)}
          className="rounded border bg-background px-2 py-1 text-xs"
        >
          {PLAN_ORDER.map((plan) => (
            <option key={plan} value={plan}>
              {planLabel(plan)}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
          className="size-4 accent-brand"
        />
      </td>
      <td className="p-2 text-right">
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setOperationCost({
                operation: cost.operation,
                credits: Number(credits),
                minPlan,
                active,
              });
              onMessage(
                result.ok
                  ? { ok: true, text: `${cost.label} saved.` }
                  : { ok: false, text: result.error },
              );
            })
          }
          className="rounded border px-2 py-1 text-xs disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */

function LimitTable({
  title,
  description,
  settingKey,
  values,
  onMessage,
}: {
  title: string;
  description: string;
  settingKey:
    | "weekly_post_limit"
    | "monthly_post_limit"
    | "included_posts_per_month"
    | "max_connected_accounts";
  values: Record<string, number>;
  onMessage: Notify;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(
      PLAN_ORDER.map((plan) => [plan, String(values[plan] ?? 0)]),
    ),
  );
  const [pending, startTransition] = useTransition();

  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">{description}</p>

      <div className="flex flex-wrap items-end gap-2">
        {PLAN_ORDER.map((plan) => (
          <label key={plan} className="block">
            <span className="block text-xs text-muted-foreground">
              {planLabel(plan)}
            </span>
            <input
              type="number"
              min={0}
              max={100_000}
              value={draft[plan] ?? "0"}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [plan]: event.target.value,
                }))
              }
              className="mt-0.5 w-24 rounded border bg-background px-2 py-1 text-right text-sm tabular-nums"
            />
          </label>
        ))}

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setPlanLimits(
                settingKey,
                Object.fromEntries(
                  Object.entries(draft).map(([plan, value]) => [
                    plan,
                    Number(value),
                  ]),
                ),
              );
              onMessage(
                result.ok
                  ? { ok: true, text: `${title} saved.` }
                  : { ok: false, text: result.error },
              );
            })
          }
          className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function PlatformSwitches({
  enabled,
  configured,
  onMessage,
}: {
  enabled: string[];
  configured: Record<string, boolean>;
  onMessage: Notify;
}) {
  const [selected, setSelected] = useState<string[]>(enabled);
  const [pending, startTransition] = useTransition();

  return (
    <section>
      <h2 className="text-sm font-semibold">Platforms offered to members</h2>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">
        Switching a platform on does not make it work. It also needs its app
        credentials on the server and its app review complete — a platform
        marked <em>no credentials</em> below stays unavailable however this is
        set.
      </p>

      <div className="space-y-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const spec = PLATFORM_SPECS[platform];
          const ready = configured[platform] === true;
          const on = selected.includes(platform);
          const locked = platform === "medosha";

          return (
            <label
              key={platform}
              className="flex items-start gap-2 rounded-lg border p-2"
            >
              <input
                type="checkbox"
                checked={on || locked}
                disabled={locked}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, platform]
                      : current.filter((entry) => entry !== platform),
                  )
                }
                className="mt-0.5 size-4 accent-brand"
              />
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium">{spec.label}</span>
                {locked ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    always on — this site&rsquo;s own feed
                  </span>
                ) : ready ? (
                  <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                    credentials present
                  </span>
                ) : (
                  <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                    no credentials — set {spec.credentialVars.join(" and ")}
                  </span>
                )}

                {spec.requirements.length > 0 ? (
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {spec.requirements[0]}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setEnabledPlatforms(selected);
            onMessage(
              result.ok
                ? { ok: true, text: "Platforms saved." }
                : { ok: false, text: result.error },
            );
          })
        }
        className="mt-3 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save platforms"}
      </button>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function AutoPublishSwitch({
  available,
  onMessage,
}: {
  available: boolean;
  onMessage: Notify;
}) {
  const [on, setOn] = useState(available);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
      <h2 className="text-sm font-semibold">Automatic publishing</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        With this off, the scheduler publishes nothing and no member can enable
        automatic publishing on their own schedule. With it on, a schedule whose
        owner has explicitly enabled it may publish approved posts without
        anybody present.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Even then, only posts a person has already approved are ever sent. This
        switch does not change that.
      </p>

      <label className="mt-3 flex items-center gap-2">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.checked;
            setOn(next);
            startTransition(async () => {
              const result = await setAutoPublishAvailable(next);
              if (!result.ok) setOn(!next);
              onMessage(
                result.ok
                  ? {
                      ok: true,
                      text: next
                        ? "Automatic publishing is now available."
                        : "Automatic publishing is switched off.",
                    }
                  : { ok: false, text: result.error },
              );
            });
          }}
          className="size-4 accent-brand"
        />
        <span className="text-sm">
          Allow automatic publishing of approved scheduled posts
        </span>
      </label>
    </section>
  );
}
