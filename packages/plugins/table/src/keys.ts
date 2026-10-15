import {
  Fragment,
  Selection,
  TextSelection,
  canReplace,
  type Command,
  type CommandView,
  type KeyBindings,
} from '@scriba/core'
import type { EditorView } from '@scriba/view'
import { CellSelection, cellPosAt, tableAt } from './cell-selection.js'
import { deleteTable, goToCell } from './commands.js'

/**
 * Shift+arrow: with a cell selection, moves its head cell; with text selected
 * inside one cell, at the edge of the cell's text (or on its first/last line
 * for up/down), starts a cell selection with the neighbouring cell. Browsers
 * are unreliable at extending text selections across table cells.
 */
function extendCells(rows: number, cols: number): Command {
  return (state, dispatch, view) => {
    const sel = state.selection
    let anchor: number
    let headPos: number
    if (sel instanceof CellSelection) {
      anchor = sel.anchor
      headPos = sel.head
    } else if (sel instanceof TextSelection) {
      const cellPos = cellPosAt(sel.$head)
      if (cellPos === null || cellPosAt(sel.$anchor) !== cellPos) return false
      const cell = state.doc.nodeAt(cellPos)!
      const dir = rows + cols < 0 ? -1 : 1
      if (rows) {
        const $cell = state.doc.resolve(cellPos + 1)
        const index = sel.$head.index($cell.depth)
        if (dir < 0 ? index > 0 : index < cell.childCount - 1) return false
        if (!onEdgeLine(view, dir)) return false
      } else {
        const edge =
          dir < 0
            ? Selection.near(state.doc.resolve(cellPos + 1)).head
            : Selection.near(state.doc.resolve(cellPos + cell.nodeSize - 1), -1).head
        if (sel.head !== edge) return false
      }
      anchor = headPos = cellPos
    } else return false
    const ctx = tableAt(state.doc.resolve(headPos + 1))
    if (!ctx) return false
    const start = ctx.pos + 1
    const head = ctx.grid.cellAtPos(headPos - start)
    if (!head) return false
    const row = rows < 0 ? head.row - 1 : rows > 0 ? head.row + head.rowspan : head.row
    const col = cols < 0 ? head.col - 1 : cols > 0 ? head.col + head.colspan : head.col
    const next = ctx.grid.at(row, col)
    // at the table edge: a cell selection stays (the browser would leave the table)
    if (!next) return sel instanceof CellSelection
    dispatch?.(state.tr.setSelection(CellSelection.create(state.doc, anchor, start + next.pos)))
    return true
  }
}

/** Backspace/Delete with every cell selected deletes the whole table (fewer cells: they are emptied). */
const deleteAllCells: Command = (state, dispatch) => {
  const sel = state.selection
  if (!(sel instanceof CellSelection)) return false
  const ctx = sel.context()
  if (!ctx || ctx.cells.length !== ctx.grid.cells.length) return false
  return deleteTable(state, dispatch)
}

/** Whether the caret is on the first (dir -1) or last (dir 1) line of its textblock. */
function onEdgeLine(view: CommandView | undefined, dir: -1 | 1): boolean {
  const ed = view as EditorView | undefined
  const domSel = ed?.document?.getSelection()
  if (!ed || !domSel?.rangeCount) return true
  const caret = domSel.getRangeAt(0).getBoundingClientRect()
  const { node } = ed.domAtPos(ed.state.selection.$head.start())
  const block = node.nodeType === 1 ? (node as Element) : node.parentElement
  if (!block || !caret.height) return true // empty line: nothing to measure
  const box = block.getBoundingClientRect()
  return dir < 0
    ? caret.top - box.top < caret.height * 0.75
    : box.bottom - caret.bottom < caret.height * 0.75
}

/**
 * Arrow keys past the first/last cell of a table with nothing before/after it
 * (start or end of the document, of a quote…): a paragraph is created there,
 * so the cursor can always leave the table.
 */
function exitTable(dir: -1 | 1, vertical: boolean): Command {
  return (state, dispatch, view) => {
    const sel = state.selection
    if (!(sel instanceof TextSelection) || !sel.empty) return false
    const ctx = tableAt(sel.$head)
    const cellPos = cellPosAt(sel.$head)
    if (!ctx || cellPos === null) return false
    const $table = state.doc.resolve(ctx.pos)
    const index = $table.index()
    if (dir < 0 ? index > 0 : index < $table.parent.childCount - 1) return false
    if (vertical) {
      const cell = ctx.grid.cellAtPos(cellPos - ctx.pos - 1)
      if (!cell || (dir < 0 ? cell.row > 0 : cell.row + cell.rowspan < ctx.grid.height))
        return false
      const $cell = state.doc.resolve(cellPos + 1)
      const blockIndex = sel.$head.index($cell.depth)
      if (dir < 0 ? blockIndex > 0 : blockIndex < $cell.parent.childCount - 1) return false
      if (!onEdgeLine(view, dir)) return false
    } else {
      const end = ctx.pos + ctx.table.nodeSize
      const edge =
        dir < 0
          ? Selection.near(state.doc.resolve(ctx.pos + 1)).head
          : Selection.near(state.doc.resolve(end - 1), -1).head
      if (sel.head !== edge) return false
    }
    const paragraph = state.schema.nodes['paragraph']
    const at = dir < 0 ? index : index + 1
    if (!paragraph || !canReplace($table.parent, at, at, Fragment.from(paragraph.create())))
      return false
    if (dispatch) {
      const pos = dir < 0 ? ctx.pos : ctx.pos + ctx.table.nodeSize
      const tr = state.tr.insert(pos, paragraph.create())
      dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView())
    }
    return true
  }
}

/**
 * Table keys: Tab / Shift+Tab move between cells (outside the first/last cell
 * they do nothing, so focus can still leave the editor: no keyboard trap);
 * Shift+arrows grow or shrink a cell selection; Backspace/Delete with all
 * cells selected delete the table.
 */
export function tableKeymap(): KeyBindings {
  return {
    Tab: goToCell(1),
    'Shift-Tab': goToCell(-1),
    'Shift-ArrowLeft': extendCells(0, -1),
    'Shift-ArrowRight': extendCells(0, 1),
    'Shift-ArrowUp': extendCells(-1, 0),
    'Shift-ArrowDown': extendCells(1, 0),
    ArrowUp: exitTable(-1, true),
    ArrowLeft: exitTable(-1, false),
    ArrowDown: exitTable(1, true),
    ArrowRight: exitTable(1, false),
    Backspace: deleteAllCells,
    Delete: deleteAllCells,
  }
}
