# @scriba-editor/core

Il cuore di Scriba: modello di documento a schema, transazioni, selezione, comandi e API dei plugin. **Non tocca mai il DOM** e non dipende da alcun framework: funziona anche in Node.

```bash
pnpm add @scriba-editor/core
```

Di solito lo usi insieme a `@scriba-editor/view` (il rendering nel browser) e ai plugin; i wrapper
`@scriba-editor/vue`, `@scriba-editor/react` e `@scriba-editor/browser` lo includono già. Come funziona dentro, in
parole semplici: [Concetti](../../docs/concetti.md).

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
  toggleMark,
  serializeHTML,
} from '@scriba-editor/core'

const state = EditorState.create({
  schema: basicSchema,
  plugins: [
    history(),
    keymap(historyKeymap),
    keymap(formatKeymap(basicSchema)),
    keymap(baseKeymap),
  ],
})

// una transazione è una "mossa": il documento vecchio resta intatto
const tr = state.tr.insertText('Ciao', 1)
const next = state.apply(tr)

// un comando senza `dispatch` dice solo se si può eseguire
const grassetto = toggleMark(basicSchema.marks.bold!)
grassetto(next) // true/false
serializeHTML(next.doc) // '<p>Ciao</p>'
```

## Le parti principali

| Parte          | Esportazioni principali                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| Schema         | `Schema`, `NodeType`, `MarkType`, `NodeSpec`, `MarkSpec`, `basicSchema`, `basicSchemaSpec`                    |
| Documento      | `Node`, `Fragment`, `Mark`, `Slice`, `ResolvedPos` (alberi immutabili, posizioni intere)                      |
| Transazioni    | `Transform`, `Transaction`, `Step`, `ReplaceStep`, `AddMarkStep`, `RemoveMarkStep`, `SetAttrsStep`, `Mapping` |
| Stato          | `EditorState`, `Selection`, `TextSelection`, `NodeSelection`, `AllSelection`                                  |
| Plugin         | `Plugin`, `PluginKey`, `PluginSpec`, `StateField`                                                             |
| Comandi        | `Command`, `chainCommands`, `toggleMark`, `setBlockType`, `wrapIn`, `lift`, `splitBlock`, `undo`, `redo`…     |
| Scorciatoie    | `keymap`, `baseKeymap`, `historyKeymap`, `formatKeymap`                                                       |
| Annulla/ripeti | `history`, `undo`, `redo`, `ADD_TO_HISTORY`, `CLOSE_HISTORY`                                                  |
| HTML           | `parseHTML`, `serializeHTML`, `HTMLParser`, `HTMLSerializer`, `sanitizeUrl`, `HTMLLimitError`                 |

- Un **comando** è una funzione `(state, dispatch?, view?) => boolean`: senza `dispatch`
  risponde solo "si può fare?" (serve ad abilitare e disabilitare i pulsanti).
- Gli **step** sono atomici e invertibili: sono la base di annulla/ripeti e della collaborazione.
- Ogni plugin porta i suoi nodi o mark (da aggiungere allo schema), i suoi plugin e le sue
  scorciatoie: vedi [Plugin](../../docs/plugin.md).

## Sicurezza

L'HTML in ingresso non si copia mai nel documento: `parseHTML(schema, root, options?)` lo legge
dallo schema e **scarta tutto ciò che lo schema non conosce** (tag, attributi, stili, URL non
ammessi). `root` deve venire da un documento **inerte** (`DOMParser`, mai `innerHTML` nella
pagina attiva): `@scriba-editor/view` lo fa per te con `parseContent`. L'output di `serializeHTML` è
generato dal documento, con escape di testo e attributi, mai copiato dal DOM.

- Limiti contro la negazione del servizio: `HTMLParseOptions` ha `maxDepth` (default 256) e
  `maxNodes` (default 200 000); se superati il parser lancia `HTMLLimitError`.
- `sanitizeUrl` e gli helper di `css.ts` (`normalizeColor`, `normalizeLength`…) validano URL
  (whitelist di protocolli) e stili (attributi tipizzati, niente `style` libero).
- Il JSON si valida con `schema.nodeFromJSON(json)`, che lancia un errore per tutto ciò che lo
  schema rifiuta.
- Il core esegue solo codice DOM-free: puoi usarlo anche sul server, ma **l'HTML salvato va
  sempre ripassato da `@scriba-editor/sanitize-server`** con lo stesso schema.

Dettagli: [Sicurezza](../../docs/sicurezza.md).
