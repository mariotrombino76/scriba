import { Plugin, type Schema } from '@scriba/core'
import type { MessageKey, Translate } from '@scriba/i18n'
import type { ContextMenuSection, ToolbarControl, ToolbarMenu, ToolbarMenuEntry } from '@scriba/ui'
import type { ViewPluginProps } from '@scriba/view'
import {
  addColumn,
  addRow,
  changeColumnWidth,
  deleteColumn,
  deleteRow,
  deleteTable,
  insertTable,
  isHeaderOn,
  pasteCells,
  mergeCells,
  selectedRect,
  splitCell,
  toggleHeader,
} from './commands.js'
import { openTableDialog } from './dialog.js'
import { openCellDialog, openTablePropsDialog } from './properties.js'
import { tableNormalize } from './normalize.js'
import { tableView } from './table-view.js'
import type { Command } from '@scriba/core'

export {
  tableNodes,
  isCell,
  MAX_SPAN,
  MIN_COL_WIDTH,
  MAX_COL_WIDTH,
  MAX_BORDER_WIDTH,
  MAX_CAPTION_LENGTH,
  type BorderStyle,
  type VerticalAlign,
  type TableAlign,
} from './nodes.js'
export { TableGrid, buildTable, type GridCell, type Rect, type BuildCell } from './grid.js'
export { CellSelection, tableAt, cellPosAt, type TableContext } from './cell-selection.js'
export {
  insertTable,
  addRow,
  addColumn,
  deleteRow,
  deleteColumn,
  mergeCells,
  splitCell,
  toggleHeader,
  isHeaderOn,
  changeColumnWidth,
  setColumnWidths,
  setCellProps,
  setTableProps,
  type CellProps,
  type TableProps,
  deleteTable,
  goToCell,
  pasteCells,
  selectedRect,
  MAX_ROWS,
  MAX_COLS,
} from './commands.js'
export { tableKeymap } from './keys.js'
export { tableNormalize } from './normalize.js'
export { openTableDialog } from './dialog.js'
export { openCellDialog, openTablePropsDialog } from './properties.js'

/**
 * Table support: normalization (rectangular tables, cell selections) and the
 * view helpers (selected cells, column resizing). Use with `tableNodes` in the
 * schema and `tableKeymap()` (priority above lists, so Tab moves between cells).
 */
export function tablePlugins(): Plugin[] {
  const props: ViewPluginProps = {
    pluginView: tableView,
    handlePasteContent(view, content) {
      const tr = pasteCells(view.state, content)
      if (!tr) return false
      view.dispatch(tr)
      return true
    },
  }
  return [tableNormalize(), new Plugin({ props: { ...props } })]
}

/** Size of the insert picker. */
const GRID_ROWS = 8
const GRID_COLS = 10

const inTable = (state: Parameters<Command>[0]) => !!selectedRect(state)

/** The structure commands of a table, by id (toolbar menu and context menu). */
function tableEntries(t: Translate) {
  const entry = (
    id: string,
    label: MessageKey,
    command: Command,
    isActive?: ToolbarMenuEntry['isActive'],
  ): ToolbarMenuEntry => ({
    id,
    label: (tr) => tr(label),
    command,
    ...(isActive ? { isActive, toggle: true } : {}),
  })
  return {
    rowBefore: entry('row_before', 'table.rowBefore', addRow(true)),
    rowAfter: entry('row_after', 'table.rowAfter', addRow(false)),
    colBefore: entry('col_before', 'table.colBefore', addColumn(true)),
    colAfter: entry('col_after', 'table.colAfter', addColumn(false)),
    deleteRow: entry('delete_row', 'table.deleteRow', deleteRow),
    deleteCol: entry('delete_col', 'table.deleteCol', deleteColumn),
    merge: entry('merge', 'table.merge', mergeCells),
    split: entry('split', 'table.split', splitCell),
    headerRow: entry('header_row', 'table.toggleHeaderRow', toggleHeader('row'), (s) =>
      isHeaderOn(s, 'row'),
    ),
    headerCol: entry('header_col', 'table.toggleHeaderCol', toggleHeader('column'), (s) =>
      isHeaderOn(s, 'column'),
    ),
    widen: entry('widen', 'table.widen', changeColumnWidth(20)),
    narrow: entry('narrow', 'table.narrow', changeColumnWidth(-20)),
    tableProps: {
      id: 'table_props',
      label: (tr) => tr('table.props'),
      command: (state) => inTable(state),
      run: (view) => openTablePropsDialog(view, t),
    } satisfies ToolbarMenuEntry,
    cellProps: {
      id: 'cell_props',
      label: (tr) => tr('table.cellProps'),
      command: (state) => inTable(state),
      run: (view) => openCellDialog(view, t),
    } satisfies ToolbarMenuEntry,
    deleteTable: entry('delete_table', 'table.delete', deleteTable),
  }
}

