**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-paste-clean

Clean paste from Word, Google Docs and web pages, like TinyMCE's "Paste from Word / PowerPoint" plugin (`paste`/`powerpaste`): real lists instead of Word's fake ones, no Office/Docs wrappers, no default fonts and black.

```bash
pnpm add @scriba-editor/plugin-paste-clean
```

## Usage

```ts
import { pasteClean } from '@scriba-editor/plugin-paste-clean'

const plugins = [
  pasteClean(), // or pasteClean({ keepFonts: true, keepColors: false })
  // ...
]
```

The plugin acts on the DOM of the pasted HTML **before** the schema parser (the view's `transformPastedDOM`).

## What it cleans

| Source      | Changes                                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Word        | rebuilds real nested lists from `mso-list` paragraphs; removes namespaced tags (`o:p`, `v:shape`, ...) and the fake numbers/bullets; `MsoTitle` becomes `h1`, `MsoSubtitle` becomes `h2` |
| Google Docs | removes the `docs-internal-guid` wrapper and the top-level `<br>` elements                                                                                                               |
| All         | sub-lists left inside `<ul>`/`<ol>` are moved into the previous item; paragraphs with only spaces/`&nbsp;` are emptied                                                                   |
| Styles      | removes `font-family` and `font-size`; removes black or near-black color (`windowtext`, `black`, `#000`, ...) and transparent backgrounds                                                |

The source is detected by `detectSource(body)` (`'word' | 'google-docs' | 'other'`).

## Exports

| Name                             | What it does                                                                |
| -------------------------------- | --------------------------------------------------------------------------- |
| `pasteClean(options?)`           | Plugin to add to the editor                                                 |
| `cleanPastedDOM(body, options?)` | Cleans a `body` in place and returns the source (useful outside the editor) |
| `detectSource(body)`             | Recognizes Word, Google Docs or other                                       |
| `PasteCleanOptions`              | `keepFonts` (default `false`), `keepColors` (default `true`)                |
| `PasteSource`                    | `'word' \| 'google-docs' \| 'other'`                                        |

## Security

This plugin improves **fidelity**, not security. It runs on an **inert** document (nothing is executed) and whatever it lets through still goes through the schema parser, which discards everything it does not know (scripts, `on*` handlers, disallowed URLs, free styles). Pasted HTML is untrusted input: if you save HTML, you must always run it through `@scriba-editor/sanitize-server` on the server. See [security](../../../docs/security.md) and [plugins](../../../docs/plugins.md).
