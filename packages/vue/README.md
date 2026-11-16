**English** · [Italiano](README.it.md)

# @scriba-editor/vue

The Scriba editor as a Vue 3 component (`<ScribaEditor v-model>`) and a `useScriba()` composable.

```bash
pnpm add @scriba-editor/vue @scriba-editor/themes
```

Requires `vue` 3.5 or later.

## Usage

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

The content (`v-model`, `setContent`) is **untrusted input**: it always goes through the schema
parser in an inert document. The saved HTML must still be run through
`@scriba-editor/sanitize-server` on the server before you save or display it (see
[Security](../../docs/security.md)).

## Props

| Prop         | Default            | Meaning                                                                                        |
| ------------ | ------------------ | ---------------------------------------------------------------------------------------------- |
| `modelValue` | `null`             | The content (HTML or JSON), for `v-model`. A value changed from outside replaces the document. |
| `format`     | `'html'`           | `'html'` or `'json'`.                                                                          |
| `schema`     | `basicSchema`      | The schema (read at creation).                                                                 |
| `plugins`    | —                  | Additional plugins (read at creation).                                                         |
| `editable`   | `true`             | `false`: read-only (can be changed at any time).                                               |
| `label`      | "Rich text editor" | Accessible name of the writing area (translated according to `locale`).                        |
| `locale`     | `'it'`             | Language (`'it'`, `'en'`) or a messages object (`fr`, `de`, `es` from `@scriba-editor/i18n`).  |
| `toolbar`    | `true`             | Shows the default toolbar.                                                                     |
| `inline`     | `false`            | Inline mode: page styles, floating toolbar only while typing (read at mount).                  |
| `nodeViews`  | —                  | Custom views of atomic nodes (read at creation).                                               |

Event: `update:modelValue`, emitted on every user change with the content in the chosen format
(HTML string or JSON object). The component exposes `getContent()`, `setContent(content)`,
`focus()`, `view` and `state` (use a `ref` to the component). For a toolbar pinned to the top of
the window, add the `scriba-sticky` class (see [@scriba-editor/themes](../themes/README.md)).

The schema, plugins and format are read when the editor is created (at mount); `editable`,
`label` and `locale` follow the props.

```vue
<ScribaEditor v-model="doc" format="json" locale="en" :editable="!locked" inline />
```

## `useScriba()` composable

For a fully custom UI:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useScriba } from '@scriba-editor/vue'

const place = ref<HTMLElement | null>(null)
const scriba = useScriba(place, {
  content: '<p>Hello</p>',
  onChange: (content) => console.log(content),
})
</script>

<template>
  <div ref="place" />
</template>
```

`useScriba(target, options)` creates the editor at mount and destroys it at unmount. Options
(`UseScribaOptions`): `schema`, `content`, `format`, `plugins`, `defaultPlugins` (`false` to
replace the default history and shortcuts), `editable`, `label` (also a ref or getter),
`onChange`, `nodeViews`. Returns `view` and `state` (shallow refs), `getContent()`,
`setContent(content)` (not undoable) and `focus()`. `defaultScribaPlugins(schema)` lists the
default plugins.

## Nuxt

The editor needs the browser DOM: put it inside `<ClientOnly>` (or in a `.client.vue`
component).

## Vue components as document nodes

`vueNodeView(Component, { t, appContext, as })` renders a node with a Vue component; you pass it
in `nodeViews`. The component receives `node`, `attrs`, `selected`, `editable`, `updateAttrs`,
`leave` and `t` (type `NodeViewProps`); for nodes with content, use `<NodeViewContent />`. The
document stays the source of truth and the output HTML always comes from the node's `toHTML`,
never from the component's DOM. Ready-made examples: `TaskView` and `CalloutView`.

```ts
import { vueNodeView, TaskView } from '@scriba-editor/vue'
const nodeViews = { task: vueNodeView(TaskView, { t }) }
```

Other exports: `parseContent`, `serializeContent`, the types `Content` and `ContentFormat`.

More: [Getting started](../../docs/getting-started.md), [Accessibility](../../docs/accessibility.md),
[Plugins](../../docs/plugins.md).
