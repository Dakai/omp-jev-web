# Third-party notices

This plugin ports code from **jev-ultrafast** by Browser Use
(<https://github.com/browser-use/jev-ultrafast>), which is distributed under the
MIT License. The files below are derived from it:

| File here | Origin upstream |
| --- | --- |
| `jev/snapshot.js` | `jev_ultrafast/snapshot.js` — copied, with one addition: controls that fail a hit test are not offered (upstream checks occlusion at execution time only) |
| `jev/engine.mjs` | `jev_ultrafast/agent.py`, `browser.py`, `model.py`, `questions.py` — the action space, the speculative target heads, the response validator, the execution guard, and the policy prompts are ports of these |

Upstream license:

```
MIT License

Copyright (c) 2026 Browser Use

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Notices for **TypeSafe** (the hosted Jev / System One API this plugin calls) are
governed by their own terms: <https://docs.typesafe.ai/legal>.
