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
Prefer the "browser" tool when you need login state, multi-tab work, uploads, iframes, shadow DOM,
canvas, or when you want to inspect the page yourself. Requires TYPESAFE_API_KEY.
Returns a step-by-step transcript ending in DONE, BLOCKED, budget, or an error. A DONE choice is
the model's judgement, not proof — verify the outcome when correctness matters.`;

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

      const summary = [
        `status: ${result.status}  (${result.elapsed_ms} ms)`,
        `final url: ${result.url}`,
        ...result.steps.map((s) =>
          `${String(s.step).padStart(2)}. ${s.operation}${s.text ? ` "${s.text}"` : ""} → ${s.action}` +
          `  p=${(s.probability ?? 0).toFixed(2)} changed=${s.page_changed}`),
        "",
        "final visible text:",
        result.text,
      ].join("\n");

      return {
        content: [{ type: "text", text: summary }],
        details: { status: result.status, elapsed_ms: result.elapsed_ms, url: result.url, title: result.title, steps: result.steps },
      };
    },
  });
}
