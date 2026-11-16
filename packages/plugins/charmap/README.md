**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-charmap

**Special characters and emoji** for the Scriba editor: a dialog with categories, a character
grid and search by name (in Italian or English), like TinyMCE's "Special character" but with emoji
and names in two languages. It inserts plain text: no markup.

## Installation

```bash
pnpm add @scriba-editor/plugin-charmap
```

## Usage

```ts
import { charmapToolbarItem, openCharmapDialog } from '@scriba-editor/plugin-charmap'

// button (toolbar or Insert menu)
toolbarItems.push(charmapToolbarItem(t))

// slash menu item
const slashItem = {
  id: 'charmap',
  label: (tr) => tr('charmap.button'),
  keywords: ['emoji', 'simbolo', 'carattere', 'symbol'],
  icon: 'smile',
  run: (view) => openCharmapDialog(view, t),
}
```

`t` is the translator from `@scriba-editor/i18n` (`createTranslator('it')`).

## Exports

| Export                                 | Description                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `charmapToolbarItem(t, options?)`      | `charmap` button (`smile` icon); enabled only where the cursor is in text.           |
| `openCharmapDialog(view, t, options?)` | Opens the dialog; returns the `DialogHandle`.                                        |
| `insertCharacter(view, entry)`         | Inserts the character at the selection (as if typed) and adds it to the recent ones. |
| `searchCharacters(query)`              | Searches by name (Italian or English, without accents) or by the character itself.   |
| `recentCharacters()`                   | Last inserted characters (at most 20, only on this page).                            |
| `codePoints(text)`                     | Unicode code points, e.g. `U+20AC`.                                                  |
| `CHARACTERS`, `EMOJI_CATEGORIES`       | Data: categories and entries (`CharEntry`, `CategoryId`).                            |

Options (`CharmapOptions`):

- `locale`: language of the names, `'it'` or `'en'` (default: the page language, otherwise English);
- `columns`: characters per row in the grid (default 10, minimum 4).

Categories: recent, currencies, punctuation, math, arrows, Latin, Greek, symbols, smileys, people,
nature, food, objects, emoji symbols.

## Keyboard and accessibility

- The search field has focus when the dialog opens; Down arrow moves to the grid.
- Category tabs: Left/Right arrow keys, Home, End.
- Grid: arrow keys in two dimensions, Home, End; Enter inserts the character and closes.
- Every cell has an `aria-label` with the character's name; the dialog traps focus and returns it
  to the editor when it closes. See [accessibility](../../../docs/accessibility.md).

## Notes

- Only text is inserted (`insertText`): no HTML, so no risk of injection. See
  [security](../../../docs/security.md).
- The grid sets its columns via CSSOM, compatible with a strict CSP.
- See [plugins](../../../docs/plugins.md) for how to connect the buttons to the toolbar and the
  slash menu.
