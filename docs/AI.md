# Medosha AI

The assistant is layered so that the model, the specialism and the data are
independent of each other. The UI never calls a provider; it calls one route,
and everything below that route is swappable.

```
src/components/ai/            UI. Talks only to /api/ai/chat.
src/app/api/ai/chat/route.ts  Auth, rate limit, validation, streaming, logging.
src/lib/ai/router.ts          Picks the agent for a question.
src/lib/ai/agents/*.ts        Ten specialisms. Prompt + data needs + triggers.
src/lib/ai/context.ts         Retrieves real catalogue rows for grounding.
src/lib/ai/prompts.ts         Shared rules every agent inherits.
src/lib/ai/security.ts        Input validation, injection guards, limits.
src/lib/ai/provider.ts        Providers, model names, fallback, SSE parsing.
```

A request flows: **validate → rate limit → route to an agent → retrieve
catalogue rows → build the prompt → stream from the first working provider →
log usage**.

## Configuration

Set one variable to choose the provider, plus that provider's key:

```bash
AI_PROVIDER=groq        # groq | gemini | openrouter | ollama

GROQ_API_KEY=...                # console.groq.com — free tier
GEMINI_API_KEY=...              # aistudio.google.com — free tier
OPENROUTER_API_KEY=...          # openrouter.ai — free models available
OLLAMA_URL=http://localhost:11434   # local, no key needed
```

Each provider also accepts a model override: `GROQ_MODEL`, `GEMINI_MODEL`,
`OPENROUTER_MODEL`, `OLLAMA_MODEL`.

`MEDOSHA_AI_PROVIDER` is still read as a fallback so an existing deployment
keeps working, but `AI_PROVIDER` wins where both are set.

Ollama is the one provider needing no key, so it joins a chain only when
`AI_PROVIDER=ollama` or `OLLAMA_URL` is set explicitly. Otherwise a missing
`GROQ_API_KEY` would silently fall through to localhost and report a
connection refusal instead of the real problem.

### Missing configuration

`configurationError()` names the exact variable to set, and the route returns
it with a 503 and logs it:

```
AI_PROVIDER is set to "groq", but GROQ_API_KEY is missing.
Add GROQ_API_KEY to .env.local and restart the server.
```

### Switching providers

Change `AI_PROVIDER` and restart. Nothing else changes — the route,
the agents and the UI are unaware of which provider answered.

### Fallback

`providerChain()` returns the preferred provider first, then every other
provider that has a key configured. If one fails — rate limited, down, a bad
model name — the next is tried automatically. A free-tier limit therefore
degrades to another free tier rather than to an outage.

Two rules keep fallback honest:

- A provider that fails **before** emitting any text is retried on the next
  provider.
- A provider that fails **mid-answer** is not retried, because restarting
  would duplicate the text already streamed. The user is told to regenerate.

Every attempt, successful or not, is written to `ai_usage_logs` with its
provider, model, latency, tokens and whether it was a fallback.

## Adding a provider

Add one entry to `PROVIDERS` in `src/lib/ai/provider.ts`:

```ts
mistral: {
  name: "mistral",
  endpoint: "https://api.mistral.ai/v1/chat/completions",
  defaultModel: process.env.MISTRAL_MODEL ?? "mistral-small-latest",
  apiKey: () => process.env.MISTRAL_API_KEY ?? null,
  requiresKey: true,
  headers: (key) => ({ authorization: `Bearer ${key}` }),
},
```

Add the name to `AiProviderName` and to `FALLBACK_ORDER`. Nothing else needs
to change: any endpoint that speaks OpenAI-style chat completions with
`stream: true` works as-is.

## Upgrading to OpenAI or Anthropic

**OpenAI** is a drop-in — it is the dialect the abstraction already speaks:

```ts
openai: {
  name: "openai",
  endpoint: "https://api.openai.com/v1/chat/completions",
  defaultModel: process.env.OPENAI_MODEL ?? "gpt-4o",
  apiKey: () => process.env.OPENAI_API_KEY ?? null,
  requiresKey: true,
  headers: (key) => ({ authorization: `Bearer ${key}` }),
},
```

**Anthropic** uses a different request and event shape, so it needs its own
`streamCompletion` branch rather than a table entry:

- Endpoint `https://api.anthropic.com/v1/messages`.
- Headers `x-api-key` and `anthropic-version: 2023-06-01`.
- The system prompt is a top-level `system` field, not a message with
  `role: "system"` — split it off the front of `messages`.
- Stream events are `content_block_delta` frames carrying
  `delta.text`, and usage arrives on `message_delta`.

Everything above `provider.ts` — routing, grounding, the UI — is unaffected.

## Adding an agent

Create `src/lib/ai/agents/<name>.ts`:

```ts
import type { Agent } from "./types.ts";

export const inspectionAgent: Agent = {
  name: "inspection",
  label: "Site inspector",
  description: "Snag lists and stage sign-off checks.",
  instructions: `You are producing a site inspection checklist. …`,
  needs: ["projects"],
  triggers: ["inspection", "snag", "defect", "sign off", "handover"],
  temperature: 0.3,
};
```

Then:

1. Add it to `AGENTS` in `router.ts`.
2. Add the name to the `ai_agent` enum in a new migration and to
   `AiAgentName` in `src/types/database.types.ts`.
3. Optionally add a card to `QUICK_ACTIONS` in `src/lib/ai/quick-actions.ts`.

`needs` decides which tables `buildContext()` searches before the agent
answers, so an agent only pays for the data it uses.

## Routing

