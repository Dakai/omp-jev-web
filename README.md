# omp-jev-web

An **oh-my-pi (OMP)** plugin that gives the agent one tool — `jev_web` — which takes a URL and a
natural-language goal and drives the page to that goal on its own.

Each decision is made by [TypeSafe Jev](https://docs.typesafe.ai/introduction) (a System One
model), not by the main coding model. Jev answers a *typed* question — pick one operation, and one
target for it — in a single request. Text is only generated (by a small OpenAI-compatible model)
when the chosen operation is `TYPE_TEXT`.

The approach, the DOM reader, the speculative target heads, and the policy prompts are ported from
**[browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast)** — see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

```
$ omp -p "Use jev_web with url https://en.wikipedia.org/wiki/Main_Page and goal:
          Find and open the Wikipedia article about the incompleteness theorems."

status: done  (6,431 ms)
final url: https://en.wikipedia.org/wiki/G%C3%B6del%27s_incompleteness_theorems
1. TYPE_TEXT "incompleteness theorems" → Search Wikipedia  p=1.00 changed=true
2. CLICK → Search                                          p=0.89 changed=true
3. WAIT → Wait for the page to update                      p=0.46 changed=true
```

## Install

```bash
omp plugin install github:Dakai/omp-jev-web
```

Then restart OMP (extension modules load at session start; `/reload-plugins` does not rebuild them).

Requirements:

- OMP 18.2.6 or newer (the plugin API it uses is stable from here).
- A Chromium binary: `/usr/bin/chromium`, `chromium-browser`, `google-chrome`,
  `google-chrome-stable`, or `brave`. Override with `JEV_CHROME=/path/to/chrome`.
  No npm dependencies, no `puppeteer`, no `browser-harness` — it speaks CDP directly.
- `TYPESAFE_API_KEY` — get one at <https://typesafe.ai>.
- A text-model key for `TYPE_TEXT`, defaulting to `DEEPSEEK_API_KEY`. Override with
  `TEXT_MODEL_API_KEY`, `TEXT_MODEL_BASE_URL`, `TEXT_MODEL` (any OpenAI-compatible
  `/chat/completions` endpoint).

## Why a second browser tool

OMP already has a `browser` tool. This is not a replacement — it is the right tool when the *task*
is small and self-contained but the *page* is wide, i.e. when letting the main model pick a target
out of a hundred similar controls costs more than the task is worth.

| | `browser` (built in) | `jev_web` (this plugin) |
| --- | --- | --- |
| Driven by | the main model, step by step | Jev, one typed request per step |
| Sees | your managed tabs, and via relay your real Chrome | its own headless Chromium, own temp profile |
| Login state | yes | no |
| Iframes, shadow DOM, canvas, uploads, new tabs, keyboard widgets | yes | **no** |
| Cost per step | your main model's context | ~5k Jev input tokens (output free) + text calls |

Rule of thumb: `jev_web` for "search this site for X, set these filters, open the result";
`browser` for anything needing a session, multiple tabs, or elements this DOM reader cannot see.

## What it actually does per step

1. One CDP round trip reads the DOM: visible controls, their names and values, plus nearby text.
2. The observed elements become an **indexed action space** — `[1] combobox Where from?`, etc. —
   and each supported operation gets its own target head.
3. **One** `POST /v1/systemone` returns the operation and the target for it, together with
   calibrated probabilities. Target questions are speculative: if the operation is `CLICK`, only
   `click_target` is read.
4. The chosen target is resolved from the observed DOM node, re-checked for freshness and
   occlusion (`elementFromPoint`) immediately before input, then executed over CDP.

Model output never becomes a selector, a coordinate, or JavaScript. `DONE` is Jev's judgement, not
proof — verify when correctness matters.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | — | required; Jev / System One |
| `TYPESAFE_MODEL` | `jev-latest` | model id sent to `/v1/systemone` |
| `TEXT_MODEL_API_KEY` | falls back to `DEEPSEEK_API_KEY` | text generation for `TYPE_TEXT` |
| `TEXT_MODEL_BASE_URL` | `https://api.deepseek.com/v1` | OpenAI-compatible endpoint |
| `TEXT_MODEL` | `deepseek-chat` | model for `TYPE_TEXT` |
| `JEV_CHROME` | auto-detected | Chromium binary |

Tool arguments: `url` (required), `goal` (required), `max_steps` (default 30, capped at 60).

## Differences from upstream

Two, both about failing in a bounded way rather than looping:

- **Occluded controls are not offered.** The reference snapshot lists every visible control and
  checks occlusion only when executing, so a policy facing a consent overlay can pick a covered
  target over and over. Here a control that fails a hit test is left out of the action space, so
  the model is never asked for something the executor will refuse.
- **A refused decision counts as a step.** It cost a model call, it is reported to the next
  decision as `refused` with a reason, and it consumes the step budget. An unbounded
  refuse-and-re-observe loop is not possible.

Measured effect on a page whose form sits under a full-page consent overlay:
**47.6 s / 27 wasted cycles before, 5.9 s / 0 after** — same goal, same fixture.

## Limits

Ported as-is from upstream, so it inherits upstream's ceiling:

- One page, one tab. No iframes, shadow DOM, canvas, file uploads, pop-up tabs, nested scrolling,
  or arbitrary keyboard widgets.
- Its Chromium starts fresh per call: no cookies, no logged-in sessions, no profile reuse.
- A step that changes nothing three times in a row stops the run as `BLOCKED`.
- An action that would have to happen on an element that moved, got covered, or got disabled is
  refused rather than forced.

## Development

```bash
git clone https://github.com/Dakai/omp-jev-web
cd omp-jev-web

bun jev/smoke.mjs          # drives jev/fixture.html offline and asserts the outcome
omp plugin link .          # use the working copy instead of the GitHub install
```

The fixture asserts the *real* outcome, not that something moved: `fixture.html` only prints
`MATCH` when the destination is Lisbon, the sort is Design, *and* free cancellation is checked.

## Credit

- **[browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast)** (MIT, © Browser Use)
  — the agent loop, the DOM snapshot, the action space, and the policy prompts this plugin ports.
- **[TypeSafe](https://typesafe.ai)** — Jev / System One, the model that makes the decisions.

## License

MIT — see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
