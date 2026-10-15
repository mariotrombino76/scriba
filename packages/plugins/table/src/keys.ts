import type { Command, KeyBindings } from '@scriba/core'
import { CellSelection } from './cell-selection.js'
import { goToCell } from './commands.js'

/** Shift+arrow with a cell selection: moves the head cell (the browser handles the text case). */
function extendCells(rows: number, cols: number): Command {
  return (state, dispatch) => {
    const sel = state.selection
    if (!(sel instanceof CellSelection)) return false
    const ctx = sel.context()
    if (!ctx) return false
    const start = ctx.pos + 1
    const head = ctx.grid.cellAtPos(sel.head - start)
    if (!head) return false
    const row = rows < 0 ? head.row - 1 : rows > 0 ? head.row + head.rowspan : head.row
    const col = cols < 0 ? head.col - 1 : cols > 0 ? head.col + head.colspan : head.col
    const next = ctx.grid.at(row, col)
    if (!next) return true // at the table edge: stay (and keep the browser from leaving the table)
    dispatch?.(state.tr.setSelection(CellSelection.create(state.doc, sel.anchor, start + next.pos)))
    return true
  }
}

/**
 * Table keys: Tab / Shift+Tab move between cells (outside the first/last cell
 * they do nothing, so focus can still leave the editor: no keyboard trap);
 * Shift+arrows grow or shrink a cell selection.
 */
export function tableKeymap(): KeyBindings {
  return {
    Tab: goToCell(1),
    'Shift-Tab': goToCell(-1),
    'Shift-ArrowLeft': extendCells(0, -1),
    'Shift-ArrowRight': extendCells(0, 1),
    'Shift-ArrowUp': extendCells(-1, 0),
    'Shift-ArrowDown': extendCells(1, 0),
  }
}
