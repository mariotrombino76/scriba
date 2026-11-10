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
  type Node,
} from '@scriba-editor/core'
import { JSDOM } from 'jsdom'
import { compareCellText, parseLocaleNumber, sortTable, tableNodes } from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...tableNodes },
  marks: basicSchemaSpec.marks,
})
const { window } = new JSDOM('')
const parse = (html: string) =>
  parseHTML(schema, new window.DOMParser().parseFromString(html, 'text/html').body)

/** Cell texts, row by row. */
function cells(doc: Node): string[][] {
  const rows: string[][] = []
  doc.descendants((node) => {
    if (node.type.name !== 'table_row') return true
    const row: string[] = []
    node.forEach((cell) => row.push(cell.textContent))
    rows.push(row)
    return false
  })
  return rows
}

const row = (...texts: string[]) => `<tr>${texts.map((t) => `<td>${t}</td>`).join('')}</tr>`
const head = (...texts: string[]) => `<tr>${texts.map((t) => `<th>${t}</th>`).join('')}</tr>`

/** State with the cursor at the start of the cell containing `text`. */
function stateIn(source: string, text: string): EditorState {
  const doc = parse(source + '<p></p>')
  let pos = -1
  doc.descendants((node, p) => {
    if (pos < 0 && node.isTextblock && node.textContent === text) pos = p + 1
    return pos < 0
  })
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, pos),
    plugins: [history()],
  })
}
const sort = (state: EditorState, order: 'asc' | 'desc', locale = 'it-IT') => {
  let next = state
  const ok = sortTable(order, { locale })(state, (tr) => (next = state.apply(tr)))
  return { ok, state: next }
}

describe('values', () => {
  it('reads numbers in the locale: decimal comma in Italian, point in English', () => {
    expect(parseLocaleNumber('1.234,5', 'it-IT')).toBe(1234.5)
    expect(parseLocaleNumber('1,234.5', 'en-US')).toBe(1234.5)
    expect(parseLocaleNumber('€ 12,50', 'it-IT')).toBe(12.5)
    expect(parseLocaleNumber('-3', 'it-IT')).toBe(-3)
    expect(parseLocaleNumber('15 %', 'it-IT')).toBe(15)
    expect(parseLocaleNumber('Roma', 'it-IT')).toBeNull()
    expect(parseLocaleNumber('1.2.3,4,5', 'it-IT')).toBeNull()
  })

  it('compares numbers by value, text alphabetically (accents and case aside, 2 before 10)', () => {
    expect(compareCellText('9', '10', 'it-IT')).toBeLessThan(0)
    expect(compareCellText('1.000', '999', 'it-IT')).toBeGreaterThan(0)
    expect(compareCellText('éclair', 'Fragola', 'it-IT')).toBeLessThan(0)
    expect(compareCellText('voce 2', 'voce 10', 'it-IT')).toBeLessThan(0)
  })
})

describe('sortTable', () => {
  const TABLE = `<table>${head('Città', 'Abitanti')}${row('Torino', '848.885')}${row('Roma', '2.749.031')}${row('Milano', '1.354.196')}</table>`

  it('sorts the rows by the column of the cursor; the header row stays', () => {
    const byName = sort(stateIn(TABLE, 'Roma'), 'asc').state
    expect(cells(byName.doc)).toEqual([
      ['Città', 'Abitanti'],
      ['Milano', '1.354.196'],
      ['Roma', '2.749.031'],
      ['Torino', '848.885'],
    ])
    const byPeople = sort(stateIn(TABLE, '848.885'), 'desc').state
    expect(cells(byPeople.doc).map((r) => r[0])).toEqual(['Città', 'Roma', 'Milano', 'Torino'])
  })

  it('also works from the header cell, and the cursor follows its row', () => {
    const { state } = sort(stateIn(TABLE, 'Torino'), 'asc')
    expect(state.selection.$head.parent.textContent).toBe('Torino')
    const fromHeader = sort(stateIn(TABLE, 'Città'), 'desc').state
    expect(cells(fromHeader.doc).map((r) => r[0])).toEqual(['Città', 'Torino', 'Roma', 'Milano'])
  })

  it('empty cells go last in both orders; equal values keep their order', () => {
    const source = `<table>${row('b', '1')}${row('', '2')}${row('a', '3')}${row('b', '4')}</table>`
    const asc = sort(stateIn(source, 'a'), 'asc').state
    expect(cells(asc.doc)).toEqual([
      ['a', '3'],
      ['b', '1'],
      ['b', '4'],
      ['', '2'],
    ])
    const desc = sort(stateIn(source, 'a'), 'desc').state
    expect(cells(desc.doc).map((r) => r[1])).toEqual(['1', '4', '3', '2'])
  })

  it('formatting moves with the row, and one undo puts everything back', () => {
    const source = `<table>${row('<strong>b</strong>')}${row('<em>a</em>')}</table>`
    const sorted = sort(stateIn(source, 'a'), 'asc').state
    expect(serializeHTML(sorted.doc)).toContain(
      '<tr><td><p><em>a</em></p></td></tr><tr><td><p><strong>b</strong></p></td></tr>',
    )
    let back = sorted
    undo(sorted, (tr) => (back = sorted.apply(tr)))
    expect(cells(back.doc)).toEqual([['b'], ['a']])
  })

  it('without a locale: the language of the content (lang around the editor)', () => {
    const page = new JSDOM('<div lang="it"><div id="e"></div></div>').window.document
    const view = { dom: page.getElementById('e')!, state: stateIn(TABLE, '848.885'), dispatch() {} }
    let next = view.state
    sortTable('desc')(view.state, (tr) => (next = view.state.apply(tr)), view)
    expect(cells(next.doc).map((r) => r[0])).toEqual(['Città', 'Roma', 'Milano', 'Torino'])
  })

  it('not possible with cells merged across rows, a single row, or outside a table', () => {
    const merged = `<table>${row('b', 'x')}<tr><td rowspan="2">a</td><td>y</td></tr>${row('z')}</table>`
    expect(sortTable('asc')(stateIn(merged, 'x'))).toBe(false)
    expect(sortTable('asc')(stateIn(`<table>${head('H')}${row('a')}</table>`, 'a'))).toBe(false)
    expect(sortTable('asc')(stateIn('<p>testo</p>', 'testo'))).toBe(false)
    // merged across columns is fine: the row moves whole
    const wide = `<table>${row('b', 'y')}<tr><td colspan="2">a</td></tr></table>`
    expect(cells(sort(stateIn(wide, 'b'), 'asc').state.doc)).toEqual([['a'], ['b', 'y']])
  })
})
