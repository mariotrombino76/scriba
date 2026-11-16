**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-collab

**Real-time collaboration** for the Scriba editor, based on Yjs (CRDT): several people write in
the same document, with the other people's cursors visible and shared comments. It connects to
`@scriba-editor/collab-server`.

## Installation

```bash
pnpm add @scriba-editor/plugin-collab
```

The package depends on `yjs`, `y-protocols` and `lib0`, and it is optional: the core does not
import it.

## Usage

```ts
import { collab, collabCommentStore, collabStatusElement } from '@scriba-editor/plugin-collab'

const shared = collab({
  url: 'wss://example.com/collab',
  documentName: 'note-42',
  // the user's session token: the server verifies it
  token: () => fetch('/api/collab-token').then((r) => r.text()),
})

// shared comments, with the author decided by the server
const comments = collabCommentStore(shared.provider)

const state = EditorState.create({
  schema,
  plugins: [...shared.plugins /* sync and cursors */, commentsPlugin(comments) /* … */],
})

// editable only when the server grants write access
const view = new EditorView(el, {
  state,
  editable: () => shared.provider.status === 'connected' && shared.provider.canWrite,
  canAnnotate: () => shared.provider.status === 'connected' && shared.provider.canComment,
})
shared.provider.onStatus(() => view.updateState(view.state))
el.after(collabStatusElement(document, shared.provider, t))
```

## `collab()` options

| Option         | Description                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `url`          | Server address (the document name is appended at the end).                                               |
| `documentName` | The document to join.                                                                                    |
| `token`        | A string, or a function (async too) that returns it.                                                     |
| `user`         | Name and color (slot 0-7) shown to the others; the server replaces them with the authenticated identity. |
| `field`        | Name of the shared Yjs fragment (default `scriba`).                                                      |

`collab()` returns `{ ydoc, awareness, provider, plugins, destroy() }`.

## Exports

- `collab(options)`, `CollabProvider`, `collabStatusElement(doc, provider, t)`: everything in one
  call. The provider has `status` (`connecting`, `connected`, `disconnected`, `denied`),
  `canWrite`, `canComment`, `synced`, `onStatus(listener)` and `destroy()`. Extra
  `CollabProvider` options: `maxBackoffMs` (default 30,000) and `WebSocket`.
- `yBinding(options)`, `yBindingKey`, `remoteTransaction`, `REMOTE_META`: editor and Yjs sync.
- `collabCursors(options)`, `cursorsKey`: the other users' cursors and selections.
- `collabCommentStore(provider)`: comment store through the server (see
  [`@scriba-editor/plugin-comments`](../comments/README.md)); offline, operations are rejected.
- Low-level utilities: `toY`, `nodeFromY`, `docFromY`, `updateFragment`, `writeDoc`,
  `diffStart`, `diffEnd`, `toRelative`, `fromRelative`.

## Behavior

- Local changes become minimal Yjs operations (two people writing in the same paragraph both
  keep their text).
- The other people's changes are applied as a single step **outside the history**: Ctrl+Z undoes
  only yours.
- On connection, nothing is written until the first sync is finished: the server content wins;
  the initial editor content is shared only if the server document is empty.
- Automatic reconnection with increasing wait; if the server denies access the status becomes
  `denied` and there are no more retries.

## Security

- **Updates from other users are untrusted input.** The remote document is rebuilt through the
  schema (`docFromY`): invalid nodes and attributes are dropped.
- **The server must authenticate** every connection and check the permissions per document
  (read, write, comment): `canWrite` and `canComment` are decided by the server. The token
  travels as the first message, never in the URL. The server also enforces the size and rate
  limits. See [collaboration](../../../docs/collaboration.md).
- **Cursor names** are shown as text (one line, max 60 characters), never as HTML; the color is a
  numeric slot 0-7, not a free-form style.
- **Comment author:** assigned by the server, not by the client.
- See [security](../../../docs/security.md) and [plugins](../../../docs/plugins.md).

## Accessibility

`collabStatusElement` is a `role="status"` region (`collab.*` texts): screen reader users hear
when the connection drops or comes back, or if the document is read-only. See
[accessibility](../../../docs/accessibility.md).
