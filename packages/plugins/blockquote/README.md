# @scriba-editor/plugin-blockquote

Blocchi di **citazione** per l'editor Scriba: avvolge uno o più blocchi in una `<blockquote>`, o li
toglie dalla citazione. Equivale al pulsante "Citazione" di TinyMCE, ma il contenuto resta
vincolato allo schema (una citazione contiene sempre blocchi, mai testo "libero").

## Installazione

```bash
pnpm add @scriba-editor/plugin-blockquote
```

## Uso

```ts
import { Schema, basicSchemaSpec } from '@scriba-editor/core'
import {
  blockquoteNodes,
  blockquoteToolbarItems,
  toggleBlockquote,
} from '@scriba-editor/plugin-blockquote'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...blockquoteNodes },
  marks: basicSchemaSpec.marks,
})

// pulsante nella barra degli strumenti (gruppo "blocchi")
toolbar.items = [toolbarGroup('blocks', 'toolbar.group.blocks', blockquoteToolbarItems(schema))]

// voce nel menu slash ("/citazione")
const quote = {
  id: 'quote',
  label: (t) => t('block.blockquote'),
  keywords: ['citazione', 'quote'],
  icon: 'quote',
  command: toggleBlockquote(schema),
}
```

## Cosa esporta

| Export                           | Descrizione                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `blockquoteNodes`                | Nodo `blockquote` (gruppo `block`, contenuto `block+`) da aggiungere allo schema.    |
| `toggleBlockquote(schema)`       | Comando: avvolge i blocchi selezionati in una citazione, o li toglie se già dentro.  |
| `blockquoteToolbarItems(schema)` | Pulsante `blockquote` (icona `quote`, premuto quando il cursore è in una citazione). |

HTML letto e scritto: `<blockquote>…</blockquote>`, senza attributi.

## Note

- Lo schema deve avere il gruppo `block` (lo ha `basicSchemaSpec`). Se manca il nodo `blockquote`,
  `toggleBlockquote` e `blockquoteToolbarItems` lanciano un `RangeError`: aggiungi `blockquoteNodes`.
- Il comando segue la regola `(state, dispatch?) => boolean`: senza `dispatch` dice solo se può
  essere eseguito (serve ad abilitare o disabilitare il pulsante).
- Il testo del pulsante usa la chiave i18n `block.blockquote` (pacchetto `@scriba-editor/i18n`).
- Sicurezza: l'HTML incollato o caricato passa dal parser dello schema, che accetta solo
  `<blockquote>` senza attributi; vedi [sicurezza](../../../docs/sicurezza.md) e
  [plugin](../../../docs/plugin.md).
- Accessibilità: il pulsante è nella toolbar con `aria-pressed` e navigazione a frecce; vedi
  [accessibilità](../../../docs/accessibilita.md).
