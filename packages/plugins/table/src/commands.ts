import {
  Fragment,
  Selection,
  TextSelection,
  insertContent,
  type Command,
  type EditorState,
  type Node,
  type Transaction,
} from '@scriba-editor/core'
import { CellSelection, cellPosAt, tableAt, type TableContext } from './cell-selection.js'
import {
  TableGrid,
  buildTable,
  emptyCell,
  toBuildCells,
  type BuildCell,
  type GridCell,
  type Rect,
} from './grid.js'
import { MAX_COL_WIDTH, MIN_COL_WIDTH } from './nodes.js'

export const MAX_ROWS = 50
export const MAX_COLS = 20

/** Table, grid and the selected rectangle: a cell selection, or the cell holding the cursor. */
export function selectedRect(
  state: EditorState,
): (TableContext & { rect: Rect; cell: GridCell }) | null {
  const sel = state.selection
  if (sel instanceof CellSelection) {
    const ctx = sel.context()
    if (!ctx) return null
    const cell = ctx.grid.cellAtPos(sel.head - ctx.pos - 1) ?? ctx.cells[0]!
    return { table: ctx.table, pos: ctx.pos, grid: ctx.grid, rect: ctx.rect, cell }
  }
  const cellPos = cellPosAt(sel.$head)
  const ctx = cellPos === null ? null : tableAt(sel.$head)
  if (!ctx || cellPos === null) return null
  const cell = ctx.grid.cellAtPos(cellPos - ctx.pos - 1)
  if (!cell) return null
  return {
    ...ctx,
    cell,
    rect: {
      top: cell.row,
      left: cell.col,
      bottom: cell.row + cell.rowspan,
      right: cell.col + cell.colspan,
    },
  }
}

/** Replaces the table with a rebuilt one and puts the cursor in the cell at (row, col). */
function replaceTable(
  state: EditorState,
  ctx: TableContext,
  cells: BuildCell[],
  height: number,
  width: number,
  focus: [number, number],
): Transaction | null {
  const table = buildTable(ctx.table, cells, height, width)
  if (!table) return null
  const tr = state.tr.replaceWith(ctx.pos, ctx.pos + ctx.table.nodeSize, table)
  const grid = TableGrid.of(table)
  const target = grid.at(Math.min(focus[0], grid.height - 1), Math.min(focus[1], grid.width - 1))
  if (target) tr.setSelection(Selection.near(tr.doc.resolve(ctx.pos + 1 + target.pos + 1)))
  return tr.scrollIntoView()
}

type Selected = NonNullable<ReturnType<typeof selectedRect>>

/**
 * A command working on the table around the selection. Without `dispatch`
 * (enabling toolbar entries) only `can` is checked: the table is not rebuilt.
 */
/** Removes the table (an empty paragraph takes its place when nothing else would remain). */
function removeTable(state: EditorState, ctx: TableContext): Transaction {
  const tr = state.tr
  const end = ctx.pos + ctx.table.nodeSize
  const $pos = state.doc.resolve(ctx.pos)
  const paragraph = state.schema.nodes['paragraph']
  if ($pos.parent.childCount === 1 && paragraph) tr.replaceWith(ctx.pos, end, paragraph.create())
  else tr.delete(ctx.pos, end)
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(ctx.pos, tr.doc.content.size))))
  return tr.scrollIntoView()
}

function tableCommand(
  run: (state: EditorState, ctx: Selected) => Transaction | null,
  can: (ctx: Selected) => boolean = () => true,
): Command {
  return (state, dispatch) => {
    const ctx = selectedRect(state)
    if (!ctx) return false
    if (!dispatch) return can(ctx)
    const tr = run(state, ctx)
    if (!tr) return false
    dispatch?.(tr)
    return true
  }
}

