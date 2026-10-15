import { describe, expect, it } from 'vitest'
import {
  AllSelection,
  Mapping,
  NodeSelection,
  Selection,
  StepMap,
  TextSelection,
} from '../../src/index.js'
import { doc, h, img, p, quote } from '../helpers/schema.js'

describe('Selection', () => {
  const d = doc(p('ab'), quote(p('cd')), p('ef'))
  // 0 <p>1 a 2 b 3</p>4 <bq>5 <p>6 c 7 d 8</p>9 </bq>10 <p>11 e 12 f 13</p>14

  it('orders from/to regardless of direction', () => {
    const sel = TextSelection.create(d, 7, 2)
    expect([sel.from, sel.to, sel.anchor, sel.head]).toEqual([2, 7, 7, 2])
    expect(sel.empty).toBe(false)
  })

  it('finds the nearest cursor position', () => {
    expect(Selection.near(d.resolve(4)).head).toBe(6)
    expect(Selection.near(d.resolve(4), -1).head).toBe(3)
    expect(Selection.near(d.resolve(10)).head).toBe(11)
    expect(Selection.atStart(d).head).toBe(1)
    expect(Selection.atEnd(d).head).toBe(13)
  })

  it('shows its own anchor and head in the DOM by default', () => {
    expect(TextSelection.create(d, 7, 2).domRange()).toEqual({ anchor: 7, head: 2 })
  })

  it('a selected block keeps its node selection when the DOM reads back the text just inside it', () => {
    const sel = NodeSelection.create(d, 4) // the quote
    expect(sel.preserves(TextSelection.create(d, 6, 8))).toBe(true)
    expect(sel.preserves(TextSelection.create(d, 6, 7))).toBe(false) // a real selection inside
  })

  it('maps through changes', () => {
    const sel = TextSelection.create(d, 2)
    const mapped = sel.map(d.replace(1, 1, d.slice(1, 2)), new Mapping([StepMap.replace(1, 1, 1)]))
    expect(mapped.head).toBe(3)
  })

  it('node selection covers one node', () => {
    const withImg = doc(p('a', img('x.png'), 'b'))
    const sel = NodeSelection.create(withImg, 2)
    expect(sel.node.type.name).toBe('image')
    expect([sel.from, sel.to]).toEqual([2, 3])
  })

  it('round-trips JSON and rejects bad JSON', () => {
    const sel = TextSelection.create(d, 2, 7)
    expect(Selection.fromJSON(d, sel.toJSON()).eq(sel)).toBe(true)
    expect(Selection.fromJSON(d, { type: 'all' })).toBeInstanceOf(AllSelection)
    expect(() => Selection.fromJSON(d, { type: 'text', anchor: 999, head: 1 })).toThrow()
    expect(() => Selection.fromJSON(d, { type: 'bogus' } as never)).toThrow()
  })

  it('TextSelection.between moves off non-text positions', () => {
    const sel = TextSelection.between(d.resolve(0), d.resolve(14))
    expect([sel.from, sel.to]).toEqual([1, 13])
    expect(h(1, 'x')).toBeTruthy()
  })
})
