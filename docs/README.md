**English** · [Italiano](it/README.md)

# Scriba documentation

Scriba is a rich-text (WYSIWYG) editor for the web: TinyMCE's features plus a structured document
that is secure by construction, real-time collaboration, Markdown shortcuts, "/" commands,
comments, mentions and an AI assistant with no mandatory provider.

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
<script src="/js/editor.js"></script>
<!-- /js/editor.js: Scriba.createEditor('#editor', { onChange: (html) => save(html) }) -->
```

`/js/editor.js` is your own file (not part of Scriba), kept separate from the page so that it
works with a strict CSP: see [Getting started](getting-started.md#any-page-cdn-script).

**Vue 3:** `<ScribaEditor v-model="html" />` · **React:** `<ScribaEditor value={html} onChange={setHtml} />`

Then, on the server, **always pass the HTML** through `sanitizeHTML` from
`@scriba-editor/sanitize-server` before saving or displaying it: see [Security](security.md).

## Guides

| Guide                                 | Contents                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| [Getting started](getting-started.md) | Installation in different environments, theme, language, HTML or JSON content.       |
| [Concepts](concepts.md)               | Schema, document, transactions, commands, plugins: how it works, in plain words.     |
| [Plugins](plugins.md)                 | All the plugins, what they are for and how they connect to the toolbar and keyboard. |
| [Security](security.md)               | What the editor protects, what is up to your server, CSP, uploads, links.            |
| [Collaboration](collaboration.md)     | Several people on the same document: client and server.                              |
| [Accessibility](accessibility.md)     | Keyboard, screen readers, shortcuts.                                                 |
| [Performance](performance.md)         | Large documents, benchmarks and package size.                                        |

Guides for individual packages:

- [AI assistant](../packages/plugins/ai/README.md) — configuration, backend, generated blocks,
  several versions to choose from.
- [React](../packages/react/README.md) — `<ScribaEditor>` and `useScriba()`.
- [CDN script](../packages/browser/README.md) — `Scriba.createEditor` without a build.

For Scriba developers: [CHANGELOG](../CHANGELOG.md), [releases](../RELEASING.md),
[reporting a vulnerability](../SECURITY.md). The playground is the demo: `pnpm dev`.
