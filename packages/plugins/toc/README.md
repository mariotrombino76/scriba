**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-toc

Table of contents like TinyMCE's `toc` plugin: a list of the document's headings, each one a link to the heading's anchor, **updated automatically** when the headings change.

```bash
pnpm add @scriba-editor/plugin-toc
```

## Usage

You need anchors on the headings (`withAnchors` from `@scriba-editor/plugin-link`).

```ts
import { withAnchors } from '@scriba-editor/plugin-link'
import { tableOfContents, tocNodes, tocSlashItem, tocToolbarItem } from '@scriba-editor/plugin-toc'

const schema = new Schema({
  nodes: withAnchors({ ...basicSchemaSpec.nodes, ...tocNodes }),
  marks,
})

const plugins = [
  tableOfContents(), // keeps every table of contents up to date
]
// Insert menu: tocToolbarItem(schema); "/" menu: tocSlashItem(schema)
```

HTML produced: `<ol class="scriba-toc"><li><a href="#anchor-intro">Intro</a><ol>...</ol></li></ol>`, that is, only lists and links the schema already allows.

## Exports

| Name                                                       | What it does                                                                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tocNodes`                                                 | Node `table_of_contents`: atomic block with the `entries` attribute                                                                                |
| `tableOfContents()`                                        | Plugin: after every change, gives an anchor to headings that lack one (from the text, unique in the document) and rewrites every table of contents |
| `syncTableOfContents(tr, schema)`                          | The same update on a transaction; returns whether anything changed                                                                                 |
| `insertTableOfContents(schema)`                            | Command: inserts a table of contents at the cursor, already filled in (not in code blocks); throws `RangeError` if `tocNodes` is missing           |
| `tocToolbarItem(schema)`                                   | "Table of contents" button (`id: 'toc'`)                                                                                                           |
| `tocSlashItem(schema)`                                     | `/indice` item (keywords: indice, sommario, toc, contents, titoli)                                                                                 |
| `tocEntries(doc)`                                          | The document's table of contents entries (for a side panel, an outline...)                                                                         |
| `TocEntry`                                                 | `{ level, text, anchor }`                                                                                                                          |
| `TOC_CLASS`, `MAX_TOC_ENTRIES` (500), `MAX_TOC_TEXT` (200) | Constants                                                                                                                                          |

## Notes

Headings with empty text do not appear; if `tocNodes` or the anchors on headings are missing, the plugin does nothing. If levels skip (from 1 to 3), the list nests one extra level.

## Security

The table of contents is read back from incoming HTML with strict rules: at most 500 entries and 6 levels, text of at most 200 characters without control characters, `href` only `#anchor-<name>` with a valid name (`isAnchorName`). An invalid entry is discarded. The table of contents is always rebuilt from the real headings, and the text is inserted as text, never as HTML. The server must still run the HTML through `@scriba-editor/sanitize-server`. See [security](../../../docs/security.md) and [plugins](../../../docs/plugins.md).
