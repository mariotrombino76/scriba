# @scriba/plugin-callout

**Riquadri evidenziati** (callout) per l'editor Scriba: un box attorno a uno o più blocchi, con un
tipo (`info`, `tip`, `warning`, `danger`) per segnalare note, suggerimenti, avvisi e pericoli.

## Installazione

```bash
pnpm add @scriba/plugin-callout
```

## Uso

```ts
import { Schema, basicSchemaSpec } from '@scriba/core'
import { calloutNodes, calloutSlashItem, calloutToolbarItem } from '@scriba/plugin-callout'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...calloutNodes },
  marks: basicSchemaSpec.marks,
})

// menu slash e pulsante (menu Inserisci)
const slashItems = [calloutSlashItem(schema)]
const item = calloutToolbarItem(schema)
```

Nell'editor e nell'HTML salvato il riquadro è un `<aside class="scriba-callout" data-callout="…">`,
con lo stile del tema. Con Vue puoi dargli una vista con la scelta del tipo: il componente di
esempio `CalloutView` di `@scriba/vue`.

```ts
import { CalloutView, vueNodeView } from '@scriba/vue'

const view = new EditorView(el, {
  state,
  nodeViews: { callout: vueNodeView(CalloutView, { t }) },
})
```

## Cosa esporta

| Export                         | Descrizione                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `calloutNodes`                 | Nodo `callout` (gruppo `block`, contenuto `block+`) con l'attributo `kind` (default `info`).        |
| `CALLOUT_KINDS`                | I tipi ammessi: `info`, `tip`, `warning`, `danger`.                                                 |
| `CalloutKind`                  | Tipo TypeScript dei quattro valori.                                                                 |
| `isCalloutKind(value)`         | Verifica se un valore è un tipo ammesso.                                                            |
| `toggleCallout(schema, kind?)` | Comando: avvolge i blocchi selezionati in un riquadro di tipo `kind` (default `info`), o li toglie. |
| `calloutToolbarItem(schema)`   | Pulsante `callout`, premuto quando il cursore è dentro un riquadro (chiave i18n `callout.insert`).  |
| `calloutSlashItem(schema)`     | Voce del menu slash ("/riquadro"; parole chiave: callout, riquadro, nota, avviso, box, note).       |

## HTML

```html
<aside class="scriba-callout" data-callout="warning">…</aside>
```

Solo un `<aside>` con `data-callout` viene letto come riquadro; un `<aside>` qualunque preso da
una pagina web perde il riquadro e conserva solo il contenuto.

## Note

- Se il nodo `callout` manca dallo schema, `toggleCallout` lancia un `RangeError`: aggiungi
  `calloutNodes`.
- Il plugin definisce solo nodo e comandi: l'aspetto nell'editor lo dà la node view (qui
  `CalloutView` di `@scriba/vue`, oppure una tua).
- Sicurezza: il tipo è una lista chiusa; qualunque altro valore diventa `info`, e l'attributo
  viene validato dallo schema (`isCalloutKind`). Vedi [sicurezza](../../../docs/sicurezza.md).
- Per scrivere una node view propria vedi [plugin](../../../docs/plugin.md).
