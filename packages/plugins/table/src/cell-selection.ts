import {
  Selection,
  Slice,
  TextSelection,
  type Mappable,
  type Node,
  type ResolvedPos,
  type SelectionJSON,
  type Transform,
} from '@scriba/core'
import { isCell } from './nodes.js'
import { TableGrid, type GridCell, type Rect } from './grid.js'

/** The table around a position: its node, its start position and its grid. */
export interface TableContext {
  table: Node
  /** Position before the table node. */
  pos: number
  grid: TableGrid
}

/** Innermost table containing `$pos`, if any. */
export function tableAt($pos: ResolvedPos): TableContext | null {
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.type.spec['tableRole'] === 'table')
      return { table: node, pos: $pos.before(d), grid: TableGrid.of(node) }
  }
  return null
}

/** Position before the innermost cell containing `$pos`, if any. */
export function cellPosAt($pos: ResolvedPos): number | null {
  for (let d = $pos.depth; d > 0; d--) if (isCell($pos.node(d))) return $pos.before(d)
  return null
}

/**
 * A rectangle of table cells (made by dragging across cells or Shift+arrows).
 * `$anchor`/`$head` point right before the anchor and head cells.
 */
export class CellSelection extends Selection {
  constructor($anchorCell: ResolvedPos, $headCell: ResolvedPos = $anchorCell) {
    super($anchorCell, $headCell)
  }

  static create(doc: Node, anchorCell: number, headCell = anchorCell): CellSelection {
    return new CellSelection(doc.resolve(anchorCell), doc.resolve(headCell))
  }

  /** Table, grid and the selected rectangle (null if the cells are no longer in one table). */
  context(): (TableContext & { rect: Rect; cells: GridCell[] }) | null {
    const ctx = tableAt(this.$anchor.doc.resolve(this.$anchor.pos + 1))
    if (!ctx) return null
    const start = ctx.pos + 1
    const a = ctx.grid.cellAtPos(this.$anchor.pos - start)
    const h = ctx.grid.cellAtPos(this.$head.pos - start)
    if (!a || !h) return null
    const rect = ctx.grid.rectBetween(a, h)
    return { ...ctx, rect, cells: ctx.grid.cellsIn(rect) }
  }

  map(doc: Node, mapping: Mappable): Selection {
    const anchor = mapping.mapResult(this.anchor, 1)
    const head = mapping.mapResult(this.head, 1)
    const okA = !anchor.deleted && doc.nodeAt(anchor.pos) && isCell(doc.nodeAt(anchor.pos)!)
    const okH = !head.deleted && doc.nodeAt(head.pos) && isCell(doc.nodeAt(head.pos)!)
    if (okA && okH) {
      const sel = CellSelection.create(doc, anchor.pos, head.pos)
      if (sel.context()) return sel
    }
    return Selection.near(doc.resolve(Math.min(head.pos, doc.content.size)))
  }

  eq(other: Selection): boolean {
    return (
      other instanceof CellSelection && other.anchor === this.anchor && other.head === this.head
    )
  }

  toJSON(): SelectionJSON {
    return { type: 'text', anchor: this.anchor, head: this.head }
  }

  /** The DOM shows a text range from the start of the anchor cell to the start of the head cell. */
  override domRange(): { anchor: number; head: number } {
    const doc = this.$anchor.doc
    const inside = (cell: number) => Selection.near(doc.resolve(cell + 1)).head
    return { anchor: inside(this.anchor), head: inside(this.head) }
  }

  /** Keeps the cell selection while the DOM selection still ends in the head cell of this table. */
  override preserves(read: Selection): boolean {
    const ctx = this.context()
    if (!ctx || read.empty) return false
    return (
      read.from >= ctx.pos &&
      read.to <= ctx.pos + ctx.table.nodeSize &&
      cellPosAt(read.$head) === this.head
    )
  }

  /** Deleting a cell selection empties the cells (the table structure stays). */
  override replace(
    tr: Transform & { setSelection(sel: Selection): unknown },
    slice = Slice.empty,
  ): void {
    const ctx = this.context()
    if (!ctx) return
    const start = ctx.pos + 1
    const cells = [...ctx.cells].sort((a, b) => b.pos - a.pos)
    for (const cell of cells) {
      const from = start + cell.pos + 1
      const to = start + cell.pos + cell.node.nodeSize - 1
      const empty = cell.node.type.createAndFill()!
      tr.replaceWith(from, to, empty.content)
    }
    if (slice.size) {
      const first = start + Math.min(...cells.map((c) => c.pos)) + 2
      tr.replace(first, first, slice)
    }
    tr.setSelection(
      TextSelection.near(tr.doc.resolve(start + Math.min(...cells.map((c) => c.pos)) + 2)),
    )
  }
}
