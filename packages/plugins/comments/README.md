# @scriba/plugin-comments

**Commenti** sul testo selezionato e **suggerimenti** (modifiche tracciate) per l'editor Scriba.
In TinyMCE sono i plugin Comments e Suggested Edits, a pagamento; qui sono inclusi. I commenti
vivono in uno _store_ (in memoria, oppure sul tuo server), non nel documento.

## Installazione

```bash
pnpm add @scriba/plugin-comments
```

## Uso

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
} from '@scriba/plugin-comments'

// solo in locale: l'autore è chi passi tu. Con più utenti usa un backend (vedi Sicurezza).
const comments = createMemoryCommentStore({ id: 'local', name: 'Tu' })

const schema = new Schema({
  nodes: basicSchemaSpec.nodes,
  marks: { ...basicSchemaSpec.marks, ...commentMarks, ...suggestionMarks },
})

const state = EditorState.create({
  schema,
  plugins: [
    commentsPlugin(comments),
    suggestionsPlugin({ store: comments, t }),
    // readOnly: true => anche chi può solo commentare usa la scorciatoia
    keymap(commentsKeymap(comments, t), { priority: 80, readOnly: true }),
  ],
})

// pannello dei commenti in una barra laterale
commentsPanel(view, { store: comments, t, container: sidebar })

// pulsanti: "Commenta" (bubble o menu Inserisci) e "Modalità suggerimenti" (menu Visualizza)
const items = [commentToolbarItem(comments, t), suggestToolbarItem()]
```

Con la collaborazione, al posto dello store in memoria usa `collabCommentStore(provider)` di
[`@scriba/plugin-collab`](../collab/README.md).

## Cosa esporta

| Export                                                                                                                                                                 | Descrizione                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `commentMarks`                                                                                                                                                         | Mark `comment`: contiene solo l'id del thread, non viene esportato in HTML.                      |
| `suggestionMarks`                                                                                                                                                      | Mark `suggest_insert` e `suggest_delete`, anch'essi non esportati.                               |
| `commentsPlugin(store)`                                                                                                                                                | Tiene i thread nello stato e evidenzia il testo commentato (solo thread aperti).                 |
| `suggestionsPlugin({ store, t?, onBlocked? })`                                                                                                                         | Modalità suggerimenti: il testo digitato è una proposta, quello cancellato resta barrato.        |
| `commentsKeymap(store, t)`                                                                                                                                             | **Mod+Alt+M** commenta la selezione.                                                             |
| `commentToolbarItem(store, t)`, `suggestToolbarItem()`                                                                                                                 | Pulsanti (il secondo ha `aria-pressed`).                                                         |
| `commentsPanel(view, options)`                                                                                                                                         | Pannello dei thread; opzioni `store`, `t`, `container`, `locale` (default: lingua della pagina). |
| `openCommentDialog(view, store, t)`                                                                                                                                    | Finestra per un nuovo commento.                                                                  |
| `addComment`, `deleteThread`, `removeAnchor`, `focusThread`, `threadRange`, `commentsAt`, `getComments`, `commentsKey`                                                 | Funzioni sui commenti.                                                                           |
| `listSuggestions(doc)`, `resolveSuggestion(view, id, accept)`, `resolveAllSuggestions(state, accept)`, `setSuggesting`, `suggestingEnabled`, `suggestKey`              | Funzioni sui suggerimenti.                                                                       |
| `createMemoryCommentStore(user)`, `cleanCommentText`, `MAX_COMMENT_LENGTH` (5000), tipi `CommentStore`, `CommentThread`, `CommentEntry`, `CommentAuthor`, `ThreadKind` | Lo store.                                                                                        |

Uno `CommentStore` ha `userId`, `threads()`, `subscribe(listener)`, `createThread`, `reply`,
`setResolved`, `deleteComment`, `deleteThread`: implementalo sul tuo backend.

## Note

- Accettare o rifiutare un suggerimento (singolo o tutti) è **un solo passo di annulla**. Prima di
  esportare l'HTML risolvi i suggerimenti con `resolveAllSuggestions(state, true | false)`: i mark
  non vengono scritti.
- In modalità suggerimenti sono permesse solo modifiche di testo; le altre sono rifiutate e un
  messaggio gentile (`suggest.blocked`, `role="status"`) viene letto dagli screen reader.
- Chi ha l'editor in sola lettura ma `canAnnotate` può comunque commentare.
- Accessibilità: finestra con focus trap, messaggi di stato e errori in regioni live, scorciatoia da
  tastiera; vedi [accessibilità](../../../docs/accessibilita.md).

## Sicurezza

- **L'autore lo decide lo store**, cioè il tuo backend dalla sessione dell'utente (o il server di
  collaborazione): mai il client. `createMemoryCommentStore` si fida del nome che gli passi, quindi
  è solo per demo, test o uso singolo.
- I mark dei commenti e dei suggerimenti **non hanno regole di parsing HTML**: un HTML incollato o
  caricato non può creare commenti né proposte. Contengono solo un id validato (`[\w-]{1,64}`).
- I testi dei commenti sono testo semplice, ripuliti e limitati a 5000 caratteri, e mostrati con
  `textContent`, mai come HTML.
- Vedi [sicurezza](../../../docs/sicurezza.md), [collaborazione](../../../docs/collaborazione.md) e
  [plugin](../../../docs/plugin.md).
