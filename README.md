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

The upstream loop has one failure mode that matters on real pages: Jev has no reasoning and no
recovery, so on anything but a straight line it re-picks the same dead end. These four changes are
all about failing in a bounded, recoverable way instead.

- **Occluded controls are not offered.** The reference snapshot lists every visible control and
  checks occlusion only when executing, so a policy facing a consent overlay can pick a covered
  target over and over. Here a control that fails a hit test is left out of the action space, so
  the model is never asked for something the executor will refuse.
- **`GO_BACK` is a first-class action.** The reference action space is
  `CLICK / TYPE_TEXT / SELECT / SCROLL_UP / SCROLL_DOWN / WAIT / DONE / BLOCKED` — there is no way
  to undo a decision. Here, whenever there is a real previous page, `GO_BACK` is offered and the
  policy can choose it like any other operation.
- **A refused decision counts as a step.** It cost a model call, it is reported to the next
  decision as `refused` with a reason, and it consumes the step budget. An unbounded
  refuse-and-re-observe loop is not possible.
- **A generic escape ladder runs when the run stops making progress**, or when the policy answers
  `BLOCKED`: press `Escape`, then go back one page. Each rung is used at most once per run, and
  only a rung that actually changed the page resets the stall counter. It is deliberately
  page-agnostic — it does not know what the lightbox is, only that something is in the way.

Measured on a page whose form sits under a full-page consent overlay, same goal, same fixture:

| | upstream behaviour | here |
| --- | --- | --- |
| consent overlay over the form | 47.6 s, 27 wasted cycles, escaped by luck | **5.9 s, 0 refusals** |

## How it fails

`runGoal` returns a terminal `status` and a `reason`, never a hang:

| status | meaning |
| --- | --- |
| `done` | the policy saw the goal satisfied — **its judgement, not proof** |
| `blocked` | no rung of the escape ladder changed the page either |
| `budget` | hit the step limit |

On any non-`done` status the result carries a `blocking_page` digest (the URL, the controls that
were on offer, and the visible text) plus every refusal and escape, and the tool formats it as a
"here is what the page looked like, here is what to try next" report. That is the whole point of
wrapping a zero-reasoning policy in a tool: the reasoning layer above it gets to make the call.

## Limits

Ported as-is from upstream, so it inherits upstream's ceiling:

- One page, one tab. No iframes, shadow DOM, canvas, file uploads, pop-up tabs, nested scrolling,
  or arbitrary keyboard widgets.
- Its Chromium starts fresh per call: no cookies, no logged-in sessions, no profile reuse.
- A real CAPTCHA, an interstitial on another origin, or a flow needing a login is not solvable —
  the run stops as `blocked` and hands the page back.
- An action aimed at an element that moved, got covered, or got disabled is refused rather than
  forced.
- Two cycles without the page changing trigger the escape ladder; once it is spent, the run stops.

## Development

```bash
git clone https://github.com/Dakai/omp-jev-web
cd omp-jev-web

bun jev/smoke.mjs          # 5 offline fixtures, ~30s, no network beyond the two APIs
omp plugin link .          # use the working copy instead of the GitHub install
```

`smoke.mjs` asserts the *real* outcome of each fixture, not that something moved:

| fixture | asserts |
| --- | --- |
| `linear.html` | the form is filled, submitted, and the right result opened, with no refusals |
| `consent.html` | a full-page overlay is dismissed first and the covered form is never offered |
| `escape-key.html` | a lightbox with no controls is cleared by the escape ladder |
| `back-1.html` | `GO_BACK` is chosen and the run returns to the previous page |
| `gate.html` | a verification wall ends as `blocked` with a reason and a blocking-page digest |

## Credit

- **[browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast)** (MIT, © Browser Use)
  — the agent loop, the DOM snapshot, the action space, and the policy prompts this plugin ports.
- **[TypeSafe](https://typesafe.ai)** — Jev / System One, the model that makes the decisions.

## License

MIT — see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
