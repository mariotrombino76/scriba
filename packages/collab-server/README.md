**English** · [Italiano](README.it.md)

# @scriba-editor/collab-server

Real-time collaboration server for Scriba (compatible with y-websocket, built on Yjs and `ws`): authentication, permissions, limits and server-assigned identities.

```bash
pnpm add @scriba-editor/collab-server @scriba-editor/core
```

On the browser side you need `@scriba-editor/plugin-collab`. Full guide: [Collaboration](../../docs/collaboration.md).

## Usage

```ts
import { listenCollabServer, documentFromYjs } from '@scriba-editor/collab-server'
import { serializeHTML } from '@scriba-editor/core'
import { sanitizeHTML } from '@scriba-editor/sanitize-server'
import { schema } from './schema.js' // the same schema used in the browser

const { close } = listenCollabServer({
  port: 4174,
  schema,
  // REQUIRED: who you are and what you can do on this document. null = rejected.
  async authenticate(token, documentName) {
    const user = await verifyToken(token) // your session / JWT
    if (!user) return null
    const role = await permissions(user.id, documentName) // never decide from the name alone!
    if (!role) return null
    return {
      user: { id: user.id, name: user.name },
      canWrite: role === 'editor',
      canComment: role !== 'reader',
    }
  },
  load: (name) => readState(name), // saved Uint8Array, or null for a new document
  async store(name, state, ydoc) {
    const html = sanitizeHTML(schema, serializeHTML(documentFromYjs(schema, ydoc)))
    await saveState(name, state, html)
  },
})
```

To attach it to an existing HTTP server, use `attachCollabServer(wss, options)` with a `ws`
`WebSocketServer`: also set the message size limit there.

## Security

- **Authentication is mandatory**: `authenticate` is a required option (without it, the constructor
  throws an error). The token arrives as the **first message** (never in the URL); the connection
  must authenticate within `authTimeoutMs`, otherwise it is closed.
- **Per-document permissions**: always check in your `authenticate` that the user may access that
  document. No document must be accessible just by guessing its name (the accepted name is
  `[\w.-]{1,128}`).
- **Read-only**: with `canWrite: false` every change is rejected. With `canComment: true` (and the
  `schema` option) only comments and comment anchors get through.
- **Protected blocks**: `canEditBlock(id)` (with a `schema` that has block ids, see
  `@scriba-editor/plugin-permissions`) reverts changes to blocks that are not allowed.
- **Identities decided by the server**: cursor name and color and comment author come from
  authentication, not from the client (`rewriteAwareness`); names are text, never HTML.
- **Limits**: message and document size, rate, connections per document (see below). A client that
  exceeds them is disconnected.
- **The saved document is untrusted input**: rebuild it with `documentFromYjs` (it goes through the
  schema) and pass the HTML through `@scriba-editor/sanitize-server` before saving or displaying it.
- In production, put the server behind TLS (`wss://`).

## Options (`CollabServerOptions`)

| Option          | Default    | Meaning                                                                                    |
| --------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `authenticate`  | (required) | `(token, documentName) => AuthResult \| null`, may also be async.                          |
| `load`          | —          | Loads the saved Yjs state (`Uint8Array`) or `null` for a new document.                     |
| `store`         | —          | `(name, state, ydoc)`: saves the document (with a delay, and when the last client leaves). |
| `storeDelayMs`  | `2000`     | Delay before saving after changes.                                                         |
| `loadComments`  | —          | Loads the comment threads (`StoredThread[]`).                                              |
| `storeComments` | —          | Saves the comment threads.                                                                 |
| `limits`        | see below  | `CollabLimits`.                                                                            |
| `schema`        | —          | Editor schema: needed for `canEditBlock` and `canComment`.                                 |
| `field`         | `'scriba'` | Name of the shared XML fragment (same as in the client).                                   |

`AuthResult`: `{ user: { id, name, color? }, canWrite, canEditBlock?, canComment? }` (`color` is a
slot from 0 to 7, derived from the id by default).

`listenCollabServer` also accepts `port` and `host?`, and returns `{ server, wss, close() }`.

### Limits (`CollabLimits`)

| Limit                       | Default        |
| --------------------------- | -------------- |
| `maxMessageBytes`           | 1 MB           |
| `maxDocumentBytes`          | 10 MB          |
| `messagesPerSecond`         | 60 (bursts x2) |
| `authTimeoutMs`             | 5000           |
| `maxConnectionsPerDocument` | 100            |

## Other exports

`CollabServer` (class, `handleConnection(ws, req)` and `close()`), `attachCollabServer`,
`listenCollabServer`, `documentFromYjs(schema, ydoc, field?)`, the constants `MESSAGE_SYNC`,
`MESSAGE_AWARENESS`, `MESSAGE_AUTH`, `MESSAGE_COMMENTS`, the close codes `CLOSE` (`4400`, `4401`,
`4403`, `4413`, `4429`), and the low-level functions `rewriteAwareness`, `applyGuardedUpdate`,
`applyAnnotationUpdate`, `applyCommentOp`, `publicThreads`.

Requirements: Node with ES modules (`"type": "module"`).
