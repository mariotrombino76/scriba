**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-comments

**Comments** on the selected text and **suggestions** (track changes) for the Scriba editor. Like
the TinyMCE Comments and Suggested Edits plugins. Comments live in a _store_ (in memory, or on your
server), not in the document.

## Installation

```bash
pnpm add @scriba-editor/plugin-comments
```

## Usage

```ts
import {
  commentMarks,
  commentToolbarItem,
  commentsKeymap,
  commentsPanel,
  commentsPlugin,
  createMemoryCommentStore,
  suggestToolbarItem,
  suggestionMarks,
  suggestionsPlugin,
} from '@scriba-editor/plugin-comments'

// local only: the author is whoever you pass. With multiple users, use a backend (see Security).
const comments = createMemoryCommentStore({ id: 'local', name: 'You' })

const schema = new Schema({
  nodes: basicSchemaSpec.nodes,
  marks: { ...basicSchemaSpec.marks, ...commentMarks, ...suggestionMarks },
})

const state = EditorState.create({
  schema,
  plugins: [
    commentsPlugin(comments),
    suggestionsPlugin({ store: comments, t }),
    // readOnly: true => users who can only comment can use the shortcut too
    keymap(commentsKeymap(comments, t), { priority: 80, readOnly: true }),
  ],
})

// comments panel in a sidebar
commentsPanel(view, { store: comments, t, container: sidebar })

// buttons: "Comment" (bubble or Insert menu) and "Suggest changes" (View menu)
const items = [commentToolbarItem(comments, t), suggestToolbarItem()]
```

With collaboration, instead of the in-memory store use `collabCommentStore(provider)` from
[`@scriba-editor/plugin-collab`](../collab/README.md).

## Exports

| Export                                                                                                                                                                  | Description                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `commentMarks`                                                                                                                                                          | `comment` mark: holds only the thread id, not exported to HTML.                         |
| `suggestionMarks`                                                                                                                                                       | `suggest_insert` and `suggest_delete` marks, also not exported.                         |
| `commentsPlugin(store)`                                                                                                                                                 | Keeps the threads in the state and highlights commented text (open threads only).       |
| `suggestionsPlugin({ store, t?, onBlocked? })`                                                                                                                          | Suggestion mode: typed text is a proposal, deleted text stays struck through.           |
| `commentsKeymap(store, t)`                                                                                                                                              | **Mod+Alt+M** comments the selection.                                                   |
| `commentToolbarItem(store, t)`, `suggestToolbarItem()`                                                                                                                  | Buttons (the second has `aria-pressed`).                                                |
| `commentsPanel(view, options)`                                                                                                                                          | Thread panel; options `store`, `t`, `container`, `locale` (default: the page language). |
| `openCommentDialog(view, store, t)`                                                                                                                                     | Dialog for a new comment.                                                               |
| `addComment`, `deleteThread`, `removeAnchor`, `focusThread`, `threadRange`, `commentsAt`, `getComments`, `commentsKey`                                                  | Comment functions.                                                                      |
| `listSuggestions(doc)`, `resolveSuggestion(view, id, accept)`, `resolveAllSuggestions(state, accept)`, `setSuggesting`, `suggestingEnabled`, `suggestKey`               | Suggestion functions.                                                                   |
| `createMemoryCommentStore(user)`, `cleanCommentText`, `MAX_COMMENT_LENGTH` (5000), types `CommentStore`, `CommentThread`, `CommentEntry`, `CommentAuthor`, `ThreadKind` | The store.                                                                              |

A `CommentStore` has `userId`, `threads()`, `subscribe(listener)`, `createThread`, `reply`,
`setResolved`, `deleteComment`, `deleteThread`: implement it on your backend.

## Notes

- Accepting or rejecting a suggestion (one or all) is **a single undo step**. Before exporting HTML,
  resolve the suggestions with `resolveAllSuggestions(state, true | false)`: the marks are not
  written.
- In suggestion mode only text changes are allowed; the others are rejected and a polite message
  (`suggest.blocked`, `role="status"`) is read by screen readers.
- Users with the editor in read-only mode but with `canAnnotate` can still comment.
- Accessibility: dialog with focus trap, status and error messages in live regions, keyboard
  shortcut; see [accessibility](../../../docs/accessibility.md).

## Security

- **The author is decided by the store**, that is your backend from the user's session (or the
  collaboration server): never the client. `createMemoryCommentStore` trusts the name you pass it,
  so it is only for demos, tests or single-user use.
- Comment and suggestion marks **have no HTML parse rules**: pasted or loaded HTML cannot create
  comments or proposals. They only hold a validated id (`[\w-]{1,64}`).
- Comment texts are plain text, cleaned and limited to 5000 characters, and displayed with
  `textContent`, never as HTML.
- See [security](../../../docs/security.md), [collaboration](../../../docs/collaboration.md) and
  [plugins](../../../docs/plugins.md).
