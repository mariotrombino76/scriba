# @scriba-editor/plugin-autosave

**Bozza automatica** per l'editor Scriba, come l'autosave di TinyMCE: mentre scrivi, una copia del
documento viene tenuta nel browser; se la scheda si chiude per sbaglio puoi ripristinarla da
"File > Ripristina ultima bozza".

## Installazione

```bash
pnpm add @scriba-editor/plugin-autosave
```

## Uso

```ts
import { autosave, clearDraft, restoreDraftItem } from '@scriba-editor/plugin-autosave'

// una chiave per documento: bozze di documenti diversi non si mescolano
const draftOptions = { key: 'scriba:nota-42', delay: 2000 }

const state = EditorState.create({ schema, plugins: [history(), autosave(draftOptions) /* … */] })

// voce del menu File
menubar.menus = [{ id: 'file', label: 'menu.file', items: [restoreDraftItem(draftOptions, t)] }]

// dopo il salvataggio vero sul server: la bozza non serve più
clearDraft(draftOptions)
```

## Opzioni (`AutosaveOptions`)

| Opzione     | Default        | Descrizione                                                                       |
| ----------- | -------------- | --------------------------------------------------------------------------------- |
| `key`       | (obbligatoria) | Chiave della bozza, una per documento.                                            |
| `delay`     | `2000`         | Attesa in ms dopo l'ultima modifica prima di salvare.                             |
| `storage`   | `localStorage` | Qualsiasi oggetto con `getItem`, `setItem`, `removeItem`; `null` per disattivare. |
| `maxLength` | `2000000`      | Dimensione massima della bozza (caratteri di JSON): oltre non si salva.           |

## Cosa esporta

- `autosave(options)`: plugin che salva dopo la prima modifica (non il documento appena aperto),
  `delay` ms dopo l'ultima. Salva subito anche quando la pagina si nasconde (`visibilitychange`),
  si chiude (`pagehide`) o l'editor viene distrutto.
- `readDraft(schema, options)`: la bozza validata, `{ doc, savedAt }`, oppure `null`.
- `restoreDraft(view, options)`: mette la bozza nell'editor come **un solo passo annullabile**;
  `false` se non c'è o se un plugin rifiuta la modifica (es. blocco protetto).
- `draftTransaction(state, draft)`: la transazione minima dal documento attuale alla bozza.
- `clearDraft(options)`: cancella la bozza; chiamala dopo il salvataggio reale e al logout.
- `restoreDraftItem(options, t?)`: voce "Ripristina ultima bozza", attiva solo se esiste una bozza
  diversa dal documento. Con `t`, un ripristino rifiutato è spiegato in una finestra.
- Tipi: `AutosaveOptions`, `DraftStorage`.

## Note

- **Privacy:** la bozza resta su questo dispositivo, **non cifrata**, in `localStorage`. Attivala
  solo dove è accettabile (computer condivisi, dati sensibili) e chiama `clearDraft` al logout.
- **Sicurezza:** il contenuto del browser è input non fidato, altri script della pagina possono
  averlo scritto. `readDraft` lo valida con `schema.nodeFromJSON`: una bozza non valida o troppo
  grande viene ignorata. Vedi [sicurezza](../../../docs/sicurezza.md).
- Se lo storage è pieno o bloccato (impostazioni privacy, iframe isolati) l'editor continua a
  funzionare, senza bozza.
- Il ripristino tocca solo i blocchi che differiscono, quindi i blocchi protetti invariati non
  vengono riscritti.
- Il testo della voce usa le chiavi i18n `autosave.*`. Vedi [plugin](../../../docs/plugin.md).
