# @scriba-editor/plugin-bubble

**Menu "bubble"** per l'editor Scriba: una piccola barra di formattazione che compare sopra il
testo selezionato (grassetto, link, commento…). TinyMCE la chiama "quickbars" / selection toolbar.

## Installazione

```bash
pnpm add @scriba-editor/plugin-bubble
```

## Uso

```ts
import { bubbleKeymap, bubbleMenu } from '@scriba-editor/plugin-bubble'
import { markItems } from '@scriba-editor/ui'
import { linkToolbarItems } from '@scriba-editor/plugin-link'

const state = EditorState.create({
  schema,
  plugins: [
    bubbleMenu({
      items: [...markItems(schema), ...linkToolbarItems(schema, t)],
      t,
      mac: false,
    }),
    keymap(bubbleKeymap(), { priority: 80, readOnly: true }),
    // …
  ],
})
```

## Opzioni (`BubbleMenuOptions`)

| Opzione | Descrizione                                                                     |
| ------- | ------------------------------------------------------------------------------- |
| `items` | I controlli della barra (`ToolbarItem[]`), gli stessi della toolbar principale. |
| `t`     | Traduttore di `@scriba-editor/i18n` (etichetta della barra: chiave `bubble.label`).    |
| `mac`   | Se mostrare le scorciatoie come ⌘ (default: rilevamento della piattaforma).     |

## Cosa esporta

- `bubbleMenu(options)`: il plugin; la barra è un normale `scriba-toolbar` con la classe
  `scriba-bubble`.
- `bubbleKeymap()`: la scorciatoia **Alt+F10**, che porta il focus dentro la barra quando è visibile.
- Tipo `BubbleMenuOptions`.

## Comportamento e accessibilità

- Compare con una selezione di testo non vuota e il focus nell'editor (o nella barra).
- Non compare mentre il mouse sta ancora selezionando, nei blocchi di codice e quando l'editor è in
  sola lettura. Chi può solo commentare (`canAnnotate`) la vede, con attivi solo i controlli
  permessi.
- Si posiziona sopra la selezione, o sotto se manca spazio; dopo un tocco va **sotto**, lasciando
  libero lo spazio sopra al menu di sistema (copia, incolla).
- Tastiera: Alt+F10 entra nella barra; una sola tappa di tabulazione, frecce per muoversi, Esc
  riporta al testo. Esc nell'editor chiude la barra finché la selezione resta la stessa.
- Ha `role="toolbar"` e stato `aria-pressed` come la toolbar principale; vedi
  [accessibilità](../../../docs/accessibilita.md).

## Note

- Il posizionamento usa il CSSOM (`style.top`, `style.left`), compatibile con una CSP rigida
  ([sicurezza](../../../docs/sicurezza.md)).
- Il plugin non conosce i comandi dei singoli plugin: gli passi tu gli elementi. Vedi
  [plugin](../../../docs/plugin.md).
