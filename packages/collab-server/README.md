# @scriba/collab-server

Server di collaborazione in tempo reale per Scriba (compatibile con y-websocket, basato su Yjs e `ws`): autenticazione, permessi, limiti e identità assegnate dal server.

```bash
pnpm add @scriba/collab-server @scriba/core
```

Lato browser serve `@scriba/plugin-collab`. Guida completa: [Collaborazione](../../docs/collaborazione.md).

## Uso

```ts
import { listenCollabServer, documentFromYjs } from '@scriba/collab-server'
import { serializeHTML } from '@scriba/core'
import { sanitizeHTML } from '@scriba/sanitize-server'
import { schema } from './schema.js' // lo stesso schema usato nel browser

const { close } = listenCollabServer({
  port: 4174,
  schema,
  // OBBLIGATORIO: chi sei e cosa puoi fare su questo documento. null = rifiutato.
  async authenticate(token, documentName) {
    const user = await verificaToken(token) // la tua sessione / JWT
    if (!user) return null
    const ruolo = await permessi(user.id, documentName) // mai decidere dal solo nome!
    if (!ruolo) return null
    return {
      user: { id: user.id, name: user.nome },
      canWrite: ruolo === 'editor',
      canComment: ruolo !== 'lettore',
    }
  },
  load: (name) => leggiStato(name), // Uint8Array salvato, o null per un documento nuovo
  async store(name, state, ydoc) {
    const html = sanitizeHTML(schema, serializeHTML(documentFromYjs(schema, ydoc)))
    await salvaStato(name, state, html)
  },
})
```

Per agganciarlo a un server HTTP esistente usa `attachCollabServer(wss, options)` con un
`WebSocketServer` di `ws`: imposta anche il limite di dimensione dei messaggi.

## Sicurezza

- **Autenticazione obbligatoria**: `authenticate` è un'opzione richiesta (senza, il costruttore
  lancia un errore). Il token arriva come **primo messaggio** (mai nell'URL); entro
  `authTimeoutMs` la connessione deve autenticarsi, altrimenti viene chiusa.
- **Permessi per documento**: verifica sempre nel tuo `authenticate` che l'utente possa accedere
  a quel documento. Nessun documento deve essere accessibile solo indovinandone il nome (il nome
  accettato è `[\w.-]{1,128}`).
- **Sola lettura**: con `canWrite: false` ogni modifica viene rifiutata. Con `canComment: true`
  (e l'opzione `schema`) passano solo commenti e ancore dei commenti.
- **Blocchi protetti**: `canEditBlock(id)` (con lo `schema` dotato di id di blocco, vedi
  `@scriba/plugin-permissions`) annulla le modifiche ai blocchi non consentiti.
- **Identità decise dal server**: nome e colore dei cursori e autore dei commenti vengono
  dall'autenticazione, non dal client (`rewriteAwareness`); i nomi sono testo, mai HTML.
- **Limiti**: dimensione dei messaggi e del documento, frequenza, connessioni per documento
  (vedi sotto). Un client che li supera viene disconnesso.
- **Il documento salvato è input non fidato**: ricostruiscilo con `documentFromYjs` (passa dallo
  schema) e ripassa l'HTML da `@scriba/sanitize-server` prima di salvarlo o mostrarlo.
- In produzione metti il server dietro TLS (`wss://`).

## Opzioni (`CollabServerOptions`)

| Opzione         | Default     | Significato                                                                      |
| --------------- | ----------- | -------------------------------------------------------------------------------- |
| `authenticate`  | (richiesta) | `(token, documentName) => AuthResult \| null`, anche asincrona.                  |
| `load`          | —           | Carica lo stato Yjs salvato (`Uint8Array`) o `null` per un documento nuovo.      |
| `store`         | —           | `(name, state, ydoc)`: salva il documento (con ritardo, e quando esce l'ultimo). |
| `storeDelayMs`  | `2000`      | Ritardo prima di salvare dopo le modifiche.                                      |
| `loadComments`  | —           | Carica i thread di commenti (`StoredThread[]`).                                  |
| `storeComments` | —           | Salva i thread di commenti.                                                      |
| `limits`        | vedi sotto  | `CollabLimits`.                                                                  |
| `schema`        | —           | Schema dell'editor: serve per `canEditBlock` e `canComment`.                     |
| `field`         | `'scriba'`  | Nome del frammento XML condiviso (come nel client).                              |

`AuthResult`: `{ user: { id, name, color? }, canWrite, canEditBlock?, canComment? }` (`color` è
uno slot da 0 a 7, di default derivato dall'id).

`listenCollabServer` accetta in più `port` e `host?`, e restituisce `{ server, wss, close() }`.

### Limiti (`CollabLimits`)

| Limite                      | Default          |
| --------------------------- | ---------------- |
| `maxMessageBytes`           | 1 MB             |
| `maxDocumentBytes`          | 10 MB            |
| `messagesPerSecond`         | 60 (raffiche x2) |
| `authTimeoutMs`             | 5000             |
| `maxConnectionsPerDocument` | 100              |

## Altre esportazioni

`CollabServer` (classe, `handleConnection(ws, req)` e `close()`), `attachCollabServer`,
`listenCollabServer`, `documentFromYjs(schema, ydoc, field?)`, le costanti `MESSAGE_SYNC`,
`MESSAGE_AWARENESS`, `MESSAGE_AUTH`, `MESSAGE_COMMENTS`, i codici di chiusura `CLOSE`
(`4400`, `4401`, `4403`, `4413`, `4429`), e le funzioni di basso livello `rewriteAwareness`,
`applyGuardedUpdate`, `applyAnnotationUpdate`, `applyCommentOp`, `publicThreads`.

Requisiti: Node con modulo ES (`"type": "module"`).
