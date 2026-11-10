# @scriba-editor/plugin-list

Elenchi puntati e numerati, anche annidati, con Tab / Maiusc+Tab, per l'editor Scriba. Include gli
stili degli elenchi come l'"advlist" di TinyMCE (forma del punto, numerazione `1 a A i I`).

```bash
pnpm add @scriba-editor/plugin-list
```

## Uso

```ts
import { keymap } from '@scriba-editor/core'
import {
  listIndentCommands,
  listKeymap,
  listNodes,
  listStyleMenus,
  listToolbarItems,
} from '@scriba-editor/plugin-list'

// schema: nodes: { ...basicSchemaSpec.nodes, ...listNodes }
// (serve un nodo `paragraph`: ogni voce inizia con un paragrafo)

// stato dell'editor: priorità più alta del keymap di base
plugins: [keymap(listKeymap(schema), { priority: 50 })]

// barra degli strumenti: senza i pulsanti di rientro, se li fornisce plugin-text-style
const items = listToolbarItems(schema, { indent: false })
const menus = listStyleMenus(schema) // forma del punto, numerazione
const indent = listIndentCommands(schema) // { more, less } da unire al rientro dei blocchi
```

## Nodi (`listNodes`)

| Nodo           | HTML   | Attributi                                                          |
| -------------- | ------ | ------------------------------------------------------------------ |
| `bullet_list`  | `<ul>` | `bullet`: `null` (disco), `circle`, `square`                       |
| `ordered_list` | `<ol>` | `start` (0–1 000 000), `numbering`: `null` (1), `a`, `A`, `i`, `I` |
| `list_item`    | `<li>` | contenuto `paragraph block*`                                       |

In lettura sono capiti anche gli stili `list-style-type` usati da Word (`lower-alpha`,
`upper-roman`…), ma l'output usa solo gli attributi tipizzati.

## Scorciatoie (`listKeymap`)

| Tasto                   | Azione                                         |
| ----------------------- | ---------------------------------------------- |
| Invio                   | Nuova voce; in una voce vuota esce dall'elenco |
| Tab / Maiusc+Tab        | Annida / disannida la voce                     |
| Backspace a inizio voce | Disannida                                      |
| Ctrl/Cmd+Maiusc+8       | Elenco puntato                                 |
| Ctrl/Cmd+Maiusc+7       | Elenco numerato                                |

Con `@scriba-editor/plugin-markdown` si può anche digitare `- `, `* `, `+ ` o `1. ` a inizio riga.

## Esportazioni

| Nome                                                                                                                                       | Cosa fa                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `listNodes`, `NUMBERINGS`, `Numbering`, `BulletStyle`                                                                                      | Nodi e tipi.                                                   |
| `listKeymap(schema)`                                                                                                                       | Le scorciatoie sopra.                                          |
| `listToolbarItems(schema, { indent? })`                                                                                                    | Pulsanti: puntato, numerato e (salvo `indent: false`) rientro. |
| `listStyleMenus(schema)`                                                                                                                   | Menu "stile punto" e "numerazione".                            |
| `listIndentCommands(schema)`                                                                                                               | `{ more, less }`: comandi di rientro delle voci.               |
| `toggleList`, `wrapInList`, `splitListItem`, `sinkListItem`, `liftListItem`, `liftListItemAtStart`, `setListStyle`, `isInList`, `listAttr` | Comandi `(state, dispatch?) => boolean`.                       |

`toggleList` fuori da un elenco lo crea, in un elenco dello stesso tipo ne toglie le voci, in uno di
altro tipo cambia il tipo.

## Note

- I comandi chiamati senza `dispatch` dicono solo se sono eseguibili (abilitano i pulsanti).
- Gli attributi degli elenchi sono validati dallo schema (valori enumerati, intero limitato per
  `start`): niente `style` libero in uscita. Vedi [sicurezza](../../../docs/sicurezza.md).
- I pulsanti hanno `aria-pressed` quando il cursore è in un elenco di quel tipo. Vedi
  [accessibilità](../../../docs/accessibilita.md) e [plugin](../../../docs/plugin.md).