/** Inserts a rows×cols table (optionally with a header row) where the selection is. */
export function insertTable(rows: number, cols: number, headerRow = true): Command {
  return (state, dispatch) => {
    const { table, table_row, table_cell, table_header } = state.schema.nodes
    if (!table || !table_row || !table_cell || !table_header) return false
    if (!(rows >= 1 && rows <= MAX_ROWS && cols >= 1 && cols <= MAX_COLS)) return false
    if (tableAt(state.selection.$from)) return false // no nested tables
    if (!dispatch) return true
    const makeRow = (header: boolean) =>
      table_row.create(
        null,
        Array.from({ length: cols }, () => emptyCell(header ? table_header : table_cell)),
      )
    const node = table.create(
      null,
      Array.from({ length: rows }, (_v, r) => makeRow(headerRow && r === 0)),
    )
    const tr = state.tr
    const { from, to } = state.selection
    const after = insertContent(tr, from, to, Fragment.from(node))
    if (after === null) return false
    const tablePos = after - node.nodeSize
    if (tr.doc.nodeAt(tablePos)?.type === table)
      tr.setSelection(TextSelection.near(tr.doc.resolve(tablePos + 3)))
    dispatch(tr.scrollIntoView())
    return true
  }
}

/** True when every cell of the first row (or column) is a header cell. */
function isHeaderLine(grid: TableGrid, kind: 'row' | 'column'): boolean {
  const line = grid.cells.filter((c) => (kind === 'row' ? c.row === 0 : c.col === 0))
  return line.length > 0 && line.every((c) => c.node.type.spec['tableRole'] === 'header_cell')
}

/** Adds a row above (`before`) or below the selection. */
export function addRow(before: boolean): Command {
  return tableCommand((state, ctx) => {
    const at = before ? ctx.rect.top : ctx.rect.bottom
    const cells = toBuildCells(ctx.grid).map((c) => {
      if (c.row < at && c.row + c.rowspan > at) return { ...c, rowspan: c.rowspan + 1 }
      return c.row >= at ? { ...c, row: c.row + 1 } : c
    })
    const headerCol = isHeaderLine(ctx.grid, 'column')
    const { table_cell, table_header } = state.schema.nodes
    for (let col = 0; col < ctx.grid.width; col++) {
      const above = ctx.grid.at(at - 1, col)
      const below = ctx.grid.at(at, col)
      if (above && below && above === below) continue // a cell spans across the new row
      const type = headerCol && col === 0 ? table_header! : table_cell!
      cells.push({ node: emptyCell(type), row: at, col, rowspan: 1, colspan: 1 })
    }
    return replaceTable(state, ctx, cells, ctx.grid.height + 1, ctx.grid.width, [at, ctx.cell.col])
  })
}

/** Adds a column left (`before`) or right of the selection. */
export function addColumn(before: boolean): Command {
  return tableCommand((state, ctx) => {
    const at = before ? ctx.rect.left : ctx.rect.right
    const cells: BuildCell[] = toBuildCells(ctx.grid).map((c) => {
      if (c.col < at && c.col + c.colspan > at) {
        const widths = c.node.attrs['colwidth'] as number[] | null
        const node = widths
          ? c.node.type.create(
              {
                ...c.node.attrs,
                colwidth: [...widths.slice(0, at - c.col), 0, ...widths.slice(at - c.col)],
              },
              c.node.content,
            )
          : c.node
        return { ...c, node, colspan: c.colspan + 1 }
      }
      return c.col >= at ? { ...c, col: c.col + 1 } : c
    })
    const headerRow = isHeaderLine(ctx.grid, 'row')
    const { table_cell, table_header } = state.schema.nodes
    for (let row = 0; row < ctx.grid.height; row++) {
      const left = ctx.grid.at(row, at - 1)
      const right = ctx.grid.at(row, at)
      if (left && right && left === right) continue
      const type = headerRow && row === 0 ? table_header! : table_cell!
      cells.push({ node: emptyCell(type), row, col: at, rowspan: 1, colspan: 1 })
    }
    return replaceTable(state, ctx, cells, ctx.grid.height, ctx.grid.width + 1, [ctx.cell.row, at])
  })
}

