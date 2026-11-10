# @scriba-editor/plugin-help

Il menu "Aiuto" dell'editor Scriba: una finestra con **tutte le scorciatoie da tastiera**, divise
in gruppi e con un campo di ricerca. Come la finestra "Help" di TinyMCE (Alt+0), ma l'elenco si
costruisce da solo a partire dai pulsanti e dai menu realmente presenti, quindi non va mai fuori
sincronia.

```bash
pnpm add @scriba-editor/plugin-help
```

## Uso

```ts
import { keymap } from '@scriba-editor/core'
import {
  editingHelp,
  helpItem,
  helpKeymap,
  markdownHelp,
  navigationHelp,
  shortcutsFromItems,
  type HelpOptions,
} from '@scriba-editor/plugin-help'

const helpOptions: HelpOptions = {
  t,
  // letto all'apertura: i gruppi riflettono i pulsanti e i menu di quel momento
  groups: () => [
    shortcutsFromItems([...toolbar.items, ...menubar.menus.flatMap((m) => m.items)]),
    editingHelp({ slash: true, mentions: true }),
    markdownHelp(),
    navigationHelp({ bubble: true, contextMenu: true }),
  ],
}

// nello stato dell'editor
plugins: [keymap(helpKeymap(helpOptions), { priority: 80, readOnly: true })]

// nel menu Aiuto
const entry = helpItem(helpOptions)
```

## Opzioni (`HelpOptions`)

| Opzione  | Descrizione                                                                   |
| -------- | ----------------------------------------------------------------------------- |
| `t`      | Traduttore (obbligatorio).                                                    |
| `groups` | I gruppi da mostrare, in ordine: un array, o una funzione letta all'apertura. |
| `mac`    | Notazione dei tasti (Cmd/Ctrl); se manca viene rilevata.                      |

## Gruppi pronti

| Funzione                                    | Contenuto                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `shortcutsFromItems(items)`                 | Le scorciatoie dei pulsanti e dei menu, con le loro etichette; ogni combinazione compare una sola volta. |
| `editingHelp({ slash?, mentions? })`        | Tasti senza pulsante: a capo, incolla senza formato, Tab, Maiusc+Tab; `/` e `@` se usati.                |
| `markdownHelp()`                            | Le scorciatoie Markdown di `@scriba-editor/plugin-markdown` (`# `, `- `, `**testo**`, …).                |
| `navigationHelp({ bubble?, contextMenu? })` | Frecce, Esc, Alt+F10 (barra sulla selezione), Maiusc+F10 (menu contestuale).                             |

Un gruppo è `HelpGroup { id, title, shortcuts }` e una riga è `HelpShortcut { keys?, typed?, label }`
(`keys` sono combinazioni come `"Mod-b"`, `typed` è il testo da digitare): puoi aggiungere i tuoi.

## Esportazioni

`helpItem(options)` (voce "Scorciatoie da tastiera…", attiva anche in sola lettura),
`helpKeymap(options)`, `openHelpDialog(view, options)`, `shortcutsFromItems`, `editingHelp`,
`markdownHelp`, `navigationHelp`, tipi `HelpOptions`, `HelpGroup`, `HelpShortcut`.

## Scorciatoia

| Tasto | Azione                             |
| ----- | ---------------------------------- |
| Alt+0 | Apre la finestra delle scorciatoie |

Registra il keymap con `readOnly: true`.

## Accessibilità

Finestra modale con focus trap; il focus torna all'editor alla chiusura. Il campo di ricerca è
etichettato e filtra le righe; l'area scorrevole ha `role="region"` ed è raggiungibile da tastiera,
ogni gruppo è una tabella con intestazione; "nessun risultato" è annunciato (`role="status"`). La
finestra è costruita solo con `createElement` e `textContent`. Vedi
[accessibilità](../../../docs/accessibilita.md) e [plugin](../../../docs/plugin.md).
