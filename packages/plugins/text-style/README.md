**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-text-style

Text formatting as in TinyMCE: alignment, indentation, line height, direction (LTR/RTL), text and background color, font and size, letter case, and **styles with classes** from your site (`style_formats`). Colors and fonts are typed marks, not free `style`.

```bash
pnpm add @scriba-editor/plugin-text-style
```

## Usage

```ts
import { keymap } from '@scriba-editor/core'
import {
  alignmentMenu,
  caseMenu,
  classFormatsMenu,
  classMarks,
  colorItems,
  directionItems,
  fontItems,
  indentItems,
  lineHeightMenu,
  textStyleKeymap,
  textStyleMarks,
  withBlockClasses,
  withBlockStyles,
} from '@scriba-editor/plugin-text-style'

const BLOCK_CLASSES = ['margin-note', 'warning'] // classes your site styles

const schema = new Schema({
  nodes: withBlockClasses(withBlockStyles({ ...basicSchemaSpec.nodes /* ... */ }), BLOCK_CLASSES),
  marks: { ...basicSchemaSpec.marks, ...textStyleMarks, ...classMarks(['highlight']) },
})

const plugins = [
  keymap(textStyleKeymap({ indent: listIndentCommands(schema) })), // Tab in lists and indentation with a single key
]

// toolbar and menus
const items = [
  alignmentMenu(),
  ...indentItems(),
  ...colorItems(schema),
  ...fontItems(schema),
  lineHeightMenu(),
  ...directionItems(),
  caseMenu('it'),
  classFormatsMenu(schema, [{ label: 'Margin note', class: 'margin-note', kind: 'block' }]),
]
```

## Exports

| Name                                                                                                                                                  | What it does                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `textStyleMarks`                                                                                                                                      | Marks `text_color`, `background_color`, `font_family`, `font_size` (validated and normalized values)                 |
| `withBlockStyles(nodes, names?)`                                                                                                                      | Adds `align`, `indent` (0-8, 2em per level), `lineHeight` and `dir` to text blocks (default: `paragraph`, `heading`) |
| `withBlockClasses(nodes, classes, names?)`                                                                                                            | Adds `className` (only from the list) to blocks                                                                      |
| `classMarks(classes)`                                                                                                                                 | Mark `text_class`: a `<span class>` with one of the classes                                                          |
| `textStyleKeymap(options?)`                                                                                                                           | Alignment (Shift+Mod+L/E/R/J), indentation (Mod+] / Mod+[) and Backspace that removes the indent                     |
| `textStyleToolbarItems(schema, options?)`                                                                                                             | Alignment, indents, colors and fonts in one go                                                                       |
| `alignmentMenu()`, `indentItems(options?)`, `colorItems(schema, options?)`, `fontItems(schema, options?)`                                             | Individual controls                                                                                                  |
| `lineHeightMenu()`                                                                                                                                    | Line height: theme default and allowed values (1, 1.15, 1.5, 2)                                                      |
| `directionItems()`                                                                                                                                    | Left-to-right and right-to-left buttons (`dir-ltr`, `dir-rtl`)                                                       |
| `caseMenu(locale?)`, `changeCase(kind, locale?)`, `LETTER_CASES`                                                                                      | lowercase, UPPERCASE, Title Case, Sentence case                                                                      |
| `classFormatsMenu(schema, formats)`, `ClassFormat`                                                                                                    | Format ▸ Styles menu with your classes (`kind: 'block'` or `'inline'`)                                               |
| `setTextAlign`, `changeIndent`, `outdentAtStart`, `setLineHeight`, `setTextDirection`, `isAligned`, `hasLineHeight`, `hasTextDirection`, `MAX_INDENT` | Commands and checks on blocks                                                                                        |
| `setMarkValue(type, attrs \| null)`, `markValue(state, type, attr)`                                                                                   | Applies, removes and reads a mark with a value                                                                       |
| `setBlockClass(name \| null)`, `hasBlockClass`, `CLASS_NAME`                                                                                          | Classes on blocks                                                                                                    |
| `defaultTextColors`, `defaultBackgroundColors`, `defaultFontFamilies`, `defaultFontSizes`                                                             | Default lists (text colors have a contrast of at least 4.5:1 on white)                                               |
| `TextStyleOptions`, `ColorOption`                                                                                                                     | `textColors`, `backgroundColors`, `fontFamilies`, `fontSizes`, `indent`                                              |

### Options (`TextStyleOptions`)

`textColors` and `backgroundColors` (`{ name, value }`: `name` is an i18n key for the accessible name), `fontFamilies` (`{ label, value }`), `fontSizes` (e.g. `'12pt'`) and `indent` (`{ more?, less? }`: commands tried before the block indentation, for example list nesting, so a single pair of buttons and keys handles everything).

## Keyboard

| Keys                              | Action                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Shift+Mod+L / E / R / J           | Align left / center / right / justify                                          |
| Mod+] / Mod+[                     | Increase / decrease indent                                                     |
| Backspace at the start of a block | Removes one indent level; the block stays as it is (a heading stays a heading) |

## Accessibility

Menus show the name, icon and shortcut of each item and the active state (`isActive`); color swatches have an accessible name (`color.name.*`) and do not rely on color alone; the font menus show the current value like a `select`.

## Security

No free `style` (CLAUDE.md 5.4): colors only as `#rrggbb`/`rgb()`/normalized names, font families and lengths validated (`normalizeColor`, `normalizeFontFamily`, `normalizeLength`), line height and alignment from closed lists. The only **classes** are the ones you list (`[a-z][a-z0-9-]{0,63}`, never `scriba-...`; an invalid list throws `RangeError`): every other class is discarded, so `MsoNormal` and similar classes pasted from Word never get in. Use the same lists on the server with `@scriba-editor/sanitize-server`. See [security](../../../docs/security.md) and [plugins](../../../docs/plugins.md).
