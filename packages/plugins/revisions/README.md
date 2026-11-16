**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-revisions

Version history, like TinyMCE's "Revision History": list of saved versions, preview, comparison with the current document (added in green, removed struck through in red) and restore in a single undoable step.

```bash
pnpm add @scriba-editor/plugin-revisions
```

## Usage

The versions are stored by **your server**: the plugin only asks for the list and, when the user picks one, its content.

```ts
import { revisionsToolbarItem, type RevisionOptions } from '@scriba-editor/plugin-revisions'

const revisionOptions: RevisionOptions = {
  locale: 'it',
  revisions: () => fetch('/api/versions').then((r) => r.json()), // most recent first
  content: (revision) => fetch(`/api/versions/${revision.id}`).then((r) => r.text()), // HTML or JSON
}

// in the File menu or in the toolbar:
revisionsToolbarItem(t, revisionOptions)
```

A `Revision` has the shape `{ id, createdAt, author?, label? }` (`createdAt` can be a `Date`, an ISO string or a timestamp).

## Exports

| Name                                                                                                                  | What it does                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `revisionsToolbarItem(t, options)`                                                                                    | "Version history…" button; also available in read-only mode (you can view and compare, "Restore" is disabled) |
| `openRevisionDialog(view, t, options)`                                                                                | Opens the dialog from code and returns the handle                                                             |
| `RevisionOptions`                                                                                                     | `revisions()`, `content(revision)`, `locale?` (default: the browser's)                                        |
| `Revision`                                                                                                            | Type of a version                                                                                             |
| `parseRevision(schema, source)`                                                                                       | Reads the content of a version through the schema; throws an error if the schema rejects it                   |
| `MAX_REVISION_LENGTH`                                                                                                 | 5,000,000 characters: larger HTML is rejected, not truncated                                                  |
| `formatRevisionDate(value, locale?)`                                                                                  | Short date (empty string if invalid)                                                                          |
| `diffDocs(old, new)`, `diffSequence`, `slideEdits`, `MAX_COMPARISONS`, `DocDiff`, `Change`, `ChangeKind`, `Highlight` | The document comparison, reusable on its own                                                                  |

## Using the dialog

The versions are a radio group (arrow keys to move); the chosen one loads in a read-only preview. "Highlight the differences with the current document" shows what was added or removed _since_ that version, with "Previous/Next difference" to step through them. "Restore this version" replaces the document with a single undo step.

## Accessibility

The dialog has a focus trap and returns focus to the editor. Loading, errors and the difference count are in `role="status"` / `role="alert"` regions; each difference reached with Previous/Next is read out ("Difference 2 of 5, added since: “...”", text truncated to 120 characters); after a restore, a "Version restored" message is announced.

## Security

- The content of the versions comes from the server and is **untrusted input**: HTML is read in an inert document and goes through the schema parser, JSON is validated by the schema (it must be a whole document); beyond `MAX_REVISION_LENGTH` it is rejected. An unreadable version shows an error, it does not break the editor.
- Author and label are displayed **as text**, never as HTML.
- A slow response for a version that is no longer selected is ignored.
- Whoever saves versions must still sanitize them on the server with `@scriba-editor/sanitize-server`.

See [security](../../../docs/security.md), [accessibility](../../../docs/accessibility.md) and [plugins](../../../docs/plugins.md). It pairs well with [@scriba-editor/plugin-save](../save/README.md).
