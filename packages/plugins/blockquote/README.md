**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-blockquote

**Blockquote** blocks for the Scriba editor: wraps one or more blocks in a `<blockquote>`, or
lifts them out of the blockquote. It matches the TinyMCE "Blockquote" button, but the content
stays bound to the schema (a blockquote always contains blocks, never "loose" text).

## Installation

```bash
pnpm add @scriba-editor/plugin-blockquote
```

## Usage

```ts
import { Schema, basicSchemaSpec } from '@scriba-editor/core'
import {
  blockquoteNodes,
  blockquoteToolbarItems,
  toggleBlockquote,
} from '@scriba-editor/plugin-blockquote'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...blockquoteNodes },
  marks: basicSchemaSpec.marks,
})

// button in the toolbar ("blocks" group)
toolbar.items = [toolbarGroup('blocks', 'toolbar.group.blocks', blockquoteToolbarItems(schema))]

// item in the slash menu ("/quote")
const quote = {
  id: 'quote',
  label: (t) => t('block.blockquote'),
  keywords: ['citazione', 'quote'],
  icon: 'quote',
  command: toggleBlockquote(schema),
}
```

## Exports

| Export                           | Description                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `blockquoteNodes`                | `blockquote` node (group `block`, content `block+`) to add to the schema.                |
| `toggleBlockquote(schema)`       | Command: wraps the selected blocks in a blockquote, or lifts them out if already inside. |
| `blockquoteToolbarItems(schema)` | `blockquote` button (icon `quote`, pressed when the cursor is in a blockquote).          |

HTML read and written: `<blockquote>…</blockquote>`, without attributes.

## Notes

- The schema must have the `block` group (`basicSchemaSpec` has it). If the `blockquote` node is
  missing, `toggleBlockquote` and `blockquoteToolbarItems` throw a `RangeError`: add
  `blockquoteNodes`.
- The command follows the `(state, dispatch?) => boolean` rule: without `dispatch` it only tells
  whether it can run (used to enable or disable the button).
- The button text uses the i18n key `block.blockquote` (package `@scriba-editor/i18n`).
- Security: pasted or loaded HTML goes through the schema parser, which accepts only
  `<blockquote>` without attributes; see [security](../../../docs/security.md) and
  [plugins](../../../docs/plugins.md).
- Accessibility: the button is in the toolbar with `aria-pressed` and arrow-key navigation; see
  [accessibility](../../../docs/accessibility.md).
