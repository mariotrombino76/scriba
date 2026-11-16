**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-hr

Horizontal line and **page break** for the Scriba editor (Insert menu, as in TinyMCE).

```bash
pnpm add @scriba-editor/plugin-hr
```

## Usage

```ts
import { Schema, basicSchemaSpec } from '@scriba-editor/core'
import { hrNodes, hrPlugins, hrSlashItems, hrToolbarItems } from '@scriba-editor/plugin-hr'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...hrNodes },
  marks: basicSchemaSpec.marks,
})

// in the editor state
plugins: [...hrPlugins(t)]

// buttons (Insert ▸ Horizontal line, Page break) and slash menu
const [hr, pageBreak] = hrToolbarItems(schema)
const slash = hrSlashItems(schema) // "/line", "/break"
```

## Nodes

| Node              | HTML                             | Notes                                                               |
| ----------------- | -------------------------------- | ------------------------------------------------------------------- |
| `horizontal_rule` | `<hr>`                           | Horizontal line.                                                    |
| `page_break`      | `<hr class="scriba-page-break">` | Any viewer shows a line; the theme's print styles start a new page. |

Neither has attributes: other classes or attributes on an `<hr>` are discarded.

## Exports

| Name                                      | What it does                                                                                                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hrNodes`                                 | The two node specs.                                                                                                                                                                                         |
| `insertHorizontalRule`, `insertPageBreak` | Commands: insert at the cursor (the paragraph is split; in an empty paragraph they replace it); the cursor moves into the text after, adding a paragraph if there is none. They do not work in code blocks. |
| `hrToolbarItems(schema)`                  | Two buttons: line and page break.                                                                                                                                                                           |
| `hrSlashItems(schema)`                    | Two slash menu items.                                                                                                                                                                                       |
| `hrPlugins(t)`                            | Gives page breaks a name for screen readers.                                                                                                                                                                |
| `PAGE_BREAK_CLASS`                        | The fixed class `scriba-page-break`.                                                                                                                                                                        |

With `@scriba-editor/plugin-markdown`, typing `---`, `___` or `***` alone in an empty paragraph
inserts the horizontal line.

## Security and accessibility

- The page break class is **fixed**: no class coming from outside is accepted (see
  [security](../../../docs/security.md)).
- In the editor every page break gets an `aria-label` (an `<hr>` on its own is just a
  "separator"); the label exists **only in the editor DOM**, the saved HTML stays plain.
- Saving as an HTML page with `@scriba-editor/plugin-file` and printing respect the page break.

See also [plugins](../../../docs/plugins.md) and [accessibility](../../../docs/accessibility.md).