/** Deletes the selected rows (the whole table when none would remain). */
export const deleteRow: Command = tableCommand((state, ctx) => {
  const { top, bottom } = ctx.rect
  const count = bottom - top
  if (count >= ctx.grid.height) return removeTable(state, ctx)
  const cells: BuildCell[] = []
  for (const c of toBuildCells(ctx.grid)) {
    const end = c.row + c.rowspan
    const overlap = Math.max(0, Math.min(end, bottom) - Math.max(c.row, top))
    if (overlap === c.rowspan) continue // entirely in the deleted rows
    cells.push({
      ...c,
      row: c.row >= bottom ? c.row - count : Math.min(c.row, top),
      rowspan: c.rowspan - overlap,
    })
  }
  return replaceTable(state, ctx, cells, ctx.grid.height - count, ctx.grid.width, [
    top,
    ctx.cell.col,
  ])
})

/** Deletes the selected columns (the whole table when none would remain). */
export const deleteColumn: Command = tableCommand((state, ctx) => {
  const { left, right } = ctx.rect
  const count = right - left
  if (count >= ctx.grid.width) return removeTable(state, ctx)
  const cells: BuildCell[] = []
  for (const c of toBuildCells(ctx.grid)) {
    const end = c.col + c.colspan
    const overlap = Math.max(0, Math.min(end, right) - Math.max(c.col, left))
    if (overlap === c.colspan) continue
    let node = c.node
    const widths = node.attrs['colwidth'] as number[] | null
    if (widths && overlap) {
      const from = Math.max(left - c.col, 0)
      node = node.type.create(
        { ...node.attrs, colwidth: [...widths.slice(0, from), ...widths.slice(from + overlap)] },
        node.content,
      )
    }
    cells.push({
      ...c,
      node,
      col: c.col >= right ? c.col - count : Math.min(c.col, left),
      colspan: c.colspan - overlap,
    })
  }
  return replaceTable(state, ctx, cells, ctx.grid.height, ctx.grid.width - count, [
    ctx.cell.row,
    left,
  ])
})

function isEmptyCell(cell: Node): boolean {
  return cell.childCount === 1 && cell.firstChild!.isTextblock && !cell.firstChild!.content.size
}

/** Merges the selected cells into one (the rectangle must not cut merged cells). */
export const mergeCells: Command = (state, dispatch) => {
  const sel = state.selection
  if (!(sel instanceof CellSelection)) return false
  const ctx = sel.context()
  if (!ctx || ctx.cells.length < 2) return false
  const { rect } = ctx
  if (
    ctx.cells.some(
      (c) =>
        c.row < rect.top ||
        c.col < rect.left ||
        c.row + c.rowspan > rect.bottom ||
        c.col + c.colspan > rect.right,
    )
  ) {
    return false
  }
  if (!dispatch) return true
  const ordered = [...ctx.cells].sort((a, b) => a.row - b.row || a.col - b.col)
  const first = ordered[0]!
  const content = ordered.filter((c) => !isEmptyCell(c.node)).flatMap((c) => c.node.content.content)
  const widths: number[] = []
  for (let col = rect.left; col < rect.right; col++) {
    const owner = ctx.grid.at(rect.top, col)!
    widths.push((owner.node.attrs['colwidth'] as number[] | null)?.[col - owner.col] ?? 0)
  }
  const merged = first.node.type.create(
    { ...first.node.attrs, colwidth: widths.some((w) => w) ? widths : null },
    content.length ? Fragment.fromArray(content) : first.node.content,
  )
  const cells: BuildCell[] = toBuildCells(ctx.grid).filter(
    (c) => !ordered.some((o) => o.row === c.row && o.col === c.col),
  )
  cells.push({
    node: merged,
    row: rect.top,
    col: rect.left,
    rowspan: rect.bottom - rect.top,
    colspan: rect.right - rect.left,
  })
  const tr = replaceTable(
    state,
    { table: ctx.table, pos: ctx.pos, grid: ctx.grid },
    cells,
    ctx.grid.height,
    ctx.grid.width,
    [rect.top, rect.left],
  )
  if (!tr) return false
  dispatch(tr)
  return true
}

