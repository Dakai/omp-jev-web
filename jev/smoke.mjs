// Smoke test for the jev-web engine: drives the bundled offline fixtures and asserts the expected
// outcome of each. Run: bun jev/smoke.mjs
//
// Needs TYPESAFE_API_KEY and a text-model key (DEEPSEEK_API_KEY by default). No network beyond those.
// Each case starts its own headless Chromium; the whole file takes roughly half a minute.

import { runGoal } from "./engine.mjs";

// The extension wrapper is a separate artifact from the engine: loading it here catches a syntax
// or duplicate-declaration error before OMP's own validator refuses the install.
const extension = await import("../extensions/jev-web.ts");
if (typeof extension.default !== "function") {
  console.error("FAIL: extensions/jev-web.ts does not export a default function");
  process.exit(1);
}

const fx = (name) => new URL(`fixtures/${name}`, import.meta.url).href;
const HOTEL = "Search for Lisbon, set sort to Design, enable Free cancellation, and open the Casa Flora hotel.";

const cases = [
  {
    name: "linear: an unobstructed form",
    url: fx("linear.html"),
    goal: HOTEL,
    check: (r) => {
      if (r.status !== "done") return `status ${r.status}`;
      if (!r.url.includes("#casa-flora")) return `final url ${r.url}`;
      if (!r.text.includes("MATCH")) return "fixture reported NO MATCH: a control was not applied";
      if (r.refusals.length) return `${r.refusals.length} refused decision(s)`;
      if (r.escapes.length) return `${r.escapes.length} unnecessary escape(s)`;
      return null;
    },
  },
  {
    name: "occluded: form under a full-page consent overlay",
    url: fx("consent.html"),
    goal: HOTEL,
    check: (r) => {
      if (r.status !== "done") return `status ${r.status}`;
      if (!r.text.includes("MATCH")) return "fixture reported NO MATCH: a control was not applied";
      // The overlay's controls must be dismissed first; the covered form must never be offered.
      if (r.refusals.length) return `the executor refused ${r.refusals.length} decision(s): occluded controls were offered`;
      return null;
    },
  },
  {
    name: "escape: a lightbox with no controls that only closes on Escape",
    url: fx("escape-key.html"),
    goal: "Search for Lisbon.",
    check: (r) => {
      if (r.status !== "done") return `status ${r.status}`;
      if (!r.text.includes("SUBMITTED")) return "the form was never submitted";
      if (!r.escapes.some((e) => e.page_changed)) return "no escape changed the page";
      return null;
    },
  },
  {
    name: "back: a page with nothing to do but return",
    url: fx("back-1.html"),
    goal: "Open Step 2, then return to the previous page and stop.",
    check: (r) => {
      if (r.status !== "done") return `status ${r.status}`;
      if (!r.url.endsWith("back-1.html")) return `final url ${r.url}`;
      if (!r.steps.some((s) => s.kind === "back")) return "GO_BACK was never chosen";
      return null;
    },
  },
  {
    name: "dead end: a verification wall with no operable control",
    url: fx("gate.html"),
    goal: "Search for Lisbon and open the Casa Flora hotel.",
    check: (r) => {
      if (r.status === "done") return "reported success on a page with no way forward";
      if (r.status !== "blocked") return `status ${r.status}, expected blocked`;
      if (!r.reason) return "no reason given for stopping";
      if (!r.blocking_page?.controls) return "no blocking page returned to the caller";
      if (!r.escapes.length) return "gave up without trying a generic recovery";
      return null;
    },
  },
];

let failures = 0;
for (const c of cases) {
  const result = await runGoal({ url: c.url, goal: c.goal, log: (line) => console.log(`   ${line}`) });
  const problem = c.check(result);
  console.log(`${problem ? "FAIL" : "ok  "} ${c.name}  [${result.status}, ${result.elapsed_ms} ms` +
    `, ${result.steps.length} steps, ${result.escapes.length} escapes]`);
  if (problem) { console.log(`       -> ${problem}`); failures++; }
}

console.log(failures ? `\nFAIL (${failures}/${cases.length})` : `\nPASS (${cases.length}/${cases.length})`);
process.exit(failures ? 1 : 0);
