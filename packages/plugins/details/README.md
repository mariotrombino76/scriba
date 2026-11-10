# @scriba/plugin-details

**Sezioni comprimibili** (fisarmonica) per l'editor Scriba: un titolo cliccabile che mostra o
nasconde i blocchi sotto di sé. Nell'HTML sono i nativi `<details>` e `<summary>`. Come il plugin
"Accordion" di TinyMCE, ma inserito nello schema con regole chiare.

## Installazione

```bash
pnpm add @scriba/plugin-details
```

## Uso

```ts
import {
  detailsAutoOpen,
  detailsKeymap,
  detailsNodeView,
  detailsNodes,
  detailsSlashItem,
  detailsToggleItem,
  detailsToolbarItem,
} from '@scriba/plugin-details'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...detailsNodes },
  marks: basicSchemaSpec.marks,
})

const state = EditorState.create({
  schema,
  plugins: [keymap(detailsKeymap(), { priority: 70 }), detailsAutoOpen() /* … */],
})

const view = new EditorView(el, { state, nodeViews: { details: detailsNodeView(t) } })

// menu Inserisci e menu slash
const items = [detailsToolbarItem(schema), detailsToggleItem()]
const slash = detailsSlashItem(schema)
```

## Cosa esporta

| Export                                                                                                                                                             | Descrizione                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `detailsNodes`                                                                                                                                                     | Nodi `details` (attributo `open`, default `true`) e `details_summary` (titolo).     |
| `detailsNodeView(t)`                                                                                                                                               | Node view: pulsante per aprire/chiudere, titolo e contenuto.                        |
| `detailsKeymap()`                                                                                                                                                  | `Enter` nel titolo passa al contenuto; `Backspace` in una sezione vuota la rimuove. |
| `detailsAutoOpen()`                                                                                                                                                | Plugin: apre una sezione chiusa quando il cursore entra nel suo contenuto nascosto. |
| `detailsToolbarItem(schema)`                                                                                                                                       | Pulsante: mette i blocchi selezionati in una sezione, o li toglie.                  |
| `detailsToggleItem()`                                                                                                                                              | Voce di menu: apre o chiude la sezione al cursore (il modo da tastiera).            |
| `detailsSlashItem(schema)`                                                                                                                                         | Voce slash ("/fisarmonica", "/sezione", "/accordion"…).                             |
| `insertDetails(schema)`, `removeDetails(schema)`, `toggleDetailsOpen`, `setDetailsOpen(pos, open)`, `enterFromSummary`, `removeEmptyDetails`, `findDetails(state)` | Comandi e utilità.                                                                  |

HTML: `<details open><summary>Titolo</summary><p>…</p></details>`. Un `<details>` incollato senza
`<summary>` ottiene un titolo vuoto; un `<summary>` fuori da un `<details>` conserva solo il testo.

## Note

- Se chiudi una sezione con il cursore nel contenuto, il cursore si sposta alla fine del titolo
  (altrimenti sarebbe in un punto invisibile).
- In sola lettura il pulsante apre e chiude solo sullo schermo, senza modificare il documento.
- Accessibilità: il pulsante ha `aria-label` (`details.toggle`) e `aria-expanded`; non è nella
  tabulazione del testo, si raggiunge da tastiera con la voce di menu `detailsToggleItem()`. Vedi
  [accessibilità](../../../docs/accessibilita.md).
- Sicurezza: l'unico attributo è il booleano `open`, validato dallo schema; non ci sono stili o
  script. Vedi [sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md).
- L'aspetto (sezione nascosta quando chiusa) viene dal CSS del tema (`@scriba/themes`).
