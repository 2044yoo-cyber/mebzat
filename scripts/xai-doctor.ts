/**
 * The xAI integration, tested against the real API.
 *
 *   npm run check:xai
 *
 * `scripts/xai-check.ts` proves the wiring without touching the network. This
 * one makes the calls: does the key work, does Grok answer, does an image come
 * back, does Amharic come back in Amharic. It needs XAI_API_KEY, so it is run
 * on the machine that has one.
 *
 * Nothing here writes to the database and nothing costs credits on Medosha's
 * ledger — the calls go straight to xAI, so the only cost is xAI's own, which
 * is a few hundredths of a cent for the text tests and about seven for the
 * image. The image test is skipped unless --image is passed, so a routine run
 * is effectively free.
 *
 * The key is never printed. Not the whole thing, not the last four characters:
 * a doctor script's output is the first thing anybody pastes into a chat when
 * they are asking for help.
 */

// Makes this a module rather than a global script. Two check scripts that both
// declare `RED` at the top level share one scope otherwise, and the collision
// only appears when the second one is written.
export {};

const KEY = process.env.XAI_API_KEY ?? "";
const MODEL = process.env.XAI_MODEL ?? "grok-4.5";
const IMAGE_MODEL = process.env.XAI_IMAGE_MODEL ?? "grok-2-image-1212";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(name: string, detail = "") {
  passed += 1;
  console.log(`  ${GREEN}✓${RESET} ${name}${detail ? ` ${DIM}${detail}${RESET}` : ""}`);
}

function bad(name: string, detail: string) {
  failed += 1;
  console.log(`  ${RED}✗${RESET} ${name}\n      ${RED}${detail}${RESET}`);
}

function skip(name: string, why: string) {
  skipped += 1;
  console.log(`  ${YELLOW}–${RESET} ${name} ${DIM}(${why})${RESET}`);
}

function heading(text: string) {
  console.log(`\n${text}`);
}

/**
 * A chat completion, non-streaming.
 *
 * Non-streaming on purpose: this is testing whether the endpoint answers, and
 * a streaming parser between the request and the verdict is one more thing
 * that can be the reason a test fails.
 */
async function ask(
  prompt: string,
  options: { system?: string; maxTokens?: number } = {},
): Promise<{ text: string; status: number; model: string }> {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: MODEL,
      messages: [
        ...(options.system
          ? [{ role: "system", content: options.system }]
          : []),
        { role: "user", content: prompt },
      ],
      max_tokens: options.maxTokens ?? 300,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
  };

  return {
    text: payload.choices?.[0]?.message?.content ?? "",
    status: response.status,
    model: payload.model ?? MODEL,
  };
}

