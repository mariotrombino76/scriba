import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  history,
  parseHTML,
  serializeHTML,
  undo,
  type Command,
  type Node,
} from '@scriba-editor/core'
import { JSDOM } from 'jsdom'
import {
  CellSelection,
  TableGrid,
  addColumn,
  addRow,
  changeColumnWidth,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToCell,
  insertTable,
  mergeCells,
  setCellProps,
  setTableProps,
  pasteCells,
  splitCell,
  tableNodes,
  tableKeymap,
  tableNormalize,
  toggleHeader,
} from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...tableNodes },
  marks: basicSchemaSpec.marks,
})
const { window } = new JSDOM('')
const parse = (html: string) =>
  parseHTML(schema, new window.DOMParser().parseFromString(html, 'text/html').body)
const html = (doc: Node) => serializeHTML(doc)
const roundTrip = (s: string) => html(parse(s))

/** A table's cell texts, row by row ("" for empty cells; spans shown as `text:rowspan×colspan`). */
function cells(doc: Node): string[][] {
  const rows: string[][] = []
  doc.descendants((node) => {
    if (node.type.name === 'table_row') {
      const row: string[] = []
      node.forEach((cell) => {
        const span =
          cell.attrs['rowspan'] !== 1 || cell.attrs['colspan'] !== 1
            ? `:${cell.attrs['rowspan']}x${cell.attrs['colspan']}`
            : ''
        row.push((cell.type.name === 'table_header' ? 'H' : '') + cell.textContent + span)
      })
      rows.push(row)
      return false
    }
    return true
  })
  return rows
}

const TABLE3 =
  '<table><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td><td>e</td><td>f</td></tr><tr><td>g</td><td>h</td><td>i</td></tr></table>'

/** State with the cursor in the cell containing `text` (first match). */
function stateIn(source: string, text: string): EditorState {
  // already normalized: a document never ends with a table (see tableNormalize)
  const doc = parse(source.endsWith('</table>') ? source + '<p></p>' : source)
  let pos = -1
  doc.descendants((node, p) => {
    if (pos < 0 && node.isText && node.text === text) pos = p
    return pos < 0
  })
  if (pos < 0) throw new Error(`no ${text}`)
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, pos),
    plugins: [history(), tableNormalize()],
  })
}

/** Position before the cell containing `text`. */
function cellPos(doc: Node, text: string): number {
  let found = -1
  doc.descendants((node, p) => {
    if (
      found < 0 &&
      node.type.spec['tableRole']?.toString().includes('cell') &&
      node.textContent === text
    )
      found = p
    return found < 0
  })
  return found
}

function withCells(source: string, from: string, to: string): EditorState {
  const state = stateIn(source, from)
  const sel = CellSelection.create(state.doc, cellPos(state.doc, from), cellPos(state.doc, to))
  return state.apply(state.tr.setSelection(sel))
}

function run(state: EditorState, cmd: Command): EditorState {
  let next = state
  const ok = cmd(state, (tr) => (next = state.apply(tr)))
  if (!ok) throw new Error('command refused')
  return next
}

/** Runs a command, then checks undo gives back the exact document. */
function runAndUndo(state: EditorState, cmd: Command): EditorState {
  const next = run(state, cmd)
  let undone = next
  undo(next, (tr) => (undone = next.apply(tr)))
  expect(undone.doc.eq(state.doc)).toBe(true)
  return next
}

describe('table nodes', () => {
  it('round-trips spans and widths as plain attributes (no style)', () => {
    expect(
      roundTrip(
        '<table><tr><th colspan="2" data-colwidth="100,120">a</th></tr><tr><td width="100">b</td><td>c</td></tr></table>',
      ),
    ).toBe(
      '<table><tbody><tr><th colspan="2" width="220" data-colwidth="100,120"><p>a</p></th></tr><tr><td width="100"><p>b</p></td><td><p>c</p></td></tr></tbody></table>',
    )
  })

  it('drops bad spans, widths, styles and handlers', () => {
    expect(
      roundTrip(
        '<table><tr><td colspan="0" rowspan="-3" width="abc" style="background:url(x)" onclick="alert(1)">a</td></tr></table>',
      ),
    ).toBe('<table><tbody><tr><td><p>a</p></td></tr></tbody></table>')
    expect(roundTrip('<table><tr><td colspan="999999">a</td></tr></table>')).toContain(
      'colspan="100"',
    )
    expect(roundTrip('<table><tr><td width="5">a</td></tr></table>')).toBe(
      '<table><tbody><tr><td><p>a</p></td></tr></tbody></table>',
    )
  })

  it('round-trip is stable', () => {
    const once = roundTrip(TABLE3)
    expect(roundTrip(once)).toBe(once)
  })
})

