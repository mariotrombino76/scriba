# @scriba-editor/plugin-mention

Menzioni `@persona` come in TinyMCE (plugin Mentions): scrivendo `@` all'inizio di una riga o dopo uno spazio si apre un elenco di persone trovate **dal tuo backend**, e la scelta inserisce un nodo `mention` atomico.

```bash
pnpm add @scriba-editor/plugin-mention
```

## Uso

```ts
import { mentionKeymap, mentionNodes, mentions, type MentionSearch } from '@scriba-editor/plugin-mention'
import { keymap } from '@scriba-editor/core'

// la ricerca chiama il tuo server (con la sessione dell'utente)
const searchPeople: MentionSearch = async (query, signal) => {
  const res = await fetch(`/api/persone?q=${encodeURIComponent(query)}`, { signal })
  return res.ok ? await res.json() : []
}

const schema = new Schema({ nodes: { ...basicSchemaSpec.nodes, ...mentionNodes }, marks })

const plugins = [
  ...mentions({ search: searchPeople, t }),
  keymap(mentionKeymap(), { priority: 110 }), // alta priorità: Invio e Tab scelgono la voce
]
```

Una voce restituita da `search` ha la forma `{ id, label, detail? }` (`MentionItem`).

## Esportazioni

| Nome                                                                                              | Cosa fa                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `mentionNodes`                                                                                    | Nodo inline atomico `mention` (attributi `id`, `label`). HTML: `<span class="scriba-mention" data-mention-id="…">@Nome</span>` |
| `mentions(options)`                                                                               | Plugin del suggerimento: elenco dopo `@`, ricerca asincrona                                                                    |
| `mentionKeymap()`                                                                                 | Tasti con l'elenco aperto                                                                                                      |
| `chooseMention(view, item)`                                                                       | Sceglie una voce da codice (ha un proprio passo di undo)                                                                       |
| `closeMention(tr)`, `getMentionState(state)`, `mentionKey`, `isLoading(state)`                    | Stato dell'elenco                                                                                                              |
| `cleanResults(raw, max)`                                                                          | Scarta le voci non valide, i doppioni di `id` e oltre `max`                                                                    |
| `isMentionId`, `isMentionLabel`, `labelFromText`, `MAX_ID_LENGTH` (200), `MAX_LABEL_LENGTH` (100) | Validazioni dei dati                                                                                                           |
| `createSuggestion`, `SuggestConfig`, `SuggestItem`, ...                                           | Costruttore generico di elenchi a trigger (lo usa anche `@scriba-editor/plugin-merge-tags`)                                           |

### Opzioni di `mentions()` (`MentionMenuOptions`)

| Opzione      | Descrizione                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`     | `(query, signal) => Promise<MentionItem[]>`; `query` è `""` subito dopo `@`; il `signal` si annulla se l'utente continua a scrivere o chiude l'elenco |
| `t`          | Funzione di traduzione (`createTranslator` di `@scriba-editor/i18n`)                                                                                         |
| `debounce`   | Pausa prima di cercare, in ms (predefinito 150)                                                                                                       |
| `maxResults` | Voci mostrate al massimo (predefinito 8, massimo 50)                                                                                                  |
| `timeout`    | Una ricerca più lenta fallisce, in ms (predefinito 10 000)                                                                                            |

## Tastiera

Con l'elenco aperto: frecce Su/Giù spostano la selezione, Invio o Tab scelgono, Esc chiude (il testo scritto resta). Uno spazio subito dopo `@`, o dopo una ricerca senza risultati, chiude l'elenco e si continua a scrivere. Dopo la scelta Ctrl+Z restituisce il testo `@query` digitato.

## Accessibilità

L'elenco è un `listbox` sotto il cursore mentre il focus resta nel testo (`aria-controls` e `aria-activedescendant` sull'editor); gli stati "Ricerca…", "Nessuna persona trovata" e "Ricerca non riuscita" sono annunciati come messaggi di stato.

## Sicurezza

Vedi [sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md).

- I risultati arrivano da una **sorgente esterna** e sono input non fidato: `cleanResults` tiene solo voci con `id` (1–200 caratteri, senza spazi) e `label` (1–100 caratteri, una riga) validi, senza caratteri di controllo né segni di direzione.
- Nome e dettaglio sono mostrati **come testo**, mai come HTML.
- La `label` è solo testo di visualizzazione: chiunque può incollare una menzione con un nome qualsiasi. Risolvi sempre l'`id` sul server (nome attuale, permessi, notifiche).
- Prima che l'utente scriva `@` non viene inviato nulla. Il server deve comunque ripassare l'HTML con `@scriba-editor/sanitize-server`.
