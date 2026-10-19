import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  formatKeymap,
  insertNonBreakingSpace,
  parseHTML,
  serializeHTML,
  toggleMark,
  type Command,
} from '@scriba/core'
import { JSDOM } from 'jsdom'
import { listNodes, listStyleMenus } from '../../list/src/index.js'
import {
  directionItems,
  hasLineHeight,
  lineHeightMenu,
  setLineHeight,
  setTextDirection,
  textStyleMarks,
  withBlockStyles,
} from '../src/index.js'

const schema = new Schema({
  nodes: withBlockStyles({ ...basicSchemaSpec.nodes, ...listNodes }),
  marks: { ...basicSchemaSpec.marks, ...textStyleMarks },
})
const { DOMParser } = new JSDOM('').window
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)

function run(html: string, from: number, to: number, cmd: Command) {
  const doc = parse(html)
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to) })
  const ok = cmd(state, (tr) => (state = state.apply(tr)))
  return { ok, html: serializeHTML(state.doc), state }
}

describe('superscript and subscript', () => {
  it('toggle, exclude each other, keys Mod-. and Mod-,', () => {
    const sup = toggleMark(schema.marks['superscript']!)
    const sub = toggleMark(schema.marks['subscript']!)
    const once = run('<p>x2</p>', 2, 3, sup)
    expect(once.html).toBe('<p>x<sup>2</sup></p>')
    let state = once.state
    sub(state, (tr) => (state = state.apply(tr)))
    expect(serializeHTML(state.doc)).toBe('<p>x<sub>2</sub></p>')
    const keys = formatKeymap(schema)
    expect(keys['Mod-.']).toBeDefined()
    expect(keys['Mod-,']).toBeDefined()
  })
})

describe('non-breaking space', () => {
  it('inserts U+00A0, kept in HTML', () => {
    const r = run('<p>10km</p>', 3, 3, insertNonBreakingSpace)
    expect(r.state.doc.textContent).toBe('10 km')
    expect(serializeHTML(parse(r.html))).toBe(r.html)
    expect(formatKeymap(schema)['Shift-Mod- ']).toBe(insertNonBreakingSpace)
  })
})

describe('line height', () => {
  it('sets, reads back from Word (150%), resets to the default', () => {
    const r = run('<p>a</p><h2>b</h2>', 1, 4, setLineHeight('1.5'))
    expect(r.html).toBe('<p style="line-height: 1.5">a</p><h2 style="line-height: 1.5">b</h2>')
    expect(hasLineHeight(r.state, '1.5')).toBe(true)
    expect(serializeHTML(parse('<p style="line-height:200%">x</p>'))).toBe(
      '<p style="line-height: 2">x</p>',
    )
    expect(run(r.html, 1, 1, setLineHeight(null)).html).toBe(
      '<p>a</p><h2 style="line-height: 1.5">b</h2>',
    )
    expect(lineHeightMenu().entries.map((e) => e.id)).toEqual([
      'line-height-default',
      'line-height-1',
      'line-height-1.15',
      'line-height-1.5',
      'line-height-2',
    ])
  })
})

describe('text direction', () => {
  it('right to left on the blocks; left to right is the default (no attribute)', () => {
    const rtl = run('<p>a</p>', 1, 1, setTextDirection('rtl'))
    expect(rtl.html).toBe('<p dir="rtl">a</p>')
    expect(run(rtl.html, 1, 1, setTextDirection('ltr')).html).toBe('<p>a</p>')
    // Google Docs writes dir="ltr" everywhere: dropped
    expect(serializeHTML(parse('<p dir="ltr">x</p>'))).toBe('<p>x</p>')
    expect(directionItems().map((i) => i.id)).toEqual(['dir-ltr', 'dir-rtl'])
  })
})

describe('list styles', () => {
  const [bullets, numbering] = listStyleMenus(schema)
  const entry = (menu: typeof bullets, id: string) => menu!.entries.find((e) => e.id === id)!

  it('in a list: changes its style; elsewhere: starts a list with that style', () => {
    const inList = run('<ol><li><p>a</p></li></ol>', 3, 3, entry(numbering, 'numbering-i').command)
    expect(inList.html).toBe('<ol type="i"><li><p>a</p></li></ol>')
    expect(entry(numbering, 'numbering-i').isActive!(inList.state)).toBe(true)
    const fresh = run('<p>a</p>', 1, 1, entry(bullets, 'bullet-square').command)
    expect(fresh.html).toBe('<ul style="list-style-type: square"><li><p>a</p></li></ul>')
    expect(run(fresh.html, 3, 3, entry(bullets, 'bullet-disc').command).html).toBe(
      '<ul><li><p>a</p></li></ul>',
    )
  })

  it('reads Word styles; the default disc and 1, 2, 3 add nothing', () => {
    expect(
      serializeHTML(
        parse(
          '<ol style="list-style-type:lower-alpha"><li><p>a</p></li></ol><ol type="1"><li><p>b</p></li></ol><ul style="list-style-type:disc"><li><p>c</p></li></ul>',
        ),
      ),
    ).toBe(
      '<ol type="a"><li><p>a</p></li></ol><ol><li><p>b</p></li></ol><ul><li><p>c</p></li></ul>',
    )
  })
})