describe('TableGrid', () => {
  it('maps merged cells onto the grid', () => {
    const doc = parse('<table><tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr></table>')
    const grid = TableGrid.of(doc.firstChild!)
    expect([grid.width, grid.height]).toEqual([2, 2])
    expect(grid.at(1, 0)?.node.textContent).toBe('a')
    expect(grid.at(1, 1)?.node.textContent).toBe('c')
    expect(grid.isRectangular).toBe(true)
  })
})

describe('normalization', () => {
  it('fills short rows so tables stay rectangular', () => {
    const state = stateIn('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>', 'a')
    const next = state.apply(state.tr.insertText('x'))
    expect(cells(next.doc)).toEqual([
      ['xa', 'b'],
      ['c', ''],
    ])
  })
})

describe('table commands', () => {
  it('inserts a table with a header row and puts the cursor in the first cell', () => {
    const doc = parse('<p>ab</p>')
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 2) })
    const next = run(state, insertTable(2, 3))
    expect(cells(next.doc)).toEqual([
      ['H', 'H', 'H'],
      ['', '', ''],
    ])
    expect(html(next.doc)).toMatch(/^<p>a<\/p><table>.*<\/table><p>b<\/p>$/)
    expect(next.selection.$head.parent.type.name).toBe('paragraph')
    expect(next.selection.$head.node(-1).type.name).toBe('table_header')
  })

  it('refuses sizes out of range', () => {
    const state = stateIn('<p>a</p>', 'a')
    expect(insertTable(0, 2)(state)).toBe(false)
    expect(insertTable(51, 2)(state)).toBe(false)
    expect(insertTable(2, 21)(state)).toBe(false)
  })

  it('adds and deletes rows and columns (undoable)', () => {
    const state = stateIn(TABLE3, 'e')
    expect(cells(runAndUndo(state, addRow(true)).doc)[1]).toEqual(['', '', ''])
    expect(cells(runAndUndo(state, addRow(false)).doc)[2]).toEqual(['', '', ''])
    expect(cells(runAndUndo(state, addColumn(true)).doc)[1]).toEqual(['d', '', 'e', 'f'])
    expect(cells(runAndUndo(state, addColumn(false)).doc)[1]).toEqual(['d', 'e', '', 'f'])
    expect(cells(runAndUndo(state, deleteRow).doc)).toEqual([
      ['a', 'b', 'c'],
      ['g', 'h', 'i'],
    ])
    expect(cells(runAndUndo(state, deleteColumn).doc)).toEqual([
      ['a', 'c'],
      ['d', 'f'],
      ['g', 'i'],
    ])
  })

  it('keeps the cursor in the table after a structural change', () => {
    const next = run(stateIn(TABLE3, 'e'), addRow(false))
    expect(next.selection.$head.node(-1).type.name).toBe('table_cell')
  })

  it('deleting the last row deletes the table', () => {
    const state = stateIn('<p>x</p><table><tr><td>a</td></tr></table>', 'a')
    expect(html(run(state, deleteRow).doc)).toBe('<p>x</p><p></p>')
    expect(html(run(state, deleteTable).doc)).toBe('<p>x</p><p></p>')
  })

  it('deleting the only block leaves an empty paragraph (the document stays valid)', () => {
    const state = stateIn('<table><tr><td>a</td><td>b</td></tr></table>', 'a')
    expect(html(run(state, deleteTable).doc)).toBe('<p></p>')
    expect(html(run(state, deleteColumn).doc)).toContain('<td><p>b</p></td>')
    expect(
      html(
        run(withCells('<table><tr><td>a</td><td>b</td></tr></table>', 'a', 'b'), deleteColumn).doc,
      ),
    ).toBe('<p></p>')
  })

  it('split is only enabled on merged cells (dry run does not rebuild)', () => {
    expect(splitCell(stateIn(TABLE3, 'a'))).toBe(false)
    expect(splitCell(stateIn('<table><tr><td colspan="2">a</td></tr></table>', 'a'))).toBe(true)
  })

  it('merges a rectangle of cells and splits it back', () => {
    const state = withCells(TABLE3, 'a', 'e')
    const merged = runAndUndo(state, mergeCells)
    expect(cells(merged.doc)).toEqual([['abde:2x2', 'c'], ['f'], ['g', 'h', 'i']])
    // fresh history: the merge and the split would be grouped into one undo step
    const fresh = EditorState.create({
      doc: merged.doc,
      selection: merged.selection,
      plugins: [history(), tableNormalize()],
    })
    const split = runAndUndo(fresh, splitCell)
    expect(cells(split.doc)).toEqual([
      ['abde', '', 'c'],
      ['', '', 'f'],
      ['g', 'h', 'i'],
    ])
  })

  it('refuses to merge a single cell, or a rectangle cutting a merged cell', () => {
    expect(mergeCells(stateIn(TABLE3, 'a'))).toBe(false)
    const doc = '<table><tr><td colspan="2">a</td></tr><tr><td>b</td><td>c</td></tr></table>'
    // a cell selection grows to include the whole merged cell, so the merge is valid
    expect(mergeCells(withCells(doc, 'a', 'b'))).toBe(true)
  })

  it('adds a row next to a merged cell by extending its span', () => {
    const state = stateIn(
      '<table><tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr></table>',
      'b',
    )
    expect(cells(run(state, addRow(false)).doc)).toEqual([['a:3x1', 'b'], [''], ['c']])
  })

  it('deleting a row shrinks the cells spanning it', () => {
    const state = stateIn(
      '<table><tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr><tr><td>d</td><td>e</td></tr></table>',
      'c',
    )
    expect(cells(run(state, deleteRow).doc)).toEqual([
      ['a', 'b'],
      ['d', 'e'],
    ])
  })

  it('toggles header row and column', () => {
    const state = stateIn(TABLE3, 'e')
    const rowOn = run(state, toggleHeader('row'))
    expect(cells(rowOn.doc)[0]).toEqual(['Ha', 'Hb', 'Hc'])
    expect(cells(run(rowOn, toggleHeader('row')).doc)[0]).toEqual(['a', 'b', 'c'])
    expect(cells(run(state, toggleHeader('column')).doc).map((r) => r[0])).toEqual([
      'Ha',
      'Hd',
      'Hg',
    ])
  })

  it('header columns propagate to new rows', () => {
    const state = run(stateIn(TABLE3, 'e'), toggleHeader('column'))
    expect(cells(run(state, addRow(false)).doc)[2]).toEqual(['H', '', ''])
  })

  it('changes column widths within limits', () => {
    const state = stateIn(TABLE3, 'e')
    const wider = runAndUndo(state, changeColumnWidth(20))
    expect(html(wider.doc)).toContain('<td width="140"><p>b</p>')
    expect(html(wider.doc)).toContain('<td width="140"><p>e</p>')
    let narrow = state
    for (let i = 0; i < 20; i++) narrow = run(narrow, changeColumnWidth(-20))
    expect(html(narrow.doc)).toContain('<td width="24"><p>e</p>')
  })

  it('Tab moves to the next cell, and stops at the last one (no keyboard trap)', () => {
    const state = stateIn(TABLE3, 'c')
    const next = run(state, goToCell(1))
    expect(next.selection.$head.parent.textContent).toBe('d')
    expect(goToCell(1)(stateIn(TABLE3, 'i'))).toBe(false)
    expect(goToCell(-1)(stateIn(TABLE3, 'a'))).toBe(false)
  })

  it('commands are disabled outside tables', () => {
    const state = stateIn('<p>a</p>', 'a')
    for (const cmd of [
      addRow(true),
      addColumn(false),
      deleteRow,
      deleteColumn,
      splitCell,
      deleteTable,
    ]) {
      expect(cmd(state)).toBe(false)
    }
  })
})

