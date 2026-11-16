**English** · [Italiano](README.it.md)

# @scriba-editor/ui

The Scriba UI as vanilla Web Components: toolbar, menu bar, menus, dialogs, right-click menu and inline mode. They work with any framework, or without one.

```bash
pnpm add @scriba-editor/ui @scriba-editor/view @scriba-editor/core @scriba-editor/i18n @scriba-editor/themes
```

The components talk to the editor only through **public commands**: a button is enabled exactly
when its command can run (and it is not in read-only mode).

## Usage

```ts
import { createTranslator } from '@scriba-editor/i18n'
import { defineScribaToolbar, defaultToolbarItems } from '@scriba-editor/ui'
import '@scriba-editor/themes/scriba.css'

// `view` is the EditorView from @scriba-editor/view, `schema` the editor schema
const t = createTranslator('it')

defineScribaToolbar() // registers <scriba-toolbar> (only once)
const toolbar = document.createElement('scriba-toolbar')
document.querySelector('#editor')!.before(toolbar)
toolbar.translator = t
toolbar.items = defaultToolbarItems(schema)
toolbar.view = view
```

Extra items from plugins (lists, tables, images…) are added to the array:
`[...defaultToolbarItems(schema), ...listToolbarItems(schema)]`. Full example in
[Getting started](../../docs/getting-started.md#custom-setup-with-the-packages).

## Exports

| Export                                                                                                                                      | Description                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ScribaToolbar`, `defineScribaToolbar()`                                                                                                    | `<scriba-toolbar>`: properties `view`, `items`, `translator`.                         |
| `ScribaMenubar`, `defineScribaMenubar()`                                                                                                    | `<scriba-menubar>`: menu bar (File, Edit…), properties `view`, `menus`, `translator`. |
| `defaultToolbarItems(schema)`                                                                                                               | The default items (history, formats, block styles…) for the given schema.             |
| `toolbarGroup`, `historyItems`, `markItems`, `blockStyleMenu`, `clearFormatItem`, `selectAllItem`, `nonBreakingSpaceItem`, `clipboardItems` | Builders for the individual items and groups.                                         |
| `ToolbarItem`, `ToolbarButton`, `ToolbarGroup`, `ToolbarMenu`, …                                                                            | Types for writing your own items (`id`, `label`, `command`, `isActive`, `shortcut`…). |
| `contextMenu(view, options)`                                                                                                                | Right-click menu: sections that apply where you click.                                |
| `MenuPopup`, `popupEntries`                                                                                                                 | Reusable popup menus.                                                                 |
| `openDialog`                                                                                                                                | Modal dialog (focus trap, focus return).                                              |
| `inlineToolbar(container, toolbar)`                                                                                                         | Inline mode: the toolbar appears only while you write. Returns `{ update, destroy }`. |
| `createIcon`, `formatShortcut`, `isMac`                                                                                                     | Icons and shortcut text (`Mod` = Ctrl or ⌘).                                          |

Button items (`ToolbarButton`) have `id`, `label: (t) => string`, `command`, and optional `icon`,
`shortcut`, `isActive`, `isVisible`, `priority` and `run` (a custom action, for example to open a
dialog).

## Accessibility

- `role="toolbar"` with arrow-key navigation (a single tab stop), `aria-pressed` state on active
  buttons, `aria-haspopup`/`aria-expanded` on menus, shortcuts in the tooltips.
- The menu bar follows the WAI-ARIA _menubar_ pattern; the right-click menu follows the _menu_
  pattern (also from the keyboard: Menu key and Shift+F10).
- Dialogs have a focus trap and return focus when closed; Esc closes them.
- When the toolbar does not fit on the screen, the less important items move into "More options".
- All texts come from the translator (`@scriba-editor/i18n`), never hard-coded strings.

Details: [Accessibility](../../docs/accessibility.md).

## Security and CSP

The components use neither `innerHTML` nor inline styles: dynamic styles go through the CSSOM, so
they work with a strict CSP (without `unsafe-inline`). Displayed texts (names, labels, translation
parameters) are always inserted as **text**, never as HTML. For the look (`--scriba-*` variables,
touch, sticky toolbar) see [@scriba-editor/themes](../themes/README.md).
