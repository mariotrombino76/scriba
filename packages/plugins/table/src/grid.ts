import { Fragment, type Node, type NodeType } from '@scriba-editor/core'

/** A cell placed on the grid. `pos` is relative to the table's content start. */
export interface GridCell {
  node: Node
  row: number
  col: number
  rowspan: number
  colspan: number
  pos: number
}

export interface Rect {
  top: number
  left: number
  bottom: number // exclusive
  right: number // exclusive
}

/**
 * A table as a grid (simple picture: squared paper where merged cells cover
 * several squares). Built from the table node; structural operations edit a
 * copy of the cell list and `buildTable` turns it back into a valid table.
 */
export class TableGrid {
  private constructor(
    readonly width: number,
    readonly height: number,
    readonly cells: readonly GridCell[],
    private readonly slots: readonly (GridCell | null)[],
  ) {}

  static of(table: Node): TableGrid {
    const height = table.childCount
    const occupied = new Map<string, GridCell>()
    const cells: GridCell[] = []
    let width = 0
    let rowPos = 0
    table.forEach((row, _o, r) => {
      let col = 0
      row.forEach((cell, offset) => {
        while (occupied.has(`${r},${col}`)) col++
        const colspan = cell.attrs['colspan'] as number
        const rowspan = Math.min(cell.attrs['rowspan'] as number, height - r)
        const info: GridCell = {
          node: cell,
          row: r,
          col,
          rowspan,
          colspan,
          pos: rowPos + 1 + offset,
        }
        cells.push(info)
        for (let dr = 0; dr < rowspan; dr++) {
          for (let dc = 0; dc < colspan; dc++) occupied.set(`${r + dr},${col + dc}`, info)
        }
        col += colspan
        width = Math.max(width, col)
      })
      rowPos += row.nodeSize
    })
    const slots: (GridCell | null)[] = []
    for (let r = 0; r < height; r++)
      for (let c = 0; c < width; c++) slots.push(occupied.get(`${r},${c}`) ?? null)
    return new TableGrid(width, height, cells, slots)
  }

  /** The cell covering a slot. */
  at(row: number, col: number): GridCell | null {
    if (row < 0 || col < 0 || row >= this.height || col >= this.width) return null
    return this.slots[row * this.width + col] ?? null
  }

  /** True when every slot is covered (no holes from irregular rows). */
  get isRectangular(): boolean {
    return this.slots.every((s) => s !== null)
  }

  cellAtPos(pos: number): GridCell | null {
    return this.cells.find((c) => c.pos === pos) ?? null
  }

  /** Smallest rectangle containing both cells and every merged cell it touches. */
  rectBetween(a: GridCell, b: GridCell): Rect {
    let rect: Rect = {
      top: Math.min(a.row, b.row),
      left: Math.min(a.col, b.col),
      bottom: Math.max(a.row + a.rowspan, b.row + b.rowspan),
      right: Math.max(a.col + a.colspan, b.col + b.colspan),
    }
    for (let changed = true; changed;) {
      changed = false
      for (const c of this.cellsIn(rect)) {
        const grown = {
          top: Math.min(rect.top, c.row),
          left: Math.min(rect.left, c.col),
          bottom: Math.max(rect.bottom, c.row + c.rowspan),
          right: Math.max(rect.right, c.col + c.colspan),
        }
        if (
          grown.top !== rect.top ||
          grown.left !== rect.left ||
          grown.bottom !== rect.bottom ||
          grown.right !== rect.right
        ) {
          rect = grown
          changed = true
        }
      }
    }
    return rect
  }

  /** Cells intersecting a rectangle. */
  cellsIn(rect: Rect): GridCell[] {
    return this.cells.filter(
      (c) =>
        c.row < rect.bottom &&
        c.row + c.rowspan > rect.top &&
        c.col < rect.right &&
        c.col + c.colspan > rect.left,
    )
  }
}

/** A cell for building: node plus its place on the grid. */
export interface BuildCell {
  node: Node
  row: number
  col: number
  rowspan: number
  colspan: number
}

/** An empty cell of `type` (one empty paragraph). */
export function emptyCell(type: NodeType, attrs?: Record<string, unknown>): Node {
  return type.createAndFill(attrs ?? null)!
}

/**
 * Builds a valid table from grid cells: fills holes with empty cells, removes
 * rows that would be empty (covered only by row spans) and writes spans and
 * widths back into the cell attributes.
 */
export function buildTable(
  table: Node,
  input: readonly BuildCell[],
  height: number,
  width: number,
): Node | null {
  const schema = table.type.schema
  const cellType = schema.nodes['table_cell']!
  let cells = input.map((c) => ({
    ...c,
    rowspan: Math.max(1, Math.min(c.rowspan, height - c.row)),
  }))
  // Rows without any starting cell cannot exist: shrink the spans crossing them and drop the row.
  for (let r = 0; r < height;) {
    if (cells.some((c) => c.row === r)) {
      r++
      continue
    }
    cells = cells.map((c) => ({
      ...c,
      rowspan: c.row < r && c.row + c.rowspan > r ? c.rowspan - 1 : c.rowspan,
      row: c.row > r ? c.row - 1 : c.row,
    }))
    height--
  }
  if (!height || !width) return null
  // Fill holes so the table stays rectangular.
  const covered = new Set<string>()
  for (const c of cells) {
    for (let dr = 0; dr < c.rowspan; dr++)
      for (let dc = 0; dc < c.colspan; dc++) covered.add(`${c.row + dr},${c.col + dc}`)
  }
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!covered.has(`${r},${c}`))
        cells.push({ node: emptyCell(cellType), row: r, col: c, rowspan: 1, colspan: 1 })
    }
  }
  const rows: Node[] = []
  const rowType = schema.nodes['table_row']!
  for (let r = 0; r < height; r++) {
    const rowCells = cells
      .filter((c) => c.row === r)
      .sort((a, b) => a.col - b.col)
      .map((c) => {
        const old = c.node.attrs['colwidth'] as number[] | null
        let colwidth: number[] | null = null
        if (old) colwidth = Array.from({ length: c.colspan }, (_v, i) => old[i] ?? 0)
        if (colwidth && !colwidth.some((w) => w)) colwidth = null
        return c.node.type.create(
          { ...c.node.attrs, rowspan: c.rowspan, colspan: c.colspan, colwidth },
          c.node.content,
          c.node.marks,
        )
      })
    rows.push(rowType.create(null, Fragment.fromArray(rowCells)))
  }
  return table.type.create(table.attrs, Fragment.fromArray(rows))
}

/** Grid cells of a table as build cells (a starting point for operations). */
export function toBuildCells(grid: TableGrid): BuildCell[] {
  return grid.cells.map(({ node, row, col, rowspan, colspan }) => ({
    node,
    row,
    col,
    rowspan,
    colspan,
  }))
}

/** Position (relative to the table content start) of the cell starting at (row, col) in a built table. */
export function cellPosIn(table: Node, row: number, col: number): number | null {
  const grid = TableGrid.of(table)
  const cell = grid.at(row, col)
  return cell ? cell.pos : null
}
