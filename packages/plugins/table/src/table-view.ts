import type { EditorView, PluginView } from '@scriba/view'
import { CellSelection, tableAt } from './cell-selection.js'
import { setColumnWidths } from './commands.js'
import { MAX_COL_WIDTH, MIN_COL_WIDTH } from './nodes.js'

/** How close (px) to a cell's right border the pointer must be to resize the column. */
const HANDLE = 6

/**
 * Table helpers for the view:
 * - selected cells get `scriba-selected-cell` (the editor gets
 *   `scriba-cell-selection`, which hides the browser's own text highlight);
 * - dragging a cell's right border resizes its column: a guide line follows
 *   the pointer, the model is updated once on release (one undo step).
 * Keyboard users widen/narrow columns from the table menu.
 */
export function tableView(view: EditorView): PluginView {
  const doc = view.document
  const guide = doc.createElement('div')
  guide.className = 'scriba-column-guide'
  guide.setAttribute('aria-hidden', 'true')
  guide.hidden = true
  doc.body.appendChild(guide)

  let marked: Element[] = []
  const markCells = () => {
    for (const el of marked) el.classList.remove('scriba-selected-cell')
    marked = []
    const sel = view.state.selection
    const ctx = sel instanceof CellSelection ? sel.context() : null
    view.dom.classList.toggle('scriba-cell-selection', !!ctx)
    if (!ctx) return
    for (const cell of ctx.cells) {
      const { node } = view.domAtPos(ctx.pos + 1 + cell.pos + 1)
      const el = (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest('td, th')
      if (el && view.dom.contains(el)) {
        el.classList.add('scriba-selected-cell')
        marked.push(el)
      }
    }
  }

  // --- Column resizing ---
  let hover: HTMLTableCellElement | null = null
  let drag: {
    cellPos: number
    col: number
    startX: number
    startWidth: number
    pointer: number
  } | null = null

  const cellNear = (event: MouseEvent): HTMLTableCellElement | null => {
    if (!view.editable || !(event.target instanceof Element)) return null
    const cell = event.target.closest('td, th')
    if (!(cell instanceof HTMLTableCellElement) || !view.dom.contains(cell)) return null
    const r = cell.getBoundingClientRect()
    return event.clientX >= r.right - HANDLE && event.clientX <= r.right + HANDLE ? cell : null
  }
  const setHover = (cell: HTMLTableCellElement | null) => {
    hover = cell
    view.dom.classList.toggle('scriba-column-resize', !!cell)
  }

  const showGuide = (x: number, cell: HTMLTableCellElement) => {
    const table = cell.closest('table')!.getBoundingClientRect()
    guide.hidden = false
    guide.style.left = `${Math.round(x)}px`
    guide.style.top = `${table.top}px`
    guide.style.height = `${table.height}px`
  }

  const onMove = (event: PointerEvent) => {
    if (drag) {
      if (event.pointerId !== drag.pointer || !hover) return
      const width = clampWidth(drag.startWidth + event.clientX - drag.startX)
      showGuide(drag.startX + width - drag.startWidth, hover)
      return
    }
    if (event.buttons) return
    setHover(cellNear(event))
  }

  const onDown = (event: PointerEvent) => {
    const cell = cellNear(event)
    if (!cell || event.button !== 0) return
    const cellPos = view.posAtDOM(cell, 0)
    if (cellPos === null) return
    const ctx = tableAt(view.state.doc.resolve(cellPos))
    const info = ctx?.grid.cellAtPos(cellPos - 1 - ctx.pos - 1)
    if (!ctx || !info) return
    event.preventDefault()
    setHover(cell)
    const col = info.col + info.colspan - 1
    const widths = info.node.attrs['colwidth'] as number[] | null
    const measured = cell.getBoundingClientRect().width / info.colspan
    drag = {
      cellPos: cellPos - 1,
      col,
      startX: event.clientX,
      startWidth: widths?.[info.colspan - 1] || Math.round(measured),
      pointer: event.pointerId,
    }
    view.dom.setPointerCapture(event.pointerId)
    showGuide(event.clientX, cell)
  }
  // --- Selecting cells by dragging (done here so every browser behaves the same:
  // Firefox would otherwise start its own multi-range cell selection) ---
  let selectAnchor: number | null = null
  const cellPosOf = (target: EventTarget | null): number | null => {
    const cell = target instanceof Element ? target.closest('td, th') : null
    if (!cell || !view.dom.contains(cell)) return null
    const pos = view.posAtDOM(cell, 0)
    return pos === null ? null : pos - 1
  }
  const onSelectMove = (event: MouseEvent) => {
    const head = cellPosOf(event.target)
    if (selectAnchor === null || head === null) return
    const { state } = view
    if (head === selectAnchor && !(state.selection instanceof CellSelection)) return
    const table = tableAt(state.doc.resolve(selectAnchor + 1))
    if (!table || tableAt(state.doc.resolve(head + 1))?.pos !== table.pos) return
    event.preventDefault()
    const next = CellSelection.create(state.doc, selectAnchor, head)
    if (!next.eq(state.selection)) view.dispatch(state.tr.setSelection(next))
  }
  const onSelectUp = () => {
    selectAnchor = null
    doc.removeEventListener('mousemove', onSelectMove)
    doc.removeEventListener('mouseup', onSelectUp)
  }

  const onMouseDown = (event: MouseEvent) => {
    // Keep the browser from starting a text selection while grabbing a border.
    if (drag || cellNear(event)) {
      event.preventDefault()
      return
    }
    if (event.button !== 0 || event.shiftKey || !view.editable) return
    selectAnchor = cellPosOf(event.target)
    if (selectAnchor === null) return
    doc.addEventListener('mousemove', onSelectMove)
    doc.addEventListener('mouseup', onSelectUp)
  }

  const onUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return
    const { cellPos, col, startX, startWidth } = drag
    drag = null
    guide.hidden = true
    setHover(null)
    if (view.dom.hasPointerCapture(event.pointerId)) view.dom.releasePointerCapture(event.pointerId)
    const width = clampWidth(startWidth + event.clientX - startX)
    if (width === startWidth || event.type === 'pointercancel') return
    const ctx = tableAt(view.state.doc.resolve(cellPos + 1))
    const tr = ctx && setColumnWidths(view.state, ctx, col, col + 1, () => width)
    if (tr) view.dispatch(tr)
  }

  view.dom.addEventListener('pointermove', onMove)
  view.dom.addEventListener('pointerdown', onDown)
  view.dom.addEventListener('mousedown', onMouseDown)
  view.dom.addEventListener('pointerup', onUp)
  view.dom.addEventListener('pointercancel', onUp)
  view.dom.addEventListener('pointerleave', () => !drag && setHover(null))
  markCells()

  return {
    update: markCells,
    destroy() {
      view.dom.removeEventListener('pointermove', onMove)
      view.dom.removeEventListener('pointerdown', onDown)
      view.dom.removeEventListener('mousedown', onMouseDown)
      view.dom.removeEventListener('pointerup', onUp)
      view.dom.removeEventListener('pointercancel', onUp)
      onSelectUp()
      guide.remove()
    },
  }
}

function clampWidth(width: number): number {
  return Math.round(Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, width)))
}
