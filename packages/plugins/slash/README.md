**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-slash

Command menu with `/` (`/table`, `/image`, `/heading`): a feature TinyMCE does not offer out of the box. You type `/` at the start of a line or after a space, filter by typing, and choose the item.

```bash
pnpm add @scriba-editor/plugin-slash
```

## Usage

```ts
import { keymap } from '@scriba-editor/core'
import {
  basicSlashItems,
  slashCommands,
  slashKeymap,
  type SlashItem,
} from '@scriba-editor/plugin-slash'

const slashItems: SlashItem[] = [
  ...basicSlashItems(schema), // paragraph and headings 1-3
  taskSlashItem(schema), // items provided by other plugins
  calloutSlashItem(schema),
  {
    id: 'bullet_list',
    label: (tr) => tr('list.bullet'),
    keywords: ['elenco', 'puntato', 'list', 'ul'],
    icon: 'bulletList',
    command: toggleList(schema.nodes['bullet_list']!, schema.nodes['list_item']!),
  },
]

const plugins = [
  ...slashCommands(slashItems, t),
  keymap(slashKeymap(slashItems, t), { priority: 110 }), // high priority
]
```

## Exports

| Name                                             | What it does                                                                                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slashCommands(items, t)`                        | The `/` menu plugin                                                                                                                                        |
| `slashKeymap(items, t)`                          | Keys while the menu is open                                                                                                                                |
| `basicSlashItems(schema)`                        | Paragraph and headings 1-3, for the types present in the schema                                                                                            |
| `SlashItem`                                      | `{ id, label(t), keywords?, icon?, command?, run?(view) }`: `command` acts on the document, `run` is for actions that use the view (e.g. opening a dialog) |
| `filterItems(items, query, t)`                   | The matching items: every word must appear in the label or the keywords; items that start with the query come first                                        |
| `fold(text)`                                     | Lowercase without accents ("Città" becomes "citta"): search ignores case and accents                                                                       |
| `chooseItem(view, item)`                         | Removes `/query` and runs the item                                                                                                                         |
| `getSlashState(state)`, `slashKey`, `SlashState` | Menu state                                                                                                                                                 |

## Keyboard

`/` at the start of a block or after a space opens the menu (never in inline code or in a code block). Up/Down arrow keys move the selection, Enter or Tab choose, Esc closes (the typed text stays). A space right after `/`, or after a search with no results, closes the menu and you keep typing. The query is at most 40 characters long.

## Accessibility

The menu is a `listbox` below the `/` (above it if there is no room below) while focus stays in the text; the editor points to the menu with `aria-controls` and to the highlighted item with `aria-activedescendant`, so screen readers announce the item as you type or move. With no results, "No commands" (`slash.none`) appears.

## Notes

- Labels and icons are text/SVG created by code, never HTML. You define the items: the menu loads nothing from outside.
- The position is set via CSSOM, so it works with a strict CSP.

See [plugins](../../../docs/plugins.md) and [accessibility](../../../docs/accessibility.md).
