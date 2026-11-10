import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Node,
  type Transaction,
} from '@scriba-editor/core'
import { CellSelection, cellPosAt, tableAt } from './cell-selection.js'
import { TableGrid, buildTable, toBuildCells } from './grid.js'

export const tableNormalizeKey = new PluginKey('tableNormalize')

/** True when the table needs rebuilding: holes from short rows, or spans past the last row. */
function isIrregular(table: Node, grid: TableGrid): boolean {
  return !grid.isRectangular || grid.cells.some((c) => c.node.attrs['rowspan'] !== c.rowspan)
}

/** Makes every changed table rectangular (pasted or loaded tables can have short rows). */
function fixTables(state: EditorState, tr: Transaction): void {
  const tables: { pos: number; node: Node }[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.spec['tableRole'] === 'table') tables.push({ pos, node })
    return !node.isTextblock
  })
  for (const { pos, node } of tables.reverse()) {
    const grid = TableGrid.of(node)
    if (!isIrregular(node, grid)) continue
    const fixed = buildTable(node, toBuildCells(grid), grid.height, grid.width)
    if (fixed) tr.replaceWith(pos, pos + node.nodeSize, fixed)
  }
}

/**
 * Table housekeeping after each change:
 * - irregular tables are made rectangular (normalization, like the schema does for the rest);
 * - a text selection crossing cells of one table becomes a cell selection.
 */
export function tableNormalize(): Plugin {
  return new Plugin({
    key: tableNormalizeKey,
    appendTransaction(trs, oldState, newState) {
      const tr = newState.tr
      if (trs.some((t) => t.docChanged)) fixTables(newState, tr)
      // The document never ends with a table: there is always a line below to click or type in.
      const last = tr.doc.lastChild
      const paragraph = tr.doc.type.schema.nodes['paragraph']
      if (last?.type.spec['tableRole'] === 'table' && paragraph)
        tr.insert(tr.doc.content.size, paragraph.create())
      const sel = tr.selection
      if (sel instanceof TextSelection && !sel.empty) {
        const anchorCell = cellPosAt(sel.$anchor)
        const headCell = cellPosAt(sel.$head)
        const table = tableAt(sel.$anchor)
        if (
          table &&
          anchorCell !== null &&
          headCell !== null &&
          anchorCell !== headCell &&
          tableAt(sel.$head)?.pos === table.pos
        ) {
          // Extending an existing cell selection keeps its anchor cell.
          const old = oldState.selection
          const keep =
            old instanceof CellSelection && !tr.docChanged && old.context()?.pos === table.pos
          const anchor = keep ? old.anchor : anchorCell
          tr.setSelection(CellSelection.create(tr.doc, anchor, headCell))
        }
      }
      return tr.docChanged || tr.selectionSet ? tr : null
    },
  })
}
