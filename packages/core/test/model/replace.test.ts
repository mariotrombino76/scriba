import { describe, expect, it } from 'vitest'
import { Fragment, ReplaceError, Slice } from '../../src/index.js'
import { b, doc, h, img, p, quote, schema } from '../helpers/schema.js'

const str = (n: { toString(): string }) => n.toString()

describe('Node.slice', () => {
  it('slices text inside one block as inline content', () => {
    const s = doc(p('abcd')).slice(2, 4)
    expect(s.openStart).toBe(0)
    expect(s.openEnd).toBe(0)
    expect(str(s.content)).toBe('"bc"')
  })

  it('slices across blocks', () => {
    const s = doc(p('ab'), p('cd')).slice(2, 6)
    expect(str(s.content)).toBe('paragraph("b"), paragraph("c")')
    expect(s.size).toBe(4)
  })

  it('slices whole nodes closed', () => {
    const s = doc(p('ab'), p('cd')).slice(0, 4)
    expect(s.openStart).toBe(0)
    expect(s.openEnd).toBe(0)
  })
})

describe('Node.replace', () => {
  it('inserts inline text', () => {
    const d = doc(p('ad'))
    const r = d.replace(2, 2, new Slice(Fragment.from(schema.text('bc')), 0, 0))
    expect(r.eq(doc(p('abcd')))).toBe(true)
  })

  it('deletes inside a paragraph', () => {
    expect(
      doc(p('abcd'))
        .replace(2, 4, Slice.empty)
        .eq(doc(p('ad'))),
    ).toBe(true)
  })

  it('joins paragraphs when deleting across them', () => {
    const r = doc(p('ab'), p('cd')).replace(2, 6, Slice.empty)
    expect(r.eq(doc(p('ad')))).toBe(true)
  })

  it('keeps the left block type when joining', () => {
    const r = doc(h(1, 'ab'), p('cd')).replace(2, 6, Slice.empty)
    expect(r.eq(doc(h(1, 'ad')))).toBe(true)
  })

  it('deletes across different depths', () => {
    // bq(p("ab")) p("cd") — from inside the quote paragraph to inside the second paragraph
    const d = doc(quote(p('ab')), p('cd'))
    // depths differ (2 vs 1): an empty flat slice cannot line up both sides
    expect(() => d.replace(3, 8, Slice.empty)).toThrow(ReplaceError)
    // lines up, but would join a blockquote with a paragraph → schema violation
    expect(() => d.replace(3, 8, new Slice(Fragment.from(p()), 1, 0))).toThrow(ReplaceError)
    // from inside the quote to the doc level after it: slice open 2 on the left only
    const r = d.replace(3, 6, new Slice(Fragment.from(quote(p())), 2, 0))
    expect(r.eq(doc(quote(p('a')), p('cd')))).toBe(true)
  })

  it('splits a paragraph with an open slice', () => {
    const split = new Slice(Fragment.from([p(), p()]), 1, 1)
    const r = doc(p('abcd')).replace(3, 3, split)
    expect(r.eq(doc(p('ab'), p('cd')))).toBe(true)
  })

  it('pastes multi-paragraph open slice', () => {
    const src = doc(p('xy'), p('zw'))
    const slice = src.slice(2, 6) // p("y") p("z") open both sides
    const r = doc(h(2, 'abcd')).replace(3, 3, slice)
    expect(r.eq(doc(h(2, 'aby'), p('zcd')))).toBe(true)
  })

  it('replaces a range with a slice from another document', () => {
    const slice = doc(p('XY')).slice(1, 3)
    const r = doc(p('ab'), p('cd')).replace(2, 6, slice)
    expect(r.eq(doc(p('aXYd')))).toBe(true)
  })

  it('inserts block nodes between blocks', () => {
    const r = doc(p('a'), p('b')).replace(3, 3, new Slice(Fragment.from(h(1, 'T')), 0, 0))
    expect(r.eq(doc(p('a'), h(1, 'T'), p('b')))).toBe(true)
  })

  it('preserves marks and merges text', () => {
    const r = doc(p(b('ab'))).replace(2, 2, new Slice(Fragment.from(b('X')), 0, 0))
    expect(r.eq(doc(p(b('aXb'))))).toBe(true)
    expect(r.firstChild!.childCount).toBe(1)
  })

  it('rejects content that breaks the schema', () => {
    // inline content at document level
    expect(() =>
      doc(p('a')).replace(0, 0, new Slice(Fragment.from(schema.text('x')), 0, 0)),
    ).toThrow(ReplaceError)
    // removing the only block of doc
    expect(() => doc(p('a')).replace(0, 3, Slice.empty)).toThrow(ReplaceError)
    // image inside code block
    const d = schema.node('doc', null, [schema.node('code_block', null, [schema.text('x')])])
    expect(() => d.replace(1, 1, new Slice(Fragment.from(img('a')), 0, 0))).toThrow(ReplaceError)
  })

  it('round-trips slice then replace back', () => {
    const d = doc(p('ab'), quote(p('cd'), p('ef')), p('gh'))
    for (let from = 0; from <= d.content.size; from++) {
      for (let to = from; to <= d.content.size; to++) {
        const $from = d.resolve(from)
        const $to = d.resolve(to)
        if ($from.depth !== $to.depth) continue
        let cut
        try {
          cut = d.replace(from, to, Slice.empty)
        } catch {
          continue
        }
        // re-inserting the removed slice restores the original document
        const slice = d.slice(from, to)
        try {
          expect(cut.replace(from, from, slice).eq(d)).toBe(true)
        } catch (e) {
          if (!(e instanceof ReplaceError)) throw e
        }
      }
    }
  })
})
