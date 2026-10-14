import { describe, expect, it } from 'vitest'
import { Transform, TransformError } from '../../src/index.js'
import { b, bi, doc, h, i, p, pre, quote, schema } from '../helpers/schema.js'

const tr = (d: ReturnType<typeof doc>) => new Transform(d)

describe('Transform', () => {
  it('chains steps and tracks docs and mapping', () => {
    const t = tr(doc(p('ab')))
      .insert(2, schema.text('X'))
      .delete(1, 2)
    expect(t.doc.eq(doc(p('Xb')))).toBe(true)
    expect(t.steps).toHaveLength(2)
    expect(t.docs[0]!.eq(doc(p('ab')))).toBe(true)
    expect(t.mapping.map(3)).toBe(3)
  })

  it('throws TransformError on invalid steps', () => {
    expect(() => tr(doc(p('a'))).delete(0, 3)).toThrow(TransformError)
  })

  describe('delete across depths', () => {
    it('joins a following paragraph into a quoted one', () => {
      // bq(p("ab")) p("cd"): delete from after "a" to after "c"
      const t = tr(doc(quote(p('ab')), p('cd'))).delete(3, 8)
      expect(t.doc.eq(doc(quote(p('ad'))))).toBe(true)
    })

    it('joins a quoted paragraph into a preceding one, keeping the rest of the quote', () => {
      // p("ab") bq(p("cd"), p("ef"))
      const d = doc(p('ab'), quote(p('cd'), p('ef')))
      const t = tr(d).delete(2, 7)
      expect(t.doc.eq(doc(p('ad'), quote(p('ef'))))).toBe(true)
    })

    it('drops quotes left empty', () => {
      const t = tr(doc(p('ab'), quote(p('cd')))).delete(2, 7)
      expect(t.doc.eq(doc(p('ad')))).toBe(true)
    })
  })

  describe('marks', () => {
    it('adds only where missing', () => {
      const t = tr(doc(p('a', b('b'), 'c'))).addMark(1, 4, schema.mark('bold'))
      expect(t.doc.eq(doc(p(b('abc'))))).toBe(true)
      expect(t.steps).toHaveLength(2)
    })

    it('respects excludes', () => {
      const t = tr(doc(p(b('ab')))).addMark(1, 3, schema.mark('code'))
      expect(t.doc.firstChild!.firstChild!.marks.map((m) => m.type.name)).toEqual(['code'])
    })

    it('removes by mark, by type or all', () => {
      const d = doc(p(bi('ab')))
      expect(
        tr(d)
          .removeMark(1, 3, schema.mark('bold'))
          .doc.eq(doc(p(i('ab')))),
      ).toBe(true)
      expect(
        tr(d)
          .removeMark(1, 3, schema.marks.italic)
          .doc.eq(doc(p(b('ab')))),
      ).toBe(true)
      expect(
        tr(d)
          .removeMark(1, 3)
          .doc.eq(doc(p('ab'))),
      ).toBe(true)
    })
  })

  it('sets node attributes', () => {
    expect(
      tr(doc(h(1, 'x')))
        .setNodeAttrs(0, { level: 4 })
        .doc.eq(doc(h(4, 'x'))),
    ).toBe(true)
  })

  it('sets block type on a range, clearing incompatible content', () => {
    const t = tr(doc(p('a'), p(b('b')), h(1, 'c'))).setBlockType(0, 9, schema.nodes.code_block)
    expect(t.doc.eq(doc(pre('a'), pre('b'), pre('c')))).toBe(true)
    expect(
      tr(doc(p('a')))
        .setBlockType(0, 3, schema.nodes.heading, { level: 2 })
        .doc.eq(doc(h(2, 'a'))),
    ).toBe(true)
  })

  it('splits and joins', () => {
    const split = tr(doc(p('abcd'))).split(3)
    expect(split.doc.eq(doc(p('ab'), p('cd')))).toBe(true)
    expect(split.join(4).doc.eq(doc(p('abcd')))).toBe(true)
    const heading = tr(doc(h(1, 'ab'))).split(3, 1, [{ type: schema.nodes.paragraph }])
    expect(heading.doc.eq(doc(h(1, 'ab'), p()))).toBe(true)
    const deep = tr(doc(quote(p('ab')))).split(3, 2)
    expect(deep.doc.eq(doc(quote(p('a')), quote(p('b'))))).toBe(true)
  })
})
