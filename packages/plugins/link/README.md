**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-link

Links with an accessible dialog for the Scriba editor, plus **autolink** (typed addresses that
become links) and **anchors** (target ids for internal links). Like TinyMCE's Link, Autolink and
Anchor plugins.

```bash
pnpm add @scriba-editor/plugin-link
```

## Usage

```ts
import { keymap } from '@scriba-editor/core'
import {
  anchorToolbarItem,
  autolink,
  linkContextMenu,
  linkKeymap,
  linkMarks,
  linkToolbarItems,
  withAnchors,
} from '@scriba-editor/plugin-link'

// schema: marks: { ...linkMarks, ...basicSchemaSpec.marks },
//         nodes: withAnchors({ ...basicSchemaSpec.nodes })   // anchor on paragraphs and headings

// editor state
plugins: [autolink(schema.marks['link']!), keymap(linkKeymap(t))]

// button (Ctrl/Cmd+K), anchor and context menu on the link
const items = [...linkToolbarItems(schema, t), anchorToolbarItem(t)]
const menu = linkContextMenu(schema, t) // edit, remove, open
```

## Exports

| Name                                                                                                                                                    | What it does                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `linkMarks`                                                                                                                                             | The `link` mark with `href` and `target` (only `null` or `_blank`).                                                                   |
| `setLink(schema, href, target?)`                                                                                                                        | Command: links the selection or the whole link under the cursor, or inserts the address as linked text. Does nothing for unsafe URLs. |
| `removeLink(schema)`                                                                                                                                    | Command: removes the link.                                                                                                            |
| `linkRange(state, type)`                                                                                                                                | Extent of the link under the cursor or in the selection.                                                                              |
| `normalizeLinkInput(value)`                                                                                                                             | `www.example.com` → `https://…`, an e-mail address → `mailto:…`.                                                                      |
| `openLinkDialog(view, t)`                                                                                                                               | The dialog: address, "Open in a new tab", save, remove.                                                                               |
| `linkKeymap(t)`                                                                                                                                         | Ctrl/Cmd+K opens the dialog.                                                                                                          |
| `linkToolbarItems(schema, t)`                                                                                                                           | Link button (pressed when the cursor is on a link).                                                                                   |
| `linkContextMenu(schema, t)`                                                                                                                            | Context menu items: edit, remove, open (open also works in read-only mode).                                                           |
| `autolink(type)`, `addressBefore`                                                                                                                       | Autolink plugin.                                                                                                                      |
| `withAnchors(nodes, names?)`, `setAnchor(name)`, `openAnchorDialog`, `anchorToolbarItem(t)`, `anchorName`, `anchorsIn`, `isAnchorName`, `ANCHOR_PREFIX` | Anchors.                                                                                                                              |

## Autolink

After a space or Enter, `https://…`, `www.…` (→ `https`), `mailto:…` and e-mail addresses (→
`mailto`) become links. Punctuation at the end of the sentence is not part of the address. After
the space, the link is an undo step of its own: Ctrl+Z keeps the text and removes the link. It
does not act in code blocks or on inline code.

## Anchors

An anchor is an `id` on a paragraph or a heading, always with the fixed prefix `anchor-`
("Introduction to the Course" → `#anchor-introduction-to-the-course`). A name already in use is
rejected.

## Security

- **URL whitelist, not blacklist**: only `http:`, `https:`, `mailto:`, `tel:` and relative URLs
  are allowed; everything else is removed (not just `javascript:`), after URL normalization. The
  check happens wherever the mark is created: HTML, JSON, dialog, autolink, collaboration.
- Links with `target="_blank"` **always** get `rel="noopener noreferrer"`; "Open link" in the
  context menu opens with `noopener,noreferrer`.
- Anchor ids have a fixed prefix and a strict format: no DOM clobbering.

The saved HTML must be re-sanitized with `@scriba-editor/sanitize-server`: see
[security](../../../docs/security.md).

## Accessibility

The dialog has a focus trap, Esc, focus return to the editor and an announced error
(`aria-live`, `aria-invalid`) for invalid addresses. Everything is reachable from the keyboard. See
[accessibility](../../../docs/accessibility.md) and [plugins](../../../docs/plugins.md).
