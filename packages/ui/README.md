# @scriba-editor/ui

L'interfaccia di Scriba come Web Components vanilla: barra degli strumenti, barra dei menu, menu, dialog, menu del tasto destro e modalità inline. Funzionano con qualsiasi framework, o senza.

```bash
pnpm add @scriba-editor/ui @scriba-editor/view @scriba-editor/core @scriba-editor/i18n @scriba-editor/themes
```

I componenti parlano con l'editor solo tramite **comandi pubblici**: un pulsante è abilitato
esattamente quando il suo comando può essere eseguito (e non lo è in sola lettura).

## Uso

```ts
import { createTranslator } from '@scriba-editor/i18n'
import { defineScribaToolbar, defaultToolbarItems } from '@scriba-editor/ui'
import '@scriba-editor/themes/scriba.css'

// `view` è l'EditorView di @scriba-editor/view, `schema` lo schema dell'editor
const t = createTranslator('it')

defineScribaToolbar() // registra <scriba-toolbar> (una sola volta)
const toolbar = document.createElement('scriba-toolbar')
document.querySelector('#editor')!.before(toolbar)
toolbar.translator = t
toolbar.items = defaultToolbarItems(schema)
toolbar.view = view
```

Le voci aggiuntive dei plugin (liste, tabelle, immagini…) si aggiungono all'array:
`[...defaultToolbarItems(schema), ...listToolbarItems(schema)]`. Esempio completo in
[Iniziare](../../docs/iniziare.md#su-misura-con-i-pacchetti).

## Esportazioni

| Esportazione                                                                                                                                | Descrizione                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ScribaToolbar`, `defineScribaToolbar()`                                                                                                    | `<scriba-toolbar>`: proprietà `view`, `items`, `translator`.                                   |
| `ScribaMenubar`, `defineScribaMenubar()`                                                                                                    | `<scriba-menubar>`: barra dei menu (File, Modifica…), proprietà `view`, `menus`, `translator`. |
| `defaultToolbarItems(schema)`                                                                                                               | Le voci predefinite (cronologia, formati, stili dei blocchi…) per lo schema dato.              |
| `toolbarGroup`, `historyItems`, `markItems`, `blockStyleMenu`, `clearFormatItem`, `selectAllItem`, `nonBreakingSpaceItem`, `clipboardItems` | Costruttori delle singole voci e gruppi.                                                       |
| `ToolbarItem`, `ToolbarButton`, `ToolbarGroup`, `ToolbarMenu`, …                                                                            | Tipi per scrivere voci proprie (`id`, `label`, `command`, `isActive`, `shortcut`…).            |
| `contextMenu(view, options)`                                                                                                                | Menu del tasto destro: sezioni che si applicano dove si clicca.                                |
| `MenuPopup`, `popupEntries`                                                                                                                 | Menu a comparsa riusabili.                                                                     |
| `openDialog`                                                                                                                                | Dialog modale (focus trap, ritorno del focus).                                                 |
| `inlineToolbar(container, toolbar)`                                                                                                         | Modalità inline: la barra compare solo mentre si scrive. Restituisce `{ update, destroy }`.    |
| `createIcon`, `formatShortcut`, `isMac`                                                                                                     | Icone e testo delle scorciatoie (`Mod` = Ctrl o ⌘).                                            |

Le voci di un pulsante (`ToolbarButton`) hanno `id`, `label: (t) => string`, `command`,
facoltativi `icon`, `shortcut`, `isActive`, `isVisible`, `priority` e `run` (azione
personalizzata, ad esempio per aprire un dialog).

## Accessibilità

- `role="toolbar"` con navigazione a frecce (un solo punto di tabulazione), stato `aria-pressed`
  sui pulsanti attivi, `aria-haspopup`/`aria-expanded` sui menu, scorciatoie nei suggerimenti.
- La barra dei menu segue il pattern WAI-ARIA _menubar_; il menu del tasto destro il pattern
  _menu_ (anche da tastiera: tasto Menu e Maiusc+F10).
- I dialog hanno il focus trap e restituiscono il focus alla chiusura; Esc li chiude.
- Con la barra che non entra nello schermo, le voci meno importanti passano in "Altro".
- Tutti i testi vengono dal traduttore (`@scriba-editor/i18n`), mai stringhe fisse.

Dettagli: [Accessibilità](../../docs/accessibilita.md).

## Sicurezza e CSP

I componenti non usano `innerHTML` né stili inline: gli stili dinamici passano dal CSSOM, quindi
funzionano con una CSP rigida (senza `unsafe-inline`). I testi mostrati (nomi, etichette,
parametri di traduzione) sono sempre inseriti come **testo**, mai come HTML. Per l'aspetto
(variabili `--scriba-*`, tocco, barra fissa) vedi [@scriba-editor/themes](../themes/README.md).
