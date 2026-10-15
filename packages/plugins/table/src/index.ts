import { Plugin, type Schema } from '@scriba/core'
import type { MessageKey, Translate } from '@scriba/i18n'
import type { ToolbarControl, ToolbarMenuEntry } from '@scriba/ui'
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
import { tableNormalize } from './normalize.js'
import { tableView } from './table-view.js'
import type { Command } from '@scriba/core'

export { tableNodes, isCell, MAX_SPAN, MIN_COL_WIDTH, MAX_COL_WIDTH } from './nodes.js'
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

const inTable = (state: Parameters<Command>[0]) => !!selectedRect(state)

/** Toolbar: "Insert table" (dialog) and a contextual "Table" menu with the structure commands. */
export function tableToolbarItems(schema: Schema, t: Translate): ToolbarControl[] {
  const type = schema.nodes['table']
  if (!type) throw new RangeError('The schema has no "table" node (add tableNodes)')
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
  return [
    {
      type: 'button',
      id: 'table',
      icon: 'table',
      label: (tr) => tr('table.insert'),
      command: insertTable(1, 1),
      run: (view) => openTableDialog(view, t),
    },
    {
      type: 'menu',
      id: 'table_menu',
      label: (tr) => tr('table.label'),
      text: t('table.label'),
      isVisible: inTable,
      entries: [
        entry('row_before', 'table.rowBefore', addRow(true)),
        entry('row_after', 'table.rowAfter', addRow(false)),
        entry('col_before', 'table.colBefore', addColumn(true)),
        entry('col_after', 'table.colAfter', addColumn(false)),
        entry('delete_row', 'table.deleteRow', deleteRow),
        entry('delete_col', 'table.deleteCol', deleteColumn),
        entry('merge', 'table.merge', mergeCells),
        entry('split', 'table.split', splitCell),
        entry('header_row', 'table.toggleHeaderRow', toggleHeader('row'), (s) =>
          isHeaderOn(s, 'row'),
        ),
        entry('header_col', 'table.toggleHeaderCol', toggleHeader('column'), (s) =>
          isHeaderOn(s, 'column'),
        ),
        entry('widen', 'table.widen', changeColumnWidth(20)),
        entry('narrow', 'table.narrow', changeColumnWidth(-20)),
        entry('delete_table', 'table.delete', deleteTable),
      ],
    },
  ]
}
