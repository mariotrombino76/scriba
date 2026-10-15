import { describe, expect, it } from 'vitest'
import { Fragment, Transform, insertContent, type Node } from '../../src/index.js'
import { b, doc, h, p, pre, quote, schema } from '../helpers/schema.js'

const cell = (...c: Node[]) => schema.node('table_cell', null, c)
const row = (...c: Node[]) => schema.node('table_row', null, c)
const table = (...c: Node[]) => schema.node('table', null, c)

function paste(d: Node, from: number, content: Node[], to = from) {
  const tr = new Transform(d)
  const end = insertContent(tr, from, to, Fragment.fromArray(content))
  return { doc: tr.doc, end, tr }
}

/** Every successful insertion must be exactly undoable. */
function undoable(r: ReturnType<typeof paste>, original: Node) {
  let cur = r.doc
  for (let i = r.tr.steps.length - 1; i >= 0; i--)
    cur = r.tr.steps[i]!.invert(r.tr.docs[i]!).apply(cur).doc!
  expect(cur.eq(original)).toBe(true)
}

describe('insertContent', () => {
  it('flows inline content into the current textblock', () => {
    const d = doc(p('ad'))
    const r = paste(d, 2, [schema.text('b'), b('c')])
    expect(r.doc.eq(doc(p('ab', b('c'), 'd')))).toBe(true)
    expect(r.end).toBe(4)
    undoable(r, d)
  })

  it('pastes paragraphs in the middle of a paragraph (split and sew)', () => {
    const d = doc(p('xy'))
    const r = paste(d, 2, [p('a'), p('b')])
    expect(r.doc.eq(doc(p('xa'), p('by')))).toBe(true)
    expect(r.doc.resolve(r.end!).parent.textContent).toBe('by')
    undoable(r, d)
  })

  it('replaces an empty paragraph with the pasted blocks', () => {
    const d = doc(p('x'), p(), p('z'))
    const r = paste(d, 4, [h(2, 'T'), p('a')])
    expect(r.doc.eq(doc(p('x'), h(2, 'T'), p('a'), p('z')))).toBe(true)
    undoable(r, d)
  })

  it('a lone heading pasted into an empty paragraph stays a heading', () => {
    const r = paste(doc(p()), 1, [h(1, 'T')])
    expect(r.doc.eq(doc(h(1, 'T')))).toBe(true)
  })

  it('splits a paragraph around blocks that cannot merge with it', () => {
    const d = doc(p('ab'))
    const r = paste(d, 2, [quote(p('q'))])
    expect(r.doc.eq(doc(p('a'), quote(p('q')), p('b')))).toBe(true)
    undoable(r, d)
  })

  it('climbs out of containers only as far as needed, never out of a table cell', () => {
    const d = doc(table(row(cell(p('ab')))))
    const r = paste(d, 5, [h(1, 'T'), quote(p('q'))])
    // like word processors: the first pasted block joins the text before the cursor
    expect(r.doc.eq(doc(table(row(cell(p('aT'), quote(p('q')), p('b'))))))).toBe(true)
    undoable(r, d)
  })

  it('pastes plain text into code blocks', () => {
    const r = paste(doc(pre('ab')), 2, [h(1, 'T'), p('x', b('y'))])
    expect(r.doc.eq(doc(pre('aT\nxyb')))).toBe(true)
  })

  it('replaces a selection across blocks', () => {
    const d = doc(p('abc'), p('def'))
    const r = paste(d, 2, [p('X'), p('Y')], 7)
    // 0 <p> 1 a 2 b 3 c 4 </p> 5 <p> 6 d 7 e 8 f 9 </p>: [2, 7) removes "bc" and "d"
    expect(r.doc.eq(doc(p('aX'), p('Yef')))).toBe(true)
    undoable(r, d)
  })

  it('pastes into a heading keeping the heading for the first part', () => {
    const r = paste(doc(h(2, 'ab')), 2, [p('x'), p('y')])
    expect(r.doc.eq(doc(h(2, 'ax'), p('yb')))).toBe(true)
  })
})
