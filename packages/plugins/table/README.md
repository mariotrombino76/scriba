**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-table

Tables on par with TinyMCE tables (including the advanced ones): insertion with a size picker, rows and columns, merged and split cells, headers, cell selection, column widths, table and cell properties, sorting by column, pasting cells as in a spreadsheet.

```bash
pnpm add @scriba-editor/plugin-table
```

## Usage

```ts
import { keymap } from '@scriba-editor/core'
import {
  tableContextMenu,
  tableKeymap,
  tableNodes,
  tablePlugins,
  tableToolbarItems,
} from '@scriba-editor/plugin-table'

const schema = new Schema({ nodes: { ...basicSchemaSpec.nodes, ...tableNodes }, marks })

const plugins = [
  ...tablePlugins(), // normalization, cell selection, column resizing, cell paste
  keymap(tableKeymap(), { priority: 55 }), // above lists: Tab moves between cells
]

// toolbar: ...tableToolbarItems(schema, t)   // "Insert table" (8x10 picker) + contextual "Table" menu
// context menu: tableContextMenu(schema, t)
```

## Exports

| Name                                                                                                                | What it does                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tableNodes`                                                                                                        | Nodes `table`, `table_row`, `table_cell`, `table_header` (typed attributes: `colspan`, `rowspan`, `colwidth`, `background`, `valign`, borders, `caption`, `align`) |
| `tablePlugins()`                                                                                                    | Normalization (rectangular tables) and view: selected cells, columns, paste                                                                                        |
| `tableKeymap()`                                                                                                     | Tab, Shift+Tab, Shift+arrow keys, arrow keys to leave the table, Backspace/Delete                                                                                  |
| `tableToolbarItems(schema, t)`                                                                                      | Insert menu and "Table" menu (visible only inside a table)                                                                                                         |
| `tableContextMenu(schema, t)`                                                                                       | Context menu section: Cell, Row, Column, properties, delete                                                                                                        |
| `insertTable(rows, cols, headerRow?)`                                                                               | Inserts a table (at most `MAX_ROWS` = 50 rows and `MAX_COLS` = 20 columns)                                                                                         |
| `addRow(before)`, `addColumn(before)`, `deleteRow`, `deleteColumn`, `deleteTable`                                   | Structure                                                                                                                                                          |
| `mergeCells`, `splitCell`                                                                                           | Merge and split cells                                                                                                                                              |
| `toggleHeader('row' \| 'column')`, `isHeaderOn(state, kind)`                                                        | Row or column headers                                                                                                                                              |
| `changeColumnWidth(delta, defaultWidth?)`, `setColumnWidths`                                                        | Column widths                                                                                                                                                      |
| `setCellProps(props)`, `setTableProps(props)`                                                                       | Cell and table properties (background color, borders, vertical alignment, caption, ...)                                                                            |
| `sortTable(order, options?)`                                                                                        | Sorts the rows by the column of the selected cell (`'asc'` or `'desc'`)                                                                                            |
| `pasteCells(state, content)`                                                                                        | Pastes a table into another one starting from the selected cell, enlarging the table                                                                               |
| `goToCell(dir)`, `selectedRect(state)`                                                                              | Navigation and selected rectangle                                                                                                                                  |
| `openTableDialog(view, t)`, `openTablePropsDialog`, `openCellDialog`                                                | Dialogs (size, table properties, cell properties)                                                                                                                  |
| `CellSelection`, `TableGrid`, `buildTable`, `tableAt`, `cellPosAt`, `isCell`                                        | Cell selection and grid, for writing your own commands                                                                                                             |
| `compareCellText`, `parseLocaleNumber`, `SortOrder`, `SortOptions`                                                  | Comparison used by sorting                                                                                                                                         |
| `tableNormalize()`                                                                                                  | The normalization plugin alone (already included in `tablePlugins()`)                                                                                              |
| `MAX_SPAN` (100), `MIN_COL_WIDTH` (24), `MAX_COL_WIDTH` (2000), `MAX_BORDER_WIDTH` (10), `MAX_CAPTION_LENGTH` (500) | Limits                                                                                                                                                             |

### Sorting

`sortTable` compares numbers by value (using the language's format: `1.234,5` in Italian, `1,234.5` in English) and everything else alphabetically, ignoring case and accents ("2" before "10"). Header rows at the top stay in place, empty cells go to the bottom, equal values keep their order; it does not work with cells merged across several rows. The language is `options.locale`, otherwise the nearest `lang` to the editor.

## Keyboard

- **Tab / Shift+Tab**: next/previous cell (its content gets selected). Past the first or last cell they do nothing, so focus can leave the editor: **no keyboard trap**.
- **Shift+arrow keys**: create or extend a cell selection (at the edges of the cell text).
- **Arrow keys** past the first or last cell, when there is nothing before or after the table: a paragraph is created, so the cursor can always get out.
- **Backspace / Delete** with all cells selected delete the table; with fewer cells they empty them.

## Accessibility

The "Table" menu and the context menu are reachable from the keyboard; the table keeps its `th`/`td` semantics and can have a caption (`caption`). Dialogs have a focus trap and error messages in an `aria-live` region with `aria-invalid` on the invalid field; color controls have a labeled hex field. See [accessibility](../../../docs/accessibility.md).

## Security

All attributes are typed and validated: spans from 1 to 100, widths 24-2000 px, borders at most 10 px, normalized colors (never free-form `style`), captions at most 500 characters, hidden text (script, style, ...) excluded. Pasted rows and columns have a cap (anti-DoS). Pasted HTML (including from Word or Google Docs) goes through the schema parser; the server must still re-sanitize the HTML with `@scriba-editor/sanitize-server`. See [security](../../../docs/security.md) and [plugins](../../../docs/plugins.md).