/** Splits a merged cell back into single cells (content stays in the first). */
export const splitCell: Command = tableCommand(
  (state, ctx) => {
    const target = ctx.cell
    if (target.rowspan === 1 && target.colspan === 1) return null
    const cells: BuildCell[] = toBuildCells(ctx.grid).filter(
      (c) => !(c.row === target.row && c.col === target.col),
    )
    const widths = target.node.attrs['colwidth'] as number[] | null
    for (let r = 0; r < target.rowspan; r++) {
      for (let c = 0; c < target.colspan; c++) {
        const w = widths?.[c]
        const colwidth = w ? [w] : null
        const node =
          r === 0 && c === 0
            ? target.node.type.create({ ...target.node.attrs, colwidth }, target.node.content)
            : emptyCell(target.node.type, { colwidth })
        cells.push({ node, row: target.row + r, col: target.col + c, rowspan: 1, colspan: 1 })
      }
    }
    return replaceTable(state, ctx, cells, ctx.grid.height, ctx.grid.width, [
      target.row,
      target.col,
    ])
  },
  (ctx) => ctx.cell.rowspan > 1 || ctx.cell.colspan > 1,
)

/** Turns the first row (or column) into header cells, or back into normal cells. */
export function toggleHeader(kind: 'row' | 'column'): Command {
  return tableCommand((state, ctx) => {
    const { table_cell, table_header } = state.schema.nodes
    const inLine = (c: GridCell) => (kind === 'row' ? c.row === 0 : c.col === 0)
    const type = isHeaderLine(ctx.grid, kind) ? table_cell! : table_header!
    const cells = toBuildCells(ctx.grid).map((c) =>
      inLine(c as GridCell)
        ? { ...c, node: type.create(c.node.attrs, c.node.content, c.node.marks) }
        : c,
    )
    return replaceTable(state, ctx, cells, ctx.grid.height, ctx.grid.width, [
      ctx.cell.row,
      ctx.cell.col,
    ])
  })
}

export function isHeaderOn(state: EditorState, kind: 'row' | 'column'): boolean {
  const ctx = selectedRect(state)
  return !!ctx && isHeaderLine(ctx.grid, kind)
}

/** Changes the width of the selected column(s) by `delta` px (keyboard alternative to dragging). */
export function changeColumnWidth(delta: number, defaultWidth = 120): Command {
  return tableCommand((state, ctx) =>
    setColumnWidths(state, ctx, ctx.rect.left, ctx.rect.right, (w) => (w || defaultWidth) + delta),
  )
}

/** Sets the width of columns [from, to) (used by dragging and by the keyboard commands). */
export function setColumnWidths(
  state: EditorState,
  ctx: TableContext,
  from: number,
  to: number,
  width: (current: number) => number,
): Transaction | null {
  const tr = state.tr
  const start = ctx.pos + 1
  for (const c of ctx.grid.cells) {
    if (c.col + c.colspan <= from || c.col >= to) continue
    const widths = Array.from(
      { length: c.colspan },
      (_v, i) => (c.node.attrs['colwidth'] as number[] | null)?.[i] ?? 0,
    )
    for (let col = Math.max(from, c.col); col < Math.min(to, c.col + c.colspan); col++) {
      widths[col - c.col] = Math.round(
        Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, width(widths[col - c.col]!))),
      )
    }
    tr.setNodeAttrs(start + c.pos, { colwidth: widths })
  }
  return tr.docChanged ? tr : null
}

/** Deletes the table around the selection. */
export const deleteTable: Command = tableCommand(removeTable)

/**
 * Tab / Shift+Tab: next / previous cell, selecting its content. Outside the table's first/last cell
 * it does nothing, so Tab keeps moving focus out of the editor (no keyboard trap).
 */
