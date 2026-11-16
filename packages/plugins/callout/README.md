**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-callout

**Callouts** for the Scriba editor: a box around one or more blocks, with a type (`info`, `tip`,
`warning`, `danger`) to flag notes, tips, warnings and dangers.

## Installation

```bash
pnpm add @scriba-editor/plugin-callout
```

## Usage

```ts
import { Schema, basicSchemaSpec } from '@scriba-editor/core'
import { calloutNodes, calloutSlashItem, calloutToolbarItem } from '@scriba-editor/plugin-callout'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...calloutNodes },
  marks: basicSchemaSpec.marks,
})

// slash menu and button (Insert menu)
const slashItems = [calloutSlashItem(schema)]
const item = calloutToolbarItem(schema)
```

In the editor and in the saved HTML the callout is an `<aside class="scriba-callout" data-callout="…">`,
styled by the theme. With Vue you can give it a view with a type picker: the example component
`CalloutView` from `@scriba-editor/vue`.

```ts
import { CalloutView, vueNodeView } from '@scriba-editor/vue'

const view = new EditorView(el, {
  state,
  nodeViews: { callout: vueNodeView(CalloutView, { t }) },
})
```

## Exports

| Export                         | Description                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `calloutNodes`                 | `callout` node (group `block`, content `block+`) with the `kind` attribute (default `info`).    |
| `CALLOUT_KINDS`                | The allowed types: `info`, `tip`, `warning`, `danger`.                                          |
| `CalloutKind`                  | TypeScript type of the four values.                                                             |
| `isCalloutKind(value)`         | Checks whether a value is an allowed type.                                                      |
| `toggleCallout(schema, kind?)` | Command: wraps the selected blocks in a callout of type `kind` (default `info`), or removes it. |
| `calloutToolbarItem(schema)`   | `callout` button, pressed when the cursor is inside a callout (i18n key `callout.insert`).      |
| `calloutSlashItem(schema)`     | Slash menu item ("Callout"; keywords: callout, riquadro, nota, avviso, box, note).              |

## HTML

```html
<aside class="scriba-callout" data-callout="warning">…</aside>
```

Only an `<aside>` with `data-callout` is read as a callout; an arbitrary `<aside>` taken from a web
page loses the callout and keeps only its content.

## Notes

- If the `callout` node is missing from the schema, `toggleCallout` throws a `RangeError`: add
  `calloutNodes`.
- The plugin defines only the node and the commands: the look in the editor comes from the node
  view (here `CalloutView` from `@scriba-editor/vue`, or your own).
- Security: the type is a closed list; any other value becomes `info`, and the attribute is
  validated by the schema (`isCalloutKind`). See [security](../../../docs/security.md).
- To write your own node view, see [plugins](../../../docs/plugins.md).