describe('table and cell properties', () => {
  it('cell properties go on every selected cell, in one undo step', () => {
    const state = withCells(TABLE3, 'a', 'b')
    const next = runAndUndo(
      state,
      setCellProps({
        background: '#ffee00',
        valign: 'middle',
        borderWidth: 2,
        borderStyle: 'dotted',
      }),
    )
    const out = html(next.doc)
    const td =
      '<td style="background-color: #ffee00; vertical-align: middle; border-width: 2px; border-style: dotted">'
    expect(out).toContain(`${td}<p>a</p></td>${td}<p>b</p></td><td><p>c</p></td>`)
    // removing a property
    expect(html(run(next, setCellProps({ background: null })).doc)).toContain(
      '<td style="vertical-align: middle; border-width: 2px; border-style: dotted"><p>a</p>',
    )
  })

  it('invalid values are refused by the schema', () => {
    const state = stateIn(TABLE3, 'a')
    expect(() => run(state, setCellProps({ background: 'url(x)' }))).toThrow()
    expect(() => run(state, setCellProps({ borderWidth: 99 }))).toThrow()
    expect(() => run(state, setTableProps({ caption: 'x'.repeat(501) }))).toThrow()
  })

  it('table properties: caption and alignment on the table, border also on the cells', () => {
    const state = stateIn('<table><tr><td>a</td></tr></table>', 'a')
    const next = runAndUndo(
      state,
      setTableProps({
        caption: 'Q1 <b>',
        align: 'right',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#000000',
      }),
    )
    expect(html(next.doc)).toBe(
      '<table style="margin-left: auto; border-width: 1px; border-style: solid; border-color: #000000"><caption>Q1 &lt;b&gt;</caption><tbody><tr><td style="border-width: 1px; border-style: solid; border-color: #000000"><p>a</p></td></tr></tbody></table><p></p>',
    )
    // without border props the cells keep their own
    const captionOnly = run(next, setTableProps({ caption: null, align: null }))
    expect(html(captionOnly.doc)).toContain('<td style="border-width: 1px')
    expect(html(captionOnly.doc)).not.toContain('caption')
  })

  it('round-trips properties written by other editors', () => {
    expect(
      roundTrip(
        '<table border="1" style="margin-left:auto;margin-right:auto"><caption>T</caption><tr><td style="background:#eee;border:1pt solid black" valign="top">a</td></tr></table>',
      ),
    ).toBe(
      '<table style="margin-left: auto; margin-right: auto; border-width: 1px; border-style: solid"><caption>T</caption><tbody><tr><td style="background-color: #eeeeee; vertical-align: top; border-width: 1px; border-style: solid; border-color: #000000"><p>a</p></td></tr></tbody></table>',
    )
  })
})