export function goToCell(dir: 1 | -1): Command {
  return (state, dispatch) => {
    const ctx = selectedRect(state)
    if (!ctx) return false
    const ordered = [...ctx.grid.cells].sort((a, b) => a.row - b.row || a.col - b.col)
    const index = ordered.indexOf(ctx.cell)
    const next = ordered[index + dir]
    if (!next) return false
    if (dispatch) {
      // like word processors: the cell's content is selected (typing replaces it)
      const start = ctx.pos + 1 + next.pos
      const end = start + next.node.nodeSize
      const from = Selection.near(state.doc.resolve(start + 1)).head
      const to = Selection.near(state.doc.resolve(end - 1), -1).head
      const tr = state.tr.setSelection(TextSelection.create(state.doc, from, Math.max(from, to)))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/**
 * Pasting a table into a table fills the cells from the selected cell (top-left
 * of a cell selection) like a spreadsheet, growing the table when needed.
 * Returns null when `content` is not a single table or the selection is not in one.
 */
export function pasteCells(state: EditorState, content: Fragment): Transaction | null {
  const source = content.childCount === 1 ? content.firstChild! : null
  if (!source || source.type.spec['tableRole'] !== 'table') return null
  const ctx = selectedRect(state)
  if (!ctx) return null
  const pasted = TableGrid.of(source)
  const top = ctx.rect.top
  const left = ctx.rect.left
  const bottom = top + pasted.height
  const right = left + pasted.width
  if (bottom > MAX_ROWS * 4 || right > MAX_COLS * 4) return null // keep it sane (DoS, §5.10)
  // existing cells overlapping the pasted area are replaced
  const cells: BuildCell[] = toBuildCells(ctx.grid).filter(
    (c) =>
      c.row >= bottom || c.row + c.rowspan <= top || c.col >= right || c.col + c.colspan <= left,
  )
  for (const c of pasted.cells) {
    cells.push({
      node: c.node,
      row: c.row + top,
      col: c.col + left,
      rowspan: c.rowspan,
      colspan: c.colspan,
    })
  }
  const height = Math.max(ctx.grid.height, bottom)
  const width = Math.max(ctx.grid.width, right)
  return replaceTable(state, ctx, cells, height, width, [top, left])
}

/** Cell properties settable from the cell dialog (`null` removes one). */
export interface CellProps {
  background?: string | null
  valign?: 'top' | 'middle' | 'bottom' | null
  borderWidth?: number | null
  borderStyle?: string | null
  borderColor?: string | null
}

/** Table properties settable from the table dialog. */
export interface TableProps extends Omit<CellProps, 'background' | 'valign'> {
  caption?: string | null
  align?: 'center' | 'right' | null
}

/** Sets properties on the selected cells (or the cell with the cursor). One undo step. */
export function setCellProps(props: CellProps): Command {
  return tableCommand((state, ctx) => {
    const tr = state.tr
    const start = ctx.pos + 1
    for (const cell of ctx.grid.cellsIn(ctx.rect)) {
      tr.setNodeAttrs(start + cell.pos, props as Record<string, unknown>)
    }
    return tr.docChanged ? tr : null
  })
}

/**
 * Sets table properties. A border also goes on every cell (as in word
 * processors: the grid lines change with the outer border).
 */
export function setTableProps(props: TableProps): Command {
  return tableCommand((state, ctx) => {
    const tr = state.tr
    tr.setNodeAttrs(ctx.pos, props as Record<string, unknown>)
    const border: Record<string, unknown> = {}
    for (const key of ['borderWidth', 'borderStyle', 'borderColor'] as const)
      if (key in props) border[key] = props[key]
    if (Object.keys(border).length) {
      for (const cell of ctx.grid.cells) tr.setNodeAttrs(ctx.pos + 1 + cell.pos, border)
    }
    return tr.docChanged ? tr : null
  })
}