`routeAgent()` scores each agent's triggers against the question and takes the
highest. Multi-word triggers score three, single words one, so "bill of
quantities" outranks a stray "quantities". A question that matches nothing
falls to the construction agent.

The UI can bypass routing entirely by passing an `agent` — that is how the
quick-action cards open a specific assistant.

## Grounding

`buildContext()` searches products, companies, professionals and projects for
the question's keywords and formats matches as labelled lines with their site
paths. Those rows are fenced in the system prompt as `<catalogue>` data, and
the base prompt forbids inventing listings.

Retrieved rows are also returned as `sources` and rendered under the answer as
links, so a claim can be traced to the record behind it.

## Security

- **Keys stay server-side.** Nothing under `src/lib/ai/` is importable from a
  client component; each file is marked `server-only`.
- **Rate limiting** counts a user's requests in `ai_usage_logs` over a rolling
  window, so it survives restarts and holds across instances.
- **Injection guards** reject the common instruction-override phrasings, and
  client-supplied history is stripped of any `system` turn.
- **Retrieved data is fenced** and labelled as data, not instruction.
- The assistant has **no tools that write**, so a successful injection can
  still only produce text.

## Data model

Migration `0008_medosha_ai.sql`:

| Table | Holds |
|---|---|
| `ai_conversations` | One session per user; titled from the first question |
| `ai_messages` | Turns, with the provider, model and tokens that produced them |
| `ai_usage_logs` | Every attempt including failures — powers the admin view |
| `ai_saved_prompts` | Prompts a user keeps |
| `ai_feedback` | One rating per user per message |

All five are RLS-scoped to the owning user. Message ownership is checked
through `owns_ai_conversation()`, a security-definer function, so the policy
does not recurse.

## Not built yet

Deliberately absent, rather than stubbed:

- **File analysis** (PDF, DWG, DXF, IFC, images). The drawings agent answers
  from descriptions and says plainly that it cannot read uploads. The database
  and prompts are shaped for it, but no extraction pipeline exists.
- **Listing enrichment.** `LISTING_METADATA_PROMPT` in `prompts.ts` defines
  the contract for SEO titles, hashtags and keywords; the create/edit forms do
  not call it yet.
- **Admin dashboard.** `ai_usage_logs` records everything the page needs —
  provider, model, latency, errors, fallbacks — but the page itself is not
  built.
- **Conversation persistence.** The tables exist and the route logs usage
  against a conversation id, but the UI keeps history in component state; it
  does not yet read or write `ai_conversations` / `ai_messages`.

---

# Medosha AI — one assistant

Medosha AI is one conversation. You type, you attach a photograph if you have
one, and it works out what you asked for. There is no mode to choose.

This replaced a sidebar of fifteen separate applications — Facade Designer,
Interior Designer, Material Replacer, Background Remover and eleven more. Every
one of those workspaces still exists and still works; what went away is being
made to choose between them before you can start. Somebody holding a photo of
their building does not know whether they want "Redesign My Space" or "AI Image
Editor", and being asked is where they close the tab.

## How a turn is routed

`src/lib/ai/intent.ts`, a pure function of the message and whether an image is
attached. Not a model call, and that is deliberate: a classifier adds a round
trip before anything visible happens, costs credits on a step nobody asked for,
and makes "why did it do that?" unanswerable. The vocabulary of this domain —
"render this sketch", "how much will it cost", "remove the background" — is
small, specific and stable, which is where scoring beats a classifier.

```
message + attachment
   ↓  routeRequest()
task: chat | image
capability: facade | interior | materials | … | cost | boq | property
   ↓
/api/ai/chat   (existing, streaming)
/api/ai/image  (existing)
```

No new endpoints. Both routes re-derive what they are doing server-side,
because a client that decided what it was charged for could decide to be
charged nothing.

Ambiguity falls to conversation rather than to an image. An answer in words
costs a fraction of a credit and can be followed up; a wrongly generated image
costs a whole one.

### Two mistakes it is tuned against

- **Losing the building.** An edit on a photograph carries a geometry clause by
  default — same floors, same window positions, same roof, same camera. Only an
  explicit "add a floor" or "make it taller" releases it, and an explicit "keep
  the exact geometry" wins over both.
- **Answering a question with a picture.** "Estimate the cost of this building",
  *with a drawing attached*, is still a question.

`npm run check:ai-router` runs every example from the brief plus the phrasings
designed to trip it.

## Credits

One wallet for text and images. Costs are rows in `ai_operation_costs`, never
numbers in the frontend.

A turn is **reserved** before the model is called and **committed at what it
actually cost** — the difference returns in the same transaction. That is what
lets a one-line answer cost 0.02 and a long analysis cost 0.3 without either
being guessed at in advance. The database clamps the metered figure to the hold
in both directions, so a bad meter can neither overcharge nor pay anyone out.

| | held | charged |
| --- | --- | --- |
| `ai.chat` | 0.3 | `0.02 + tokens` (`src/lib/billing/metering.ts`) |
| `ai.image` | 1 per image asked for | 1 per image **returned** |

A failure charges nothing. Every path out of both routes — provider exhausted,
truncated answer, cancelled request, unexpected throw — refunds.

Tokens, model, provider, image count, quality, credits charged, capability and
a `request_id` land on `ai_usage_logs`, one row per attempt including the ones
that failed and fell back.

## The workspaces

`/ai?tool=facade` and every other tool id still opens the full studio —
provider picker, four variations, queue, history. `/ai?agent=cost` pins the
conversation to one assistant, which is what the Construction rows use.

Nothing was deleted. The command palette still finds "facade", "upscale",
"background" and the rest, and lands them on Medosha AI.
