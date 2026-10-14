import { describe, expect, it } from 'vitest'
import { doc, p, quote, b } from '../helpers/schema.js'

describe('ResolvedPos', () => {
  // 0 <bq> 1 <p> 2 a 3 b 4 </p> 5 </bq> 6 <p> 7 c 8 </p> 9
  const d = doc(quote(p('ab')), p('c'))

  it('resolves depth and parent', () => {
    const $p = d.resolve(3)
    expect($p.depth).toBe(2)
    expect($p.parent.type.name).toBe('paragraph')
    expect($p.parentOffset).toBe(1)
    expect($p.textOffset).toBe(1)
    expect($p.start()).toBe(2)
    expect($p.end()).toBe(4)
    expect($p.before()).toBe(1)
    expect($p.after()).toBe(5)
    expect($p.before(1)).toBe(0)
    expect($p.toString()).toBe('blockquote_0/paragraph_0:1')
  })

  it('resolves boundaries', () => {
    expect(d.resolve(0).depth).toBe(0)
    expect(d.resolve(1).depth).toBe(1)
    expect(d.resolve(6).depth).toBe(0)
    expect(d.resolve(6).index()).toBe(1)
    expect(d.resolve(9).index()).toBe(2)
  })

  it('gives nodes around', () => {
    const $p = d.resolve(3)
    expect($p.nodeBefore!.text).toBe('a')
    expect($p.nodeAfter!.text).toBe('b')
    expect(d.resolve(7).nodeBefore).toBeNull()
  })

  it('computes shared depth', () => {
    expect(d.resolve(2).sharedDepth(4)).toBe(2)
    expect(d.resolve(2).sharedDepth(7)).toBe(0)
  })

  it('computes marks at position', () => {
    const md = doc(p('a', b('bc'), 'd'))
    expect(
      md
        .resolve(3)
        .marks()
        .map((m) => m.type.name),
    ).toEqual(['bold'])
    expect(
      md
        .resolve(4)
        .marks()
        .map((m) => m.type.name),
    ).toEqual(['bold'])
    expect(md.resolve(2).marks()).toEqual([])
  })

  it('drops non-inclusive marks at their end', () => {
    const link = p().type.schema.mark('link', { href: 'x' })
    const ld = doc(p(p().type.schema.text('ab', [link]), 'c'))
    expect(ld.resolve(3).marks()).toEqual([])
    expect(ld.resolve(2).marks()).toEqual([link])
  })

  it('rejects out-of-range positions', () => {
    expect(() => d.resolve(10)).toThrow(RangeError)
    expect(() => d.resolve(-1)).toThrow(RangeError)
  })
})
