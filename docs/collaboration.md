**English** · [Italiano](it/collaborazione.md)

# Real-time collaboration

Several people on the same document, each with their own colored cursor, without conflicts and
even with slow or interrupted connections.

> In plain words: each person has a copy of the document. Changes travel as small "moves" that
> can be applied in any order and always lead to the same result (that is the magic of CRDTs,
> here with [Yjs](https://yjs.dev)). The server acts as switchboard and guard: it says who can
> come in, who can write, and it saves the document.

You need two parts: `@scriba-editor/plugin-collab` in the browser and
`@scriba-editor/collab-server` on your Node server.

## In the browser

```ts
import { EditorState } from '@scriba-editor/core'
import { EditorView } from '@scriba-editor/view'
import { collab, collabStatusElement } from '@scriba-editor/plugin-collab'

const shared = collab({
  url: 'wss://editor.example.com/collab',
  documentName: 'minutes-2026-10-19',
  // the user's session token: the server verifies it
  token: () => fetch('/api/collab-token').then((r) => r.text()),
})

const view = new EditorView(place, {
  state: EditorState.create({
    schema,
    // the content comes from the server: no initial document
    plugins: [...shared.plugins, history() /* …the other plugins */],
  }),
  // writing is allowed only when the server permits it
  editable: () => shared.provider.status === 'connected' && shared.provider.canWrite,
})
shared.provider.onStatus(() => view.updateState(view.state))
place.after(collabStatusElement(document, shared.provider, t)) // "Online", "Connecting…"

// when the editor closes
shared.destroy()
```

- Other people's **cursors** show the name and color decided by the **server** (nobody can
  present themselves with someone else's name).
- Incoming updates are **untrusted input**: after they are applied, the document is validated
  against the schema.
- Undo/redo only affect **your** changes.
- Shared comments: `collabCommentStore(shared.provider)` instead of the in-memory store (authors
  assigned by the server).

## On the server

```ts
import { listenCollabServer, documentFromYjs } from '@scriba-editor/collab-server'
import { serializeHTML } from '@scriba-editor/core'
import { sanitizeHTML } from '@scriba-editor/sanitize-server'
import { schema } from './schema.js'

listenCollabServer({
  port: 4174,
  schema,
  // REQUIRED: who you are and what you can do on this document. Null = rejected.
  async authenticate(token, documentName) {
    const user = await verifyToken(token) // your session / JWT
    if (!user) return null
    const role = await permissions(user.id, documentName) // never decide from the name alone!
    if (!role) return null
    return {
      user: { id: user.id, name: user.name },
      canWrite: role === 'editor',
      canComment: role !== 'reader', // commenters: read-only but they can comment
    }
  },
  load: (name) => readState(name), // saved Uint8Array, or null for a new document
  async store(name, state, ydoc) {
    // the document through the schema, then the cleaned HTML for whoever displays it elsewhere
    const html = sanitizeHTML(schema, serializeHTML(documentFromYjs(schema, ydoc)))
    await saveState(name, state, html)
  },
  limits: { maxMessageBytes: 1_000_000, maxDocumentBytes: 10_000_000, messagesPerSecond: 60 },
})
```

To attach it to an HTTP server you already have, use `attachCollabServer(wss, options)` with a
`WebSocketServer` from `ws`.

### What the server checks

- **Authentication** of every connection (the token arrives as the first message, never in the
  URL) and **per-document permissions**: no document is accessible just by guessing its name.
- **Writing**: with `canWrite: false` every change is rejected; with `canComment` only comments
  get through.
- **Protected blocks** (`@scriba-editor/plugin-permissions`): with `canEditBlock(id)` changes to
  blocks that are not allowed are reverted.
- **Limits**: size of messages and of the document, rate, connections per document, time to
  authenticate.
- **Identity**: cursor names and colors and comment authors come from authentication.

## Try it

`pnpm collab` starts the demo with a local collaboration server. Open
`http://localhost:5173/?collab=prova&token=tok-anna` and `…&token=tok-bruno` in two windows
(test users of the local server; `tok-ospite` can only read).
