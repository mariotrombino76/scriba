**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-merge-tags

Merge fields like the TinyMCE "merge tags": `{{customer.name}}` placeholders that your application fills in later (letters, emails, contracts).

```bash
pnpm add @scriba-editor/plugin-merge-tags
```

## Usage

```ts
import { keymap } from '@scriba-editor/core'
import {
  mergeTagMenu,
  mergeTagNodes,
  mergeTags,
  type MergeTag,
} from '@scriba-editor/plugin-merge-tags'

const tags: MergeTag[] = [
  { name: 'customer.name', label: 'Name', group: 'Customer' },
  { name: 'customer.email', label: 'Email', group: 'Customer' },
  { name: 'today_date', label: "Today's date" },
]

const schema = new Schema({ nodes: { ...basicSchemaSpec.nodes, ...mergeTagNodes }, marks })

const suggest = mergeTags(tags, t)
const plugins = [...suggest.plugins, keymap(suggest.keymap(), { priority: 110 })]
// in the toolbar, Insert menu: mergeTagMenu(tags)
```

Filling in the values (plain text, the surrounding formatting stays):

```ts
const filled = fillMergeTags(state.doc, { 'customer.name': 'Anna Rossi' })
```

## Exports

| Name                                                           | What it does                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `mergeTagNodes`                                                | Atomic inline `merge_tag` node. HTML: `<span data-merge-tag="customer.name">{{customer.name}}</span>` |
| `mergeTags(tags, t)`                                           | Returns `{ plugins, keymap() }`: typing `{{` opens the list, filtered by name or label                |
| `mergeTagMenu(tags)`                                           | "Merge tag" menu item with one row per tag                                                            |
| `insertMergeTag(name)`                                         | Command: inserts the tag at the cursor (replaces the selection); does nothing in code blocks          |
| `fillMergeTags(doc, values)`                                   | Document with every tag replaced by its value; a tag without a value stays as it is                   |
| `mergeTagsIn(state)`                                           | Names of the tags used, in order and without duplicates                                               |
| `isMergeTagName`, `MERGE_TAG_NAME`, `MAX_MERGE_TAG_NAME` (100) | Name validation                                                                                       |
| `MergeTag`                                                     | `{ name, label, group? }`                                                                             |

## Keyboard and accessibility

With the `{{` list open: Up/Down arrow keys, Enter or Tab to choose, Esc to close. The list is a `listbox` with focus in the text, as for mentions (see [@scriba-editor/plugin-mention](../mention/README.md), whose `createSuggestion` it reuses). The label shown is `Group › Label`; translating it is up to you.

## Security

- The name is **only** `[a-z0-9_.]` (segments separated by dots, at most 100 characters): no markup, no spaces. Any other name in incoming HTML causes the node to be discarded.
- The tag list is configuration, not input: an invalid name throws `RangeError` immediately.
- `fillMergeTags` inserts the values **as text**, never as HTML. If you take them from user data, the server must still pass the final HTML through `@scriba-editor/sanitize-server`.

See [security](../../../docs/security.md) and [plugins](../../../docs/plugins.md).
