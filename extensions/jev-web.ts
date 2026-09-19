// @ts-nocheck
// jev-web — an optional OMP browser tool backed by TypeSafe Jev (System One) instead of the
// main model's element picking.
//
// It drives its own headless Chromium over raw CDP and never touches the built-in `browser`
// tool or its tabs: if this tool fails, the existing path is unaffected. One Jev request per
// decision cycle returns an operation plus its target; an OpenAI-compatible model writes the
// text only when the chosen operation is TYPE_TEXT.
//
// Requires TYPESAFE_API_KEY, plus a text model key (DEEPSEEK_API_KEY by default).
// Engine lives in ../jev/ (snapshot.js + engine.mjs).

import { runGoal, MAX_STEPS } from "../jev/engine.mjs";

const DESCRIPTION = `Drive a real headless browser from one natural-language goal, choosing each
action with TypeSafe Jev (System One) instead of the main model.
Use it for self-contained web tasks on a single page: fill a form, set filters, submit, open a
result. It runs its own Chromium and its own observe/predict/act loop (~5-15s typical), so it does
not see or disturb tabs owned by the "browser" tool and cannot use your logged-in sessions.
It can go back to a previous page and it presses Escape by itself when something is in the way, but
it has no reasoning model behind it: a CAPTCHA, a login, or a multi-tab flow will fail.
Prefer the "browser" tool when you need login state, multi-tab work, uploads, iframes, shadow DOM,
canvas, or when you want to inspect the page yourself. Requires TYPESAFE_API_KEY.
Returns a step-by-step transcript ending in "done", "blocked", or "budget". On any non-done status
it returns the page it stopped on and what to try next. A "done" choice is the model's judgement,
not proof — verify the outcome when correctness matters.`;

export default function jevWeb(omp) {
  if (!process.env.TYPESAFE_API_KEY) {
    console.warn("[jev-web] TYPESAFE_API_KEY is not set — jev_web is registered but will fail on call");
  }

  omp.registerTool({
    name: "jev_web",
    label: "Jev Web",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute page URL to open (http, https, or file)." },
        goal: {
          type: "string",
          description: "The complete task, including every value to enter, filter to set, and result to open.",
        },
        max_steps: {
          type: "number",
          description: `Maximum actions before stopping (default ${MAX_STEPS}).`,
        },
      },
      required: ["url", "goal"],
    },
    execute: async (_id, input) => {
      const { url, goal, max_steps: maxSteps } = input ?? {};
      if (typeof url !== "string" || !url.trim()) throw new Error("jev_web: url is required");
      if (typeof goal !== "string" || !goal.trim()) throw new Error("jev_web: goal is required");

      const lines = [];
      const result = await runGoal({
        url: url.trim(),
        goal: goal.trim(),
        maxSteps: Number.isFinite(maxSteps) ? Math.max(1, Math.min(60, Number(maxSteps))) : undefined,
        log: (line) => lines.push(line),
      });

      const lines = [`status: ${result.status}  (${result.elapsed_ms} ms)`, `final url: ${result.url}`];
      if (result.reason) lines.push(`stopped because: ${result.reason}`);
      for (const s of result.steps) {
        lines.push(
          `${String(s.step).padStart(2)}. ${s.escape ? "ESCAPE " : `${s.operation} `}` +
          `${s.text ? `"${s.text}" ` : ""}${s.refused ? "REFUSED " : ""}→ ${s.action}` +
          `  ${s.page_changed === false ? "no change" : "changed"}`,
        );
      }
      if (result.status !== "done") {
        // A failed run is only useful if the caller can decide what to do next.
        lines.push(
          "",
          "this run did not reach the goal. The page it stopped on offered:",
          ...(result.blocking_page?.controls ?? []).slice(0, 30).map((c) => `  - ${c}`),
          "",
          `page text: ${(result.blocking_page?.text ?? "").slice(0, 400)}`,
          "",
          "next: re-running with a narrower goal, or handling this part with the `browser` tool " +
          "(sessions, multi-tab, iframes, uploads), is usually better than retrying the same call.",
        );
      } else {
        lines.push("", "final visible text:", result.text);
      }
      const summary = lines.join("\n");

      return {
        content: [{ type: "text", text: summary }],
        details: {
          status: result.status,
          reason: result.reason,
          elapsed_ms: result.elapsed_ms,
          url: result.url,
          title: result.title,
          steps: result.steps,
          blocking_page: result.blocking_page,
        },
      };
    },
  });
}
