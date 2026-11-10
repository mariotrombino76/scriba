# @scriba/plugin-merge-tags

Campi di unione come i "merge tags" di TinyMCE: segnaposto `{{cliente.nome}}` che la tua applicazione riempie in seguito (lettere, e-mail, contratti).

```bash
pnpm add @scriba/plugin-merge-tags
```

## Uso

```ts
import { keymap } from '@scriba/core'
import { mergeTagMenu, mergeTagNodes, mergeTags, type MergeTag } from '@scriba/plugin-merge-tags'

const tags: MergeTag[] = [
  { name: 'cliente.nome', label: 'Nome', group: 'Cliente' },
  { name: 'cliente.email', label: 'E-mail', group: 'Cliente' },
  { name: 'data_oggi', label: 'Data di oggi' },
]

const schema = new Schema({ nodes: { ...basicSchemaSpec.nodes, ...mergeTagNodes }, marks })

const suggest = mergeTags(tags, t)
const plugins = [...suggest.plugins, keymap(suggest.keymap(), { priority: 110 })]
// nella toolbar, menu Inserisci: mergeTagMenu(tags)
```

Riempire i valori (testo semplice, la formattazione intorno resta):

```ts
const filled = fillMergeTags(state.doc, { 'cliente.nome': 'Anna Rossi' })
```

## Esportazioni

| Nome                                                           | Cosa fa                                                                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `mergeTagNodes`                                                | Nodo inline atomico `merge_tag`. HTML: `<span data-merge-tag="cliente.nome">{{cliente.nome}}</span>` |
| `mergeTags(tags, t)`                                           | Restituisce `{ plugins, keymap() }`: scrivendo `{{` si apre l'elenco, filtrato per nome o etichetta  |
| `mergeTagMenu(tags)`                                           | Voce di menu "Campo di unione" con una riga per ogni tag                                             |
| `insertMergeTag(name)`                                         | Comando: inserisce il tag al cursore (sostituisce la selezione); non agisce nei blocchi di codice    |
| `fillMergeTags(doc, values)`                                   | Documento con ogni tag sostituito dal suo valore; un tag senza valore resta com'è                    |
| `mergeTagsIn(state)`                                           | Nomi dei tag usati, in ordine e senza ripetizioni                                                    |
| `isMergeTagName`, `MERGE_TAG_NAME`, `MAX_MERGE_TAG_NAME` (100) | Validazione del nome                                                                                 |
| `MergeTag`                                                     | `{ name, label, group? }`                                                                            |

## Tastiera e accessibilità

Con l'elenco `{{` aperto: frecce Su/Giù, Invio o Tab per scegliere, Esc per chiudere. L'elenco è un `listbox` con focus nel testo, come per le menzioni (vedi [@scriba/plugin-mention](../mention/README.md), di cui riusa `createSuggestion`). L'etichetta mostrata è `Gruppo › Etichetta`, a te la traduzione.

## Sicurezza

- Il nome è **solo** `[a-z0-9_.]` (segmenti separati da punto, al massimo 100 caratteri): niente markup, niente spazi. Un nome diverso nell'HTML in ingresso fa scartare il nodo.
- L'elenco dei tag è configurazione, non input: un nome non valido lancia `RangeError` subito.
- `fillMergeTags` inserisce i valori **come testo**, mai come HTML. Se li prendi da dati utente, il server deve comunque ripassare l'HTML finale con `@scriba/sanitize-server`.

Vedi [sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md).