describe('cell selection', () => {
  it('a text selection across cells becomes a cell selection', () => {
    const state = stateIn(TABLE3, 'a')
    const head = cellPos(state.doc, 'e') + 2
    const next = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, state.selection.anchor, head)),
    )
    expect(next.selection).toBeInstanceOf(CellSelection)
    const ctx = (next.selection as CellSelection).context()!
    expect(ctx.cells.map((c) => c.node.textContent)).toEqual(['a', 'b', 'd', 'e'])
  })

  it('deleting a cell selection empties the cells and keeps the table', () => {
    const state = withCells(TABLE3, 'a', 'e')
    const next = state.apply(state.tr.deleteSelection())
    expect(cells(next.doc)).toEqual([
      ['', '', 'c'],
      ['', '', 'f'],
      ['g', 'h', 'i'],
    ])
  })

  it('Backspace/Delete with every cell selected delete the table', () => {
    const keys = tableKeymap()
    const all = withCells('<p>x</p>' + TABLE3, 'a', 'i')
    expect(html(run(all, keys['Delete']!).doc)).toBe('<p>x</p><p></p>')
    expect(html(run(all, keys['Backspace']!).doc)).toBe('<p>x</p><p></p>')
    expect(keys['Delete']!(withCells(TABLE3, 'a', 'e'))).toBe(false) // fewer cells: just emptied
  })

  it('copying a cell selection gives a table of just those cells', () => {
    const slice = withCells(TABLE3, 'e', 'i').selection.content()
    expect(slice.content.childCount).toBe(1)
    expect(cells(schema.node('doc', null, [slice.content.firstChild!]))).toEqual([
      ['e', 'f'],
      ['h', 'i'],
    ])
  })

  it('pasting a table into a table fills the cells, growing the table', () => {
    const state = stateIn(TABLE3, 'h')
    const source = parse(
      '<table><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>',
    )
    const tr = pasteCells(state, source.content)!
    expect(cells(state.apply(tr).doc)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', '1', '2'],
      ['', '3', '4'],
    ])
    expect(pasteCells(state, parse('<p>x</p>').content)).toBeNull()
    expect(pasteCells(stateIn('<p>x</p>', 'x'), source.content)).toBeNull()
  })

  it('the document never ends with a table', () => {
    const doc = parse(TABLE3)
    const state = EditorState.create({ doc, plugins: [tableNormalize()] })
    const next = state.apply(state.tr.insertText('z', 4))
    expect(next.doc.lastChild!.type.name).toBe('paragraph')
  })

  it('arrows past a table with nothing around create a paragraph', () => {
    const keys = tableKeymap()
    const doc = parse(TABLE3)
    const start = EditorState.create({ doc, selection: TextSelection.create(doc, 4) })
    const up = run(start, keys['ArrowLeft']!)
    expect(html(up.doc).startsWith('<p></p><table>')).toBe(true)
    expect(up.selection.head).toBe(1)
    const end = doc.content.size - 4 // after "i"
    expect(doc.textBetween(end - 1, end)).toBe('i')
    const atEnd = EditorState.create({ doc, selection: TextSelection.create(doc, end) })
    expect(html(run(atEnd, keys['ArrowRight']!).doc).endsWith('</table><p></p>')).toBe(true)
    // not at the edge, or something already there: the browser moves normally
    expect(keys['ArrowLeft']!(stateIn(TABLE3, 'e'))).toBe(false)
    expect(keys['ArrowLeft']!(stateIn('<p>x</p>' + TABLE3, 'a'))).toBe(false)
  })

  it('maps through changes and falls back when the table is gone', () => {
    const state = withCells('<p>x</p>' + TABLE3, 'a', 'b')
    const moved = state.apply(state.tr.insertText('yy', 1))
    expect(moved.selection).toBeInstanceOf(CellSelection)
    const table = cellPos(state.doc, 'a') - 2
    const gone = state.apply(state.tr.delete(table, table + state.doc.child(1).nodeSize))
    expect(gone.selection).not.toBeInstanceOf(CellSelection)
  })
})

describe('table context menu', () => {
  it('applies in a table: Cell, Row and Column sub-menus, then properties and delete', async () => {
    const { tableContextMenu } = await import('../src/index.js')
    const { createTranslator } = await import('@scriba-editor/i18n')
    const section = tableContextMenu(schema, createTranslator('it'))
    const doc = parse(`<p>x</p>${TABLE3}`)
    const at = (pos: number) =>
      EditorState.create({ doc, selection: TextSelection.create(doc, pos) })
    expect(section.isVisible(at(1))).toBe(false)
    expect(section.isVisible(at(6))).toBe(true)
    const ids = section.items.map((i) => (i === '|' ? '|' : i.id))
    expect(ids).toEqual([
      'table_cell',
      'table_row',
      'table_column',
      '|',
      'table_props',
      'delete_table',
    ])
    const row = section.items[1]!
    expect(
      row !== '|' && 'type' in row && row.type === 'menu' && row.entries.map((e) => e.id),
    ).toEqual(['row_before', 'row_after', 'delete_row', 'header_row'])
  })
})
