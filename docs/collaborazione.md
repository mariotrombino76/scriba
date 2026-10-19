# Collaborazione in tempo reale

Più persone sullo stesso documento, ognuna con il proprio cursore colorato, senza conflitti e
anche con connessioni lente o interrotte. È incluso, non a pagamento.

> In parole semplici: ogni persona ha una copia del documento. Le modifiche viaggiano come
> piccole "mosse" che si possono applicare in qualsiasi ordine e portano sempre allo stesso
> risultato (è la magia dei CRDT, qui con [Yjs](https://yjs.dev)). Il server fa da centralino e
> da guardiano: dice chi può entrare, chi può scrivere e salva il documento.

Servono due parti: `@scriba/plugin-collab` nel browser e `@scriba/collab-server` sul tuo server
Node.

## Nel browser

```ts
import { EditorState } from '@scriba/core'
import { EditorView } from '@scriba/view'
import { collab, collabStatusElement } from '@scriba/plugin-collab'

const shared = collab({
  url: 'wss://editor.example.com/collab',
  documentName: 'verbale-2026-10-19',
  // il token della sessione dell'utente: il server lo verifica
  token: () => fetch('/api/collab-token').then((r) => r.text()),
})

const view = new EditorView(place, {
  state: EditorState.create({
    schema,
    // il contenuto arriva dal server: niente documento iniziale
    plugins: [...shared.plugins, history() /* …gli altri plugin */],
  }),
  // si scrive solo quando il server lo consente
  editable: () => shared.provider.status === 'connected' && shared.provider.canWrite,
})
shared.provider.onStatus(() => view.updateState(view.state))
place.after(collabStatusElement(document, shared.provider, t)) // "Connesso", "Riconnessione…"

// quando l'editor si chiude
shared.destroy()
```

- I **cursori** degli altri mostrano nome e colore che decide il **server** (nessuno può
  presentarsi con il nome di un altro).
- Gli aggiornamenti in arrivo sono **input non fidato**: dopo l'applicazione il documento viene
  validato contro lo schema.
- Annulla/ripeti riguardano solo le **tue** modifiche.
- Commenti condivisi: `collabCommentStore(shared.provider)` al posto dello store in memoria
  (autori assegnati dal server).

## Sul server

```ts
import { listenCollabServer, documentFromYjs } from '@scriba/collab-server'
import { serializeHTML } from '@scriba/core'
import { sanitizeHTML } from '@scriba/sanitize-server'
import { schema } from './schema.js'

listenCollabServer({
  port: 4174,
  schema,
  // OBBLIGATORIO: chi sei e cosa puoi fare su questo documento. Null = rifiutato.
  async authenticate(token, documentName) {
    const user = await verificaToken(token) // la tua sessione / JWT
    if (!user) return null
    const ruolo = await permessi(user.id, documentName) // mai decidere dal solo nome!
    if (!ruolo) return null
    return {
      user: { id: user.id, name: user.nome },
      canWrite: ruolo === 'editor',
      canComment: ruolo !== 'lettore', // commentatori: sola lettura ma possono commentare
    }
  },
  load: (name) => leggiStato(name), // Uint8Array salvato, o null per un documento nuovo
  async store(name, state, ydoc) {
    // il documento attraverso lo schema, poi l'HTML ripulito per chi lo mostra altrove
    const html = sanitizeHTML(schema, serializeHTML(documentFromYjs(schema, ydoc)))
    await salvaStato(name, state, html)
  },
  limits: { maxMessageBytes: 1_000_000, maxDocumentBytes: 10_000_000, messagesPerSecond: 60 },
})
```

Per agganciarlo a un tuo server HTTP esistente usa `attachCollabServer(wss, opzioni)` con un
`WebSocketServer` di `ws`.

### Cosa controlla il server

- **Autenticazione** di ogni connessione (il token arriva come primo messaggio, mai nell'URL) e
  **permessi per documento**: nessun documento è accessibile solo indovinandone il nome.
- **Scrittura**: con `canWrite: false` ogni modifica viene rifiutata; con `canComment` passano
  solo i commenti.
- **Blocchi protetti** (`@scriba/plugin-permissions`): con `canEditBlock(id)` le modifiche ai
  blocchi non consentiti vengono annullate.
- **Limiti**: dimensione dei messaggi e del documento, frequenza, connessioni per documento,
  tempo per autenticarsi.
- **Identità**: nomi e colori dei cursori, autori dei commenti vengono dall'autenticazione.

## Provarla

`pnpm collab` avvia la demo con un server di collaborazione locale. Apri in due finestre
`http://localhost:5173/?collab=prova&token=tok-anna` e `…&token=tok-bruno` (utenti di prova del
server locale; `tok-ospite` può solo leggere).
