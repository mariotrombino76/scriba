**English** · [Italiano](README.it.md)

# Scriba

A rich-text (WYSIWYG) editor for the web, written in TypeScript. It has the features of TinyMCE,
plus a structured document that is secure by construction.

> **Status:** version `0.x`. The `@scriba-editor/*` packages are on npm, published
> with provenance. While the version is `0.x` the API may change between minor versions: see the
> [CHANGELOG](CHANGELOG.md).

## Why Scriba

- **A document with a schema, not free-form HTML.** Anything the schema does not know is
  discarded: the output is always valid, predictable and free of scripts.
- **Security for integrators.** An inert parser, URLs allowed only from a list (whitelist), and it
  works with a strict CSP and with Trusted Types. The `@scriba-editor/sanitize-server` package
  applies the same schema again on the server.
- **Real-time collaboration included** (Yjs), with other users' cursors, comments, suggestions
  (track changes) and per-block permissions.
- **All of TinyMCE's features:**
  - tables (cell merging, sorting, resizing);
  - images with cropping and rotation;
  - paste from Word and Google Docs;
  - find and replace with regex;
  - source view and fullscreen;
  - formulas (KaTeX) and footnotes;
  - table of contents, templates and merge fields;
  - format painter and accessibility checker;
  - version history, import and export (HTML, Markdown, Word).
- **Beyond TinyMCE:**
  - Markdown shortcuts as you type;
  - `/` commands and a bubble menu on the selection;
  - `@` mentions;
  - an AI assistant that does not lock you into a provider (generated text is undone like any
    other change).
- **Accessible:** targets WCAG 2.2 AA, checked automatically with axe-core. Every feature can
  also be used from the keyboard.
- **Light and modular:** the core weighs about 25 KB gzip, with no dependencies, and every plugin
  is a separate package.
- **Wherever you want:** any page (script from a CDN), Vue 3, React 18/19, or the packages
  wired up by hand. UI in Italian, English, French, German and Spanish, with a light and dark
  theme.

## In two minutes

**Any page** (no framework, no build):

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/@scriba-editor/browser@0.1.1/dist/scriba.css"
  integrity="sha384-bCFNutcDIpxCiQSC0BSWyqdqJn83GqK1gCHnWU2On4iJI3DFadguiLg7XWQt8Tka"
  crossorigin="anonymous"
/>
<script
  src="https://cdn.jsdelivr.net/npm/@scriba-editor/browser@0.1.1/dist/scriba.iife.js"
  integrity="sha384-sT+cCdJ0Ks8h+R2Lldj9ZjIc4bSobhUeVXZ2FE5tFiEaWAe/W8FVWh2YXcktaDid"
  crossorigin="anonymous"
></script>
<div id="editor"></div>
<script>
  Scriba.createEditor('#editor', { content: '<p>Hello</p>', onChange: (html) => save(html) })
</script>
```

> The last `<script>` is your code. On a site with a strict CSP (`script-src 'self'`), inline
> scripts are blocked: move it into a `.js` file of your own, for example
> `<script src="/js/editor.js"></script>`. See [Getting started](docs/getting-started.md#any-page-cdn-script).

**Vue 3:**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ScribaEditor } from '@scriba-editor/vue'
import '@scriba-editor/themes/scriba.css'

const html = ref('<p>Hello</p>')
</script>

<template>
  <ScribaEditor v-model="html" />
</template>
```

**React:**

```tsx
import { useState } from 'react'
import { ScribaEditor } from '@scriba-editor/react'
import '@scriba-editor/themes/scriba.css'

export function Note() {
  const [html, setHtml] = useState('<p>Hello</p>')
  return <ScribaEditor value={html} onChange={(v) => setHtml(v as string)} />
}
```

> **Important:** on the server, **always** pass the HTML you receive through `sanitizeHTML` from
> `@scriba-editor/sanitize-server` before saving or displaying it. Anyone can send HTML to your API
> without going through the editor. See [Security](docs/security.md).

## Packages

| Package                                                                | What it does                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`@scriba-editor/core`](packages/core/README.md)                       | Schema, document, transactions, commands, undo/redo. No DOM.           |
| [`@scriba-editor/view`](packages/view/README.md)                       | The view in the browser: controlled `contentEditable`, IME, selection. |
| [`@scriba-editor/ui`](packages/ui/README.md)                           | Toolbar, menus, dialogs (Web Components).                              |
| [`@scriba-editor/i18n`](packages/i18n)                                 | UI strings: it, en, fr, de, es.                                        |
| [`@scriba-editor/themes`](packages/themes/README.md)                   | Light and dark CSS theme, with customizable variables.                 |
| [`@scriba-editor/vue`](packages/vue/README.md)                         | `<ScribaEditor v-model>` and `useScriba()` for Vue 3.                  |
| [`@scriba-editor/react`](packages/react/README.md)                     | `<ScribaEditor value onChange>` and `useScriba()` for React 18/19.     |
| [`@scriba-editor/browser`](packages/browser/README.md)                 | Everything in one file for any page: `Scriba.createEditor()`.          |
| [`@scriba-editor/sanitize-server`](packages/sanitize-server/README.md) | Server-side sanitization (Node) with the same schema.                  |
| [`@scriba-editor/collab-server`](packages/collab-server/README.md)     | WebSocket server for collaboration: access, permissions, limits.       |
| [`@scriba-editor/plugin-*`](packages/plugins)                          | One package per feature: tables, images, links, AI, comments, etc.     |

## Documentation

The documentation is in the [`docs/`](docs/README.md) folder: [Getting started](docs/getting-started.md),
[Concepts](docs/concepts.md), [Plugins](docs/plugins.md), [Security](docs/security.md),
[Collaboration](docs/collaboration.md), [Accessibility](docs/accessibility.md),
[Performance](docs/performance.md). Every package has its own README with examples.

## Development

Requirements: Node 22 or later and pnpm (via `corepack`).

```bash
pnpm install
pnpm dev            # playground with every feature
pnpm build
pnpm lint && pnpm test && pnpm test:security
pnpm test:e2e       # Playwright: Chromium, Firefox, WebKit
```

Changes are described in the [CHANGELOG](CHANGELOG.md). To report a vulnerability privately,
follow [SECURITY.md](SECURITY.md).

## License

Scriba is released under the [Apache 2.0 license](LICENSE). Copyright 2026 **Mario Trombino**.

You can use, modify and distribute it, including in commercial products. The license asks two
things of anyone who distributes Scriba or a derivative work:

- include the [LICENSE](LICENSE) file;
- include the [NOTICE](NOTICE) file with the attribution to Mario Trombino.

The files distributed via CDN carry the same attribution at the top.
