**English** · [Italiano](it/iniziare.md)

# Getting started

Scriba works in any web page. Pick the approach that matches your project.

| Your project                                        | Use                                                     | Guide                                    |
| --------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------- |
| HTML page, PHP, .NET, Java, Django… without a build | `@scriba-editor/browser` (script from a CDN)            | [below](#any-page-cdn-script)            |
| Vue 3 or Nuxt                                       | `@scriba-editor/vue`                                    | [below](#vue-3-and-nuxt)                 |
| React 18 or 19                                      | `@scriba-editor/react`                                  | [below](#react)                          |
| Bundler (Vite, webpack…) and full control           | `@scriba-editor/core` + `@scriba-editor/view` + plugins | [below](#custom-setup-with-the-packages) |

In every case, include the theme (`@scriba-editor/themes/scriba.css`, or `scriba.css` from the browser package).

## Any page (CDN script)

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

<form method="post" action="/save">
  <div id="editor"></div>
  <input type="hidden" name="text" id="text" />
  <button>Save</button>
</form>
<script src="/js/editor.js"></script>
```

```js
// /js/editor.js
const field = document.getElementById('text')
const editor = Scriba.createEditor('#editor', {
  content: field.value,
  onChange: (html) => (field.value = html),
})
```

`/js/editor.js` is not part of Scriba: it is **your own file**, which you create on your site and
serve like any other JavaScript (name and path are up to you). `scriba.iife.js` creates the global
`Scriba` object; your file uses it to mount the editor. It lives in a separate file, and not in a
`<script>` written into the page, because a strict CSP (`script-src 'self'`, without
`unsafe-inline`) blocks inline scripts.

Options, limits and security: [@scriba-editor/browser README](../packages/browser/README.md).

### Inline mode

With `inline: true` (also `inline` in the Vue and React components) the editor becomes part of
the page, like TinyMCE's inline mode: the text takes the page's fonts, colors and sizes, with no
frame; the toolbar appears only while you are writing, above the text (below it if there is no
room above; pinned to the top of the window if the text is taller than the screen). From the
keyboard: Tab enters the text and shows the toolbar, **Alt+F10** moves to the toolbar, Esc goes
back to the text.

```js
Scriba.createEditor('#article', { inline: true, content: article.innerHTML })
```

For your own UI: `inlineToolbar(container, toolbar)` from `@scriba-editor/ui`.

### Sticky toolbar

With `stickyToolbar: true` the toolbar stays visible at the top of the window while a long text
scrolls (like TinyMCE's `toolbar_sticky`), which is especially handy on phones. In the Vue and
React components, the `scriba-sticky` class (`class` or `className`) is enough. If the page has a
fixed header, `:root { --scriba-sticky-offset: 56px }` moves the toolbar below it. The browser
brings the cursor into view below the toolbar, not underneath it (WCAG 2.4.11).

### Phones and tablets

The editor also works with a finger: buttons and menu items are 44px tall with touch input, a
toolbar that does not fit on the screen moves the rest into "More", tapping outside a menu closes
it, and the handles of images, cropping and table columns can be dragged with a finger. A long
press on text leaves the system menu (select, copy, paste); on an image it opens the editor's
menu. The page must have `<meta name="viewport" content="width=device-width,
initial-scale=1">`.

## Vue 3 and Nuxt

```bash
pnpm add @scriba-editor/vue @scriba-editor/themes
```

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

Props: `format` (`'html'`/`'json'`), `schema`, `plugins`, `editable`, `label`, `locale`,
`toolbar`, `inline`, `nodeViews`. The component exposes `getContent`, `setContent`, `focus`, `view`, `state`.
For your own UI: `useScriba(element, options)`.

**Nuxt:** the editor needs the browser DOM. Put it inside `<ClientOnly>` (or in a `.client.vue`
component): it is not rendered during server-side rendering.

Vue components as document nodes (e.g. a task with a checkbox and a due date):
`vueNodeView(Component, { t })` in the `nodeViews` option; examples in `@scriba-editor/vue`
(`TaskView`, `CalloutView`).

## React

```bash
pnpm add @scriba-editor/react @scriba-editor/themes
```

```tsx
import { useState } from 'react'
import { ScribaEditor } from '@scriba-editor/react'
import '@scriba-editor/themes/scriba.css'

export function Note() {
  const [html, setHtml] = useState('<p>Hello</p>')
  return <ScribaEditor value={html} onChange={(v) => setHtml(v as string)} />
}
```

Details: [@scriba-editor/react README](../packages/react/README.md).

## Custom setup with the packages

To choose exactly the schema, plugins and UI:

```ts
import {
  EditorState,
  Schema,
  basicSchemaSpec,
  history,
  keymap,
  historyKeymap,
  formatKeymap,
  baseKeymap,
} from '@scriba-editor/core'
import { EditorView, parseContent, serializeContent } from '@scriba-editor/view'
import { createTranslator } from '@scriba-editor/i18n'
import { defineScribaToolbar, defaultToolbarItems } from '@scriba-editor/ui'
import { listNodes, listKeymap, listToolbarItems } from '@scriba-editor/plugin-list'
import '@scriba-editor/themes/scriba.css'

const t = createTranslator('it')
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...listNodes },
  marks: basicSchemaSpec.marks,
})
const state = EditorState.create({
  doc: parseContent(schema, '<p>Hello</p>', 'html'),
  plugins: [
    history(),
    keymap(listKeymap(schema), { priority: 50 }),
    keymap(historyKeymap),
    keymap(formatKeymap(schema)),
    keymap(baseKeymap),
  ],
})
const view = new EditorView(document.querySelector('#editor')!, { state, label: t('editor.label') })

defineScribaToolbar()
const toolbar = document.createElement('scriba-toolbar')
document.querySelector('#editor')!.before(toolbar)
toolbar.translator = t
toolbar.items = [...defaultToolbarItems(schema), ...listToolbarItems(schema)]
toolbar.view = view

// the content, when you need to save it
const html = serializeContent(view.state.doc, 'html')
```

Each plugin brings its own nodes or marks (to add to the schema), its own plugins and shortcuts
(to add to the state) and its own toolbar items: see [Plugins](plugins.md). The full demo, with
every plugin, is in `demo/main.ts` (`pnpm dev`).

## Content: HTML or JSON

- **HTML** (default): convenient to save and display. On the way in, it always goes through the
  schema parser.
- **JSON** (`format: 'json'`): the exact structure of the document, validated by the schema when
  it comes back in. Useful for saving in a document database or comparing versions.

In both cases, **on the server**, pass whatever comes from the client through
`@scriba-editor/sanitize-server` (HTML) or `schema.nodeFromJSON` (JSON) before saving it: see
[Security](security.md).

## Language

The UI is available in Italian, English, French, German and Spanish. Italian and English are
chosen by name: `locale: 'en'` (components) or `createTranslator('en')`. French, German and
Spanish are imported, so the languages you do not use stay out of your bundle:

```ts
import { createTranslator, fr } from '@scriba-editor/i18n'
const t = createTranslator(fr) // in the components: locale: fr
```

With the browser script (`Scriba.createEditor`) the names are enough: `locale: 'fr'`, `'de'`,
`'es'`. To change individual strings: `createTranslator('it', { 'editor.label': 'Note text'
})`. For another language, pass an object with all the messages (the keys are those of
`@scriba-editor/i18n`).

## Theme

`scriba.css` uses CSS variables (`--scriba-bg`, `--scriba-text`, `--scriba-accent`…) and follows
the system's light/dark theme. To match it to your site, redefine the variables:

```css
:root {
  --scriba-accent: #0b6b3a;
  --scriba-radius: 4px;
}
```

The theme does not require `style-src 'unsafe-inline'`: it works with a strict CSP.
