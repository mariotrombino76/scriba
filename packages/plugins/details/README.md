**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-details

**Collapsible sections** (accordion) for the Scriba editor: a clickable title that shows or hides
the blocks below it. In HTML they are the native `<details>` and `<summary>`. Like TinyMCE's
"Accordion" plugin, but built into the schema with clear rules.

## Installation

```bash
pnpm add @scriba-editor/plugin-details
```

## Usage

```ts
import {
  detailsAutoOpen,
  detailsKeymap,
  detailsNodeView,
  detailsNodes,
  detailsSlashItem,
  detailsToggleItem,
  detailsToolbarItem,
} from '@scriba-editor/plugin-details'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...detailsNodes },
  marks: basicSchemaSpec.marks,
})

const state = EditorState.create({
  schema,
  plugins: [keymap(detailsKeymap(), { priority: 70 }), detailsAutoOpen() /* … */],
})

const view = new EditorView(el, { state, nodeViews: { details: detailsNodeView(t) } })

// Insert menu and slash menu
const items = [detailsToolbarItem(schema), detailsToggleItem()]
const slash = detailsSlashItem(schema)
```

## What it exports

| Export                                                                                                                                                             | Description                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `detailsNodes`                                                                                                                                                     | Nodes `details` (attribute `open`, default `true`) and `details_summary` (title).      |
| `detailsNodeView(t)`                                                                                                                                               | Node view: button to open/close, title and content.                                    |
| `detailsKeymap()`                                                                                                                                                  | `Enter` in the title moves to the content; `Backspace` in an empty section removes it. |
| `detailsAutoOpen()`                                                                                                                                                | Plugin: opens a closed section when the cursor enters its hidden content.              |
| `detailsToolbarItem(schema)`                                                                                                                                       | Button: puts the selected blocks in a section, or takes them out.                      |
| `detailsToggleItem()`                                                                                                                                              | Menu item: opens or closes the section at the cursor (the keyboard way).               |
| `detailsSlashItem(schema)`                                                                                                                                         | Slash item ("/fisarmonica", "/sezione", "/accordion"…).                                |
| `insertDetails(schema)`, `removeDetails(schema)`, `toggleDetailsOpen`, `setDetailsOpen(pos, open)`, `enterFromSummary`, `removeEmptyDetails`, `findDetails(state)` | Commands and utilities.                                                                |

HTML: `<details open><summary>Title</summary><p>…</p></details>`. A pasted `<details>` without a
`<summary>` gets an empty title; a `<summary>` outside a `<details>` keeps only its text.

## Notes

- If you close a section while the cursor is in its content, the cursor moves to the end of the
  title (otherwise it would be in an invisible spot).
- In read-only mode the button opens and closes the section only on screen, without changing the
  document.
- Accessibility: the button has `aria-label` (`details.toggle`) and `aria-expanded`; it is not in
  the text's tab order, you reach it from the keyboard with the `detailsToggleItem()` menu item.
  See [accessibility](../../../docs/accessibility.md).
- Security: the only attribute is the boolean `open`, validated by the schema; there are no styles
  or scripts. See [security](../../../docs/security.md) and [plugins](../../../docs/plugins.md).
- The look (section hidden when closed) comes from the theme CSS (`@scriba-editor/themes`).