async function main() {
  console.log(`\n\x1b[1mMedosha — xAI live check\x1b[0m`);
  console.log(`${DIM}model: ${MODEL} · image model: ${IMAGE_MODEL}${RESET}`);

  /* ---- 1. The key ------------------------------------------------------- */

  heading("1. Credentials");

  if (!KEY) {
    bad(
      "XAI_API_KEY is set",
      "Not found. Add it to .env.local and run this with `npm run check:xai`, " +
        "which loads that file.",
    );
    report();
    return;
  }

  // The shape, not the value. A key pasted with the surrounding quotes or a
  // trailing newline is the commonest cause of a 401, and it is invisible.
  ok("XAI_API_KEY is set", `${KEY.length} characters`);

  if (KEY !== KEY.trim()) {
    bad("the key has no surrounding whitespace", "It has leading or trailing whitespace — that alone causes a 401.");
  } else {
    ok("the key has no surrounding whitespace");
  }

  if (/^["']|["']$/.test(KEY)) {
    bad("the key is not quoted", "It starts or ends with a quote character. Remove the quotes from .env.local.");
  } else {
    ok("the key is not quoted");
  }

  /* ---- 2. Reachability and the model ------------------------------------ */

  heading("2. The API answers");

  try {
    const response = await fetch("https://api.x.ai/v1/models", {
      headers: { authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 401 || response.status === 403) {
      bad("the key is accepted", `xAI returned ${response.status}. The key is wrong, revoked, or from a different account.`);
      report();
      return;
    }
    if (!response.ok) {
      bad("api.x.ai is reachable", `HTTP ${response.status}`);
      report();
      return;
    }

    const payload = (await response.json()) as { data?: { id?: string }[] };
    const ids = (payload.data ?? []).map((entry) => entry.id ?? "");

    ok("the key is accepted", `${ids.length} models available`);

    if (ids.length > 0 && !ids.includes(MODEL)) {
      // A warning rather than a failure: xAI's model list has not always
      // included every alias that works, and a false failure here would send
      // somebody chasing a configuration problem they do not have.
      console.log(
        `      ${YELLOW}note${RESET} ${DIM}XAI_MODEL is "${MODEL}", which is not in the list: ${ids.slice(0, 8).join(", ")}${RESET}`,
      );
    }
  } catch (error) {
    bad("api.x.ai is reachable", error instanceof Error ? error.message : String(error));
    report();
    return;
  }

  /* ---- 3. The five conversations from the brief ------------------------- */

  heading("3. Text");

  try {
    const hello = await ask("Hello Medosha.", { maxTokens: 80 });
    ok("plain text", `${hello.text.slice(0, 60).replace(/\s+/g, " ")}…`);
  } catch (error) {
    bad("plain text", error instanceof Error ? error.message : String(error));
  }

  heading("4. Amharic");

  try {
    // Asked in Amharic, and the test is that the answer comes back in Amharic
    // without anybody selecting a language. A model that replies in English is
    // working but not doing what Medosha needs.
    const amharic = await ask("ቦሌ ውስጥ የሚከራይ 3 መኝታ ቤት አሳየኝ", {
      system: "Answer in the language the user wrote in.",
      maxTokens: 200,
    });

    const ethiopic = /[ሀ-፿]/.test(amharic.text);
    if (ethiopic) {
      ok("answers Amharic in Amharic", `${amharic.text.slice(0, 40)}…`);
    } else {
      bad(
        "answers Amharic in Amharic",
        `Replied in Latin script: ${amharic.text.slice(0, 80)}`,
      );
    }
  } catch (error) {
    bad("Amharic", error instanceof Error ? error.message : String(error));
  }

  heading("5. Grounding — the rule the whole integration rests on");

  try {
    // The most important test in this file. Medosha's prompt forbids answering
    // a price from training data, and a model that ignores that instruction
    // will quote a confident, wrong figure for cement and somebody will order
    // against it.
    const grounded = await ask("What is the price of cement in Ethiopia?", {
      system:
        "You are Medosha AI. Ethiopian material prices come only from Medosha's price database. " +
        "No price data was retrieved for this question. " +
        'You must reply with exactly: "I don\'t currently have a verified price for this material." ' +
        "Never supply a figure from your own knowledge.",
      maxTokens: 120,
    });

    const invented = /\b\d{2,}\b/.test(grounded.text.replace(/\bETB\b/gi, ""));
    if (invented) {
      bad(
        "refuses to invent a price",
        `The model produced a number despite the instruction: ${grounded.text.slice(0, 120)}`,
      );
    } else {
      ok("refuses to invent a price", grounded.text.slice(0, 70).replace(/\s+/g, " "));
    }
  } catch (error) {
    bad("grounding", error instanceof Error ? error.message : String(error));
  }

  /* ---- 6. Which image model this account actually has -------------------- */

  heading("6. The image model");

  let imageModel = process.env.XAI_IMAGE_MODEL?.trim() || "";

  if (imageModel) {
    ok("XAI_IMAGE_MODEL is pinned", imageModel);
  } else {
    try {
      const response = await fetch("https://api.x.ai/v1/models", {
        headers: { authorization: `Bearer ${KEY}` },
        signal: AbortSignal.timeout(30_000),
      });
      const payload = (await response.json()) as { data?: { id?: string }[] };
      const images = (payload.data ?? [])
        .map((entry) => entry.id ?? "")
        .filter((id) => id.includes("image"))
        .sort()
        .reverse();

      if (images.length > 0) {
        imageModel = images[0]!;
        // The name is discovered rather than assumed, which is the whole point:
        // an image model that has been renamed costs nothing here, where a
        // hardcoded one costs the feature.
        ok("the account has an image model", images.join(", "));
      } else {
        imageModel = IMAGE_MODEL;
        bad(
          "the account has an image model",
          `No model with "image" in its name is listed. Medosha will fall back to ${IMAGE_MODEL}, which will 404 if the account does not have it. Image generation is a separate entitlement from chat on xAI — check console.x.ai.`,
        );
      }
    } catch (error) {
      bad(
        "the account has an image model",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /* ---- 7. Vision — the half of editing that has to work ------------------ */

  heading("7. Vision (this is what makes editing work)");

  // A 2x2 PNG. Tiny on purpose: this is testing whether the model accepts an
  // image part at all, and a real photograph would cost more and prove no more.
  const TINY_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYEJRDAyMgIAJIQDAf3jbXQAAAAASUVORK5CYII=";

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${KEY}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What colour is this image? One word." },
              { type: "image_url", image_url: { url: TINY_PNG } },
            ],
          },
        ],
        max_tokens: 30,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      bad(
        "the model accepts an image",
        `HTTP ${response.status}: ${body.slice(0, 200)}\n      ` +
          `Without this, "make the red walls white" cannot work — Medosha reads the uploaded photo with this call before it generates.`,
      );
    } else {
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = payload.choices?.[0]?.message?.content ?? "";
      if (text.trim()) {
        ok("the model accepts an image", text.slice(0, 40).replace(/\s+/g, " "));
      } else {
        bad("the model accepts an image", "It answered with nothing.");
      }
    }
  } catch (error) {
    bad(
      "the model accepts an image",
      error instanceof Error ? error.message : String(error),
    );
  }

  /* ---- 8. Images -------------------------------------------------------- */

  heading("8. Image generation");

  if (!process.argv.includes("--image")) {
    skip("generates an image", "pass --image to run; it costs about $0.07");
  } else {
    try {
      const response = await fetch("https://api.x.ai/v1/images/generations", {
        method: "POST",
        headers: {
          authorization: `Bearer ${KEY}`,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({
          model: imageModel || IMAGE_MODEL,
          prompt:
            "Architectural concept render of a four-storey mixed-use building in Addis Ababa, " +
            "stone base, aluminium and glass upper floors, daylight.",
          n: 1,
          // Matches production. Medosha asks for base64 rather than a URL
          // because an xAI image URL expires and the "now make it warmer"
          // workflow needs the previous picture to still be there.
          response_format: "b64_json",
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        bad("generates an image", `HTTP ${response.status}: ${body.slice(0, 200)}`);
      } else {
        const payload = (await response.json()) as {
          data?: { url?: string; b64_json?: string }[];
        };
        const first = payload.data?.[0];
        if (first?.url || first?.b64_json) {
          ok(
            "generates an image",
            first.url ? `${first.url.slice(0, 60)}…` : "returned as base64",
          );
        } else {
          bad("generates an image", "The response carried no image.");
        }
      }
    } catch (error) {
      bad("generates an image", error instanceof Error ? error.message : String(error));
    }
  }

  /* ---- 9. The editing endpoint ------------------------------------------ */

  heading("9. Image EDITING (this is what preserves your building)");

  // The one that matters for AI Sketch to 3D Render. Generation draws a
  // building from words; editing changes the one you supplied. If this fails,
  // Medosha falls back to a redraw and says so in the UI — but the render will
  // not hold geometry, and this is where you find that out.

  const EDIT_MODEL = process.env.XAI_EDIT_MODEL?.trim() || "grok-imagine-image-quality";

  // A 4x4 red PNG. Enough to prove the endpoint accepts an image part.
  const TINY = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR4nGP8z8Dwn4GBgYEJRDAyMgIAJIQDAf3jbXQAAAAASUVORK5CYII=",
    "base64",
  );

  if (!process.argv.includes("--edit")) {
    skip(
      "edits an image",
      "pass --edit to run; this is the test that matters for rendering",
    );
  } else {
    try {
      const form = new FormData();
      form.append("model", EDIT_MODEL);
      form.append("image", new Blob([new Uint8Array(TINY)], { type: "image/png" }), "t.png");
      form.append("prompt", "Make the lighting warmer. Change nothing else.");
      form.append("n", "1");
      form.append("response_format", "b64_json");

      const response = await fetch("https://api.x.ai/v1/images/edits", {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });

      if (response.status === 404) {
        bad(
          "the edits endpoint exists",
          "xAI returned 404 for POST /v1/images/edits.\n      " +
            "Either this account does not have it or the path has moved. " +
            "Set XAI_EDIT_PATH to the correct path, or XAI_EDIT_MODEL to the right model, " +
            "and re-run. Until then Medosha falls back to a described redraw and labels it as one.",
        );
      } else if (!response.ok) {
        const body = await response.text().catch(() => "");
        bad(
          `edits an image with ${EDIT_MODEL}`,
          `HTTP ${response.status}: ${body.slice(0, 300)}`,
        );
      } else {
        const payload = (await response.json()) as {
          data?: { b64_json?: string; url?: string }[];
        };
        const first = payload.data?.[0];
        if (first?.b64_json || first?.url) {
          ok(`edits an image with ${EDIT_MODEL}`, "geometry preservation is available");
        } else {
          bad("edits an image", "The response carried no image.");
        }
      }
    } catch (error) {
      bad("edits an image", error instanceof Error ? error.message : String(error));
    }
  }

  report();
}

function report() {
  console.log(
    `\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""}\n`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\n${RED}The check itself failed:${RESET}`, error);
  process.exitCode = 1;
});
