// Smoke test for the jev-web engine: drives the bundled offline fixture and asserts the
// expected controls were actually applied. Run: bun ~/.omp/agent/jev/smoke.mjs
//
// Needs TYPESAFE_API_KEY and a text-model key (DEEPSEEK_API_KEY by default). No network beyond those.

import { runGoal } from "./engine.mjs";

const fixture = new URL("fixture.html", import.meta.url).href;
const goal = "Search for Lisbon, set sort to Design, enable Free cancellation, and open the Casa Flora hotel.";

const result = await runGoal({ url: fixture, goal, log: (line) => console.log(line) });
console.log("\n=== result ===");
console.log(JSON.stringify({
  status: result.status,
  elapsed_ms: result.elapsed_ms,
  url: result.url,
  steps: result.steps.map((s) => ({ step: s.step, op: s.operation, action: s.action, text: s.text, p: s.probability, changed: s.page_changed })),
}, null, 2));

const failures = [];
if (result.status !== "done") failures.push(`status was ${result.status}, expected done`);
if (!result.url.includes("#casa-flora")) failures.push(`final url was ${result.url}, expected the Casa Flora anchor`);
if (!result.text.includes("MATCH")) failures.push("fixture reported NO MATCH: not every control was applied");
if (result.steps.some((s) => s.page_changed === false)) failures.push("a step produced no page change");

if (failures.length) {
  console.error("\nFAIL\n" + failures.map((f) => `- ${f}`).join("\n"));
  process.exit(1);
}
console.log("\nPASS");
