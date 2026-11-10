# @scriba-editor/plugin-collab

**Collaborazione in tempo reale** per l'editor Scriba, basata su Yjs (CRDT): più persone scrivono
nello stesso documento, con i cursori degli altri visibili e commenti condivisi. Si collega a `@scriba-editor/collab-server`.

## Installazione

```bash
pnpm add @scriba-editor/plugin-collab
```

Il pacchetto dipende da `yjs`, `y-protocols` e `lib0`, ed è opzionale: il core non lo importa.

## Uso

```ts
import { collab, collabCommentStore, collabStatusElement } from '@scriba-editor/plugin-collab'

const shared = collab({
  url: 'wss://example.com/collab',
  documentName: 'nota-42',
  // il token della sessione dell'utente: il server lo verifica
  token: () => fetch('/api/collab-token').then((r) => r.text()),
})

// commenti condivisi, con autore deciso dal server
const comments = collabCommentStore(shared.provider)

const state = EditorState.create({
  schema,
  plugins: [...shared.plugins /* sincronizzazione e cursori */, commentsPlugin(comments) /* … */],
})

// modificabile solo quando il server concede la scrittura
const view = new EditorView(el, {
  state,
  editable: () => shared.provider.status === 'connected' && shared.provider.canWrite,
  canAnnotate: () => shared.provider.status === 'connected' && shared.provider.canComment,
})
shared.provider.onStatus(() => view.updateState(view.state))
el.after(collabStatusElement(document, shared.provider, t))
```

## Opzioni di `collab()`

| Opzione        | Descrizione                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `url`          | Indirizzo del server (il nome del documento è aggiunto in fondo).                                  |
| `documentName` | Il documento a cui unirsi.                                                                         |
| `token`        | Stringa, o funzione (anche asincrona) che la restituisce.                                          |
| `user`         | Nome e colore (slot 0-7) mostrati agli altri; il server li sostituisce con l'identità autenticata. |
| `field`        | Nome del frammento Yjs condiviso (default `scriba`).                                               |

`collab()` restituisce `{ ydoc, awareness, provider, plugins, destroy() }`.

## Cosa esporta

- `collab(options)`, `CollabProvider`, `collabStatusElement(doc, provider, t)`: tutto in una chiamata.
  Il provider ha `status` (`connecting`, `connected`, `disconnected`, `denied`), `canWrite`,
  `canComment`, `synced`, `onStatus(listener)` e `destroy()`. Opzioni extra di `CollabProvider`:
  `maxBackoffMs` (default 30 000) e `WebSocket`.
- `yBinding(options)`, `yBindingKey`, `remoteTransaction`, `REMOTE_META`: sincronizzazione editor e Yjs.
- `collabCursors(options)`, `cursorsKey`: cursori e selezioni degli altri utenti.
- `collabCommentStore(provider)`: store dei commenti via server (vedi
  [`@scriba-editor/plugin-comments`](../comments/README.md)); offline le operazioni sono rifiutate.
- Utilità di basso livello: `toY`, `nodeFromY`, `docFromY`, `updateFragment`, `writeDoc`,
  `diffStart`, `diffEnd`, `toRelative`, `fromRelative`.

## Comportamento

- Le modifiche locali diventano operazioni Yjs minime (due persone che scrivono nello stesso
  paragrafo conservano entrambe il loro testo).
- Le modifiche degli altri sono applicate come un solo passo **fuori dalla cronologia**: Ctrl+Z
  annulla solo le tue.
- Alla connessione, finché la prima sincronizzazione non è finita non si scrive nulla: vince il
  contenuto del server; il contenuto iniziale dell'editor è condiviso solo se il documento del
  server è vuoto.
- Riconnessione automatica con attesa crescente; se il server rifiuta l'accesso lo stato diventa
  `denied` e non si riprova.

## Sicurezza

- **Gli aggiornamenti degli altri utenti sono input non fidato.** Il documento remoto è ricostruito
  attraverso lo schema (`docFromY`): nodi e attributi non validi vengono scartati.
- **Il server deve autenticare** ogni connessione e controllare i permessi per documento
  (lettura, scrittura, commento): `canWrite` e `canComment` li decide lui. Il token viaggia come
  primo messaggio, mai nell'URL. Il server applica anche i limiti di dimensione e frequenza. Vedi
  [collaborazione](../../../docs/collaborazione.md).
- **Nomi dei cursori** mostrati come testo (una riga, max 60 caratteri), mai HTML; il colore è uno
  slot numerico 0-7, non uno stile libero.
- **Autore dei commenti:** assegnato dal server, non dal client.
- Vedi [sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md).

## Accessibilità

`collabStatusElement` è una regione `role="status"` (testi `collab.*`): chi usa uno screen reader
sente quando la connessione cade o torna, o se il documento è in sola lettura. Vedi
[accessibilità](../../../docs/accessibilita.md).
