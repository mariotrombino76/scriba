# @scriba-editor/view

La "vetrina" di Scriba: mostra un `EditorState` nel browser con un `contentEditable` controllato, intercetta `beforeinput`, gestisce la composizione IME e sincronizza la selezione tra DOM e modello.

```bash
pnpm add @scriba-editor/view @scriba-editor/core
```

`@scriba-editor/view` non conosce i plugin specifici: parla con il core tramite stato e transazioni.

## Uso

```ts
import {
  EditorState,
  basicSchema,
  history,
  keymap,
  historyKeymap,
  formatKeymap,
  baseKeymap,
} from '@scriba-editor/core'
import { EditorView, parseContent, serializeContent } from '@scriba-editor/view'
import '@scriba-editor/themes/scriba.css'

const state = EditorState.create({
  doc: parseContent(basicSchema, '<p>Ciao</p>', 'html'),
  plugins: [
    history(),
    keymap(historyKeymap),
    keymap(formatKeymap(basicSchema)),
    keymap(baseKeymap),
  ],
})

const view = new EditorView(document.querySelector('#editor')!, {
  state,
  label: 'Editor di testo formattato',
  // opzionale: la nuova transazione va applicata e mostrata da te
  // dispatchTransaction(tr) { this.updateState(this.state.apply(tr)) },
})

// per salvare
const html = serializeContent(view.state.doc, 'html')
```

## `EditorView`

`new EditorView(place, options)` crea l'elemento `contentEditable` (classe `scriba-editor`,
`role="textbox"`, `aria-multiline="true"`) dentro `place`. Il browser non modifica mai il DOM da
solo: ogni input diventa una transazione e il DOM viene aggiornato dal modello, solo nei blocchi
cambiati.

| Opzione               | Significato                                                                        |
| --------------------- | ---------------------------------------------------------------------------------- |
| `state`               | Lo `EditorState` iniziale (obbligatorio).                                          |
| `dispatchTransaction` | Riceve ogni transazione. Default: `view.updateState(view.state.apply(tr))`.        |
| `editable`            | `(state) => boolean`: se il contenuto si può modificare. Default: sempre.          |
| `canAnnotate`         | `(state) => boolean`: in sola lettura, se si può ancora commentare.                |
| `label`               | Nome accessibile dell'area (`aria-label`).                                         |
| `nodeViews`           | Viste personalizzate dei nodi atomici, per nome del tipo (vedi `NodeViewFactory`). |

Membri principali: `state`, `dom`, `dispatch(tr)`, `updateState(state)`, `subscribe(listener)`
(restituisce la funzione per annullare l'iscrizione), `focus()`, `hasFocus()`, `editable`,
`posAtCoords(x, y)`, `posAtDOM(node, offset)`, `domAtPos(pos)`, `destroy()`.

## Contenuto: HTML o JSON

| Funzione                              | Descrizione                                                         |
| ------------------------------------- | ------------------------------------------------------------------- |
| `parseContent(schema, value, format)` | Costruisce un documento da HTML (`'html'`) o JSON (`'json'`).       |
| `serializeContent(doc, format)`       | Serializza il documento (stringa HTML o oggetto JSON).              |
| `sameContent(a, b)`                   | Uguaglianza strutturale di due contenuti (evita cicli nei wrapper). |
| `Content`, `ContentFormat`            | Tipi: `string \| NodeJSON` e `'html' \| 'json'`.                    |

Altre esportazioni: `renderSpec`, `parseInertHTML`, `TRUSTED_TYPES_POLICY`, `DecorationIndex`,
`stateDecorations`, `someProp`, i tipi `NodeView`, `NodeViewFactory`, `PluginView`,
`ViewPluginProps`, `ClipboardContent`, `TransformPastedDOM`.

## Sicurezza

- Il contenuto che entra (`parseContent`, incolla, vista sorgente, trascinamento) è **input non
  fidato**: l'HTML viene letto con `parseInertHTML` in un **documento inerte** (`DOMParser`,
  mai `innerHTML` nella pagina attiva) e ricostruito dal parser dello schema; ciò che lo schema
  non conosce viene scartato. Il JSON è validato da `schema.nodeFromJSON`.
- Gli stili dinamici passano dal CSSOM (`el.style…`), mai da attributi `style` né da tag `<style>`
  iniettati: l'editor funziona con una CSP rigida.
- Con `require-trusted-types-for 'script'` consenti la policy `scriba` (`TRUSTED_TYPES_POLICY`)
  nella direttiva `trusted-types`: serve solo a leggere l'HTML in un documento inerte.
- L'HTML in uscita nasce dal documento, ma quello **salvato** va sempre ripassato sul server da
  `@scriba-editor/sanitize-server`.

Dettagli: [Sicurezza](../../docs/sicurezza.md), [Accessibilità](../../docs/accessibilita.md),
[Concetti](../../docs/concetti.md).
