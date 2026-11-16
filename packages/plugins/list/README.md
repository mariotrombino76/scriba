**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-list

Bulleted and numbered lists, nested too, with Tab / Shift+Tab, for the Scriba editor. It includes
list styles like TinyMCE's "advlist" (bullet shape, `1 a A i I` numbering).

```bash
pnpm add @scriba-editor/plugin-list
```

## Usage

```ts
import { keymap } from '@scriba-editor/core'
import {
  listIndentCommands,
  listKeymap,
  listNodes,
  listStyleMenus,
  listToolbarItems,
} from '@scriba-editor/plugin-list'

// schema: nodes: { ...basicSchemaSpec.nodes, ...listNodes }
// (a `paragraph` node is required: every item starts with a paragraph)

// editor state: higher priority than the base keymap
plugins: [keymap(listKeymap(schema), { priority: 50 })]

// toolbar: without the indent buttons, if plugin-text-style provides them
const items = listToolbarItems(schema, { indent: false })
const menus = listStyleMenus(schema) // bullet shape, numbering
const indent = listIndentCommands(schema) // { more, less } to merge with block indentation
```

## Nodes (`listNodes`)

| Node           | HTML   | Attributes                                                         |
| -------------- | ------ | ------------------------------------------------------------------ |
| `bullet_list`  | `<ul>` | `bullet`: `null` (disc), `circle`, `square`                        |
| `ordered_list` | `<ol>` | `start` (0–1 000 000), `numbering`: `null` (1), `a`, `A`, `i`, `I` |
| `list_item`    | `<li>` | content `paragraph block*`                                         |

When reading, the `list-style-type` styles used by Word (`lower-alpha`, `upper-roman`…) are also
understood, but the output uses only the typed attributes.

## Shortcuts (`listKeymap`)

| Key                               | Action                                      |
| --------------------------------- | ------------------------------------------- |
| Enter                             | New item; in an empty item, leaves the list |
| Tab / Shift+Tab                   | Nest / unnest the item                      |
| Backspace at the start of an item | Unnest                                      |
| Ctrl/Cmd+Shift+8                  | Bulleted list                               |
| Ctrl/Cmd+Shift+7                  | Numbered list                               |

With `@scriba-editor/plugin-markdown` you can also type `- `, `* `, `+ ` or `1. ` at the start of
a line.

## Exports

| Name                                                                                                                                       | What it does                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `listNodes`, `NUMBERINGS`, `Numbering`, `BulletStyle`                                                                                      | Nodes and types.                                                      |
| `listKeymap(schema)`                                                                                                                       | The shortcuts above.                                                  |
| `listToolbarItems(schema, { indent? })`                                                                                                    | Buttons: bulleted, numbered and (unless `indent: false`) indentation. |
| `listStyleMenus(schema)`                                                                                                                   | "Bullet style" and "Numbering" menus.                                 |
| `listIndentCommands(schema)`                                                                                                               | `{ more, less }`: indentation commands for items.                     |
| `toggleList`, `wrapInList`, `splitListItem`, `sinkListItem`, `liftListItem`, `liftListItemAtStart`, `setListStyle`, `isInList`, `listAttr` | `(state, dispatch?) => boolean` commands.                             |

`toggleList` outside a list creates one, in a list of the same type removes its items from it, in a
list of another type changes the type.

## Notes

- Commands called without `dispatch` only tell whether they can run (they enable the buttons).
- List attributes are validated by the schema (enumerated values, bounded integer for `start`): no
  free-form `style` in the output. See [security](../../../docs/security.md).
- Buttons have `aria-pressed` when the cursor is in a list of that type. See
  [accessibility](../../../docs/accessibility.md) and [plugins](../../../docs/plugins.md).
