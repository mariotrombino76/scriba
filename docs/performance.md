**English** · [Italiano](it/prestazioni.md)

# Performance

Goal (CLAUDE.md §7): a document with **1 MB of text** stays smooth, with less than **16 ms** per
keystroke, that is one keystroke per frame.

## Current numbers

One keystroke in a document with 1 MB of text (about 5700 blocks), median, view and plugins
included:

| Browser  | Per keystroke |
| -------- | ------------- |
| Chromium | ~10 ms        |
| Firefox  | ~11 ms        |
| WebKit   | ~12 ms        |

Core only (model and transaction) on 1 MB, at the 75th percentile: typing ~1.4 ms, Enter
~1.3 ms, bold ~1.9 ms, typing and undoing ~3 ms; serializing to HTML ~7 ms, loading 1 MB of
HTML ~0.5 s.

Size (minified and gzipped): core **25 KB**, core + view **36 KB**, UI **24 KB**; CDN script
with all features ~84 KB and CSS ~6 KB.

## Measuring them

```bash
pnpm bench       # core benchmarks (Vitest), with thresholds
pnpm test:perf   # one keystroke on 1 MB in the three browsers (Playwright), 16 ms threshold
pnpm size        # minified and gzipped size; the core must stay under 60 KB
```

Timings depend on the machine: run `bench` and `test:perf` on an idle machine and compare with
the previous result. A change that makes things more than 10% worse must be justified.

## How they stay fast

- The document is immutable and shares the unchanged parts: a change only touches the affected
  branch.
- The view updates only the changed blocks (it immediately skips the identical ones at the start
  and at the end) and does not rewrite attributes that do not change.
- The buttons' "can this be done?" checks avoid walking the whole document.
- Heavy operations (word count, regex search) are deferred or run in a Web Worker.

## Tips for integrators

- `onChange` fires on every change: if you save over the network, batch the saves (e.g. one save
  per second or when leaving the field); do not serialize a huge document on every keystroke.
- Include only the plugins you use: the packages are separate and side-effect free.
- For very large documents prefer the JSON format when possible (faster to load than HTML, which
  has to be parsed).
