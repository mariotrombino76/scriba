**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-footnotes

Footnotes for the Scriba editor: numbered references in the text and the list of notes at the end
of the document, **always in sync**. Like TinyMCE's footnotes plugin, but the order and the
numbers are maintained by the editor.

```bash
pnpm add @scriba-editor/plugin-footnotes
```

## Usage

```ts
import { Schema, keymap, basicSchemaSpec } from '@scriba-editor/core'
import {
  footnoteGoToItem,
  footnoteNodes,
  footnotes,
  footnotesKeymap,
  footnoteSlashItem,
  footnoteToolbarItem,
} from '@scriba-editor/plugin-footnotes'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...footnoteNodes },
  marks: basicSchemaSpec.marks,
})

// in the editor state
plugins: [keymap(footnotesKeymap(schema), { priority: 70 }), footnotes()]

// Insert menu and slash menu ("/footnote")
const items = [footnoteToolbarItem(schema), footnoteGoToItem()]
const slash = footnoteSlashItem(schema)
```

## How it works

In HTML a reference and its note are linked by a number:

```html
text<sup><a href="#fn-1" id="fnref-1">1</a></sup> …
<ol class="scriba-footnotes">
  <li id="fn-1"><p>The note.</p></li>
</ol>
```

`footnotes()` puts things back in order after every change (typing, paste, undo, collaboration):
references are numbered 1, 2, 3… in reading order; there is a single list at the end of the
document with one note per reference, in the same order; a reference without a note gets an empty
one, notes without a reference disappear. If two references have the same key (one was copied),
the note stays with the one that was already there.

## Exports

| Name                                   | What it does                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `footnoteNodes`                        | Schema nodes: `footnote_ref` (inline, atom), `footnotes` (list), `footnote` (note, one or more paragraphs). |
| `footnotes()`                          | Plugin that maintains the numbers, order and list of notes.                                                 |
| `insertFootnote(schema)`               | Command: inserts the reference at the cursor and the note in the list; the cursor moves into the note.      |
| `goToFootnote`                         | Command: from the selected reference to the note, and from the note to the reference.                       |
| `footnotesKeymap(schema)`              | Shortcuts (see below).                                                                                      |
| `footnoteToolbarItem(schema)`          | "Footnote" item.                                                                                            |
| `footnoteGoToItem()`                   | "Go to the note or back to the text" item (for menus and the context menu).                                 |
| `footnoteSlashItem(schema)`            | Slash menu item.                                                                                            |
| `syncFootnotes(tr, schema, existing?)` | Adds to a transaction the steps that put the notes back in order.                                           |
| `FOOTNOTES_CLASS`, `MAX_FOOTNOTES`     | List class (`scriba-footnotes`) and maximum number of notes (9999).                                         |

## Shortcuts

| Key                             | Action             |
| ------------------------------- | ------------------ |
| Ctrl/Cmd+Alt+F                  | Inserts a footnote |
| Enter (on a selected reference) | Opens its note     |

The command is not available in code blocks, inside a note (no notes within notes), or where the
schema does not allow the reference.

## Security

- The ids in HTML are **only** `fn-<number>` and `fnref-<number>` (fixed prefixes, numbers 1–9999
  without leading zeros): no DOM clobbering of the page's global variables.
- On input, the list is recognized only with the `scriba-footnotes` class; anything that does not
  match is discarded by the schema parser.
- The key that ties a reference to its note stays in the editor, not in the HTML (only `[a-z0-9]`,
  at most 24 characters).

The saved HTML must still be re-sanitized with `@scriba-editor/sanitize-server`: see
[security](../../../docs/security.md) and [plugins](../../../docs/plugins.md). For keyboard and
dialogs see [accessibility](../../../docs/accessibility.md).