/** Toolbar: "Insert table" (size picker + dialog) and a contextual "Table" menu with the structure commands. */
export function tableToolbarItems(schema: Schema, t: Translate): ToolbarControl[] {
  const type = schema.nodes['table']
  if (!type) throw new RangeError('The schema has no "table" node (add tableNodes)')
  const e = tableEntries(t)
  // Size picker: hovering 3×4 highlights a 3×4 area; "More sizes…" opens the dialog.
  const sizes: ToolbarMenuEntry[] = []
  for (let r = 1; r <= GRID_ROWS; r++) {
    for (let c = 1; c <= GRID_COLS; c++) {
      sizes.push({
        id: `size_${r}x${c}`,
        label: (tr) => tr('table.gridSize', { rows: r, cols: c }),
        command: insertTable(r, c),
        cell: [r, c],
      })
    }
  }
  return [
    {
      type: 'menu',
      id: 'table',
      icon: 'table',
      label: (tr) => tr('table.insertMenu'),
      layout: 'size',
      columns: GRID_COLS,
      entries: [
        ...sizes,
        {
          id: 'more_sizes',
          label: (tr) => tr('table.moreSizes'),
          command: insertTable(1, 1),
          run: (view) => openTableDialog(view, t),
        },
      ],
    },
    {
      type: 'menu',
      id: 'table_menu',
      label: (tr) => tr('table.label'),
      text: t('table.label'),
      isVisible: inTable,
      entries: [
        e.rowBefore,
        e.rowAfter,
        e.colBefore,
        e.colAfter,
        e.deleteRow,
        e.deleteCol,
        e.merge,
        e.split,
        e.headerRow,
        e.headerCol,
        e.widen,
        e.narrow,
        e.tableProps,
        e.cellProps,
        e.deleteTable,
      ],
    },
  ]
}

/**
 * Context menu section in a table, like TinyMCE's: Cell, Row and Column
 * sub-menus, then table properties and delete.
 */
export function tableContextMenu(schema: Schema, t: Translate): ContextMenuSection {
  if (!schema.nodes['table'])
    throw new RangeError('The schema has no "table" node (add tableNodes)')
  const e = tableEntries(t)
  const sub = (id: string, label: MessageKey, entries: ToolbarMenuEntry[]): ToolbarMenu => ({
    type: 'menu',
    id,
    label: (tr) => tr(label),
    entries,
  })
  return {
    id: 'table',
    isVisible: inTable,
    items: [
      sub('table_cell', 'table.cell', [e.cellProps, e.merge, e.split]),
      sub('table_row', 'table.row', [e.rowBefore, e.rowAfter, e.deleteRow, e.headerRow]),
      sub('table_column', 'table.column', [
        e.colBefore,
        e.colAfter,
        e.deleteCol,
        e.headerCol,
        e.widen,
        e.narrow,
      ]),
      '|',
      e.tableProps,
      e.deleteTable,
    ],
  }
}
