import { describe, expect, it } from 'vitest'
import { Mapping, StepMap } from '../../src/index.js'

describe('StepMap', () => {
  // "Replace 2 tokens at position 5 with 4 tokens"
  const map = new StepMap([5, 2, 4])

  it('maps positions before, inside and after a change', () => {
    expect(map.map(3)).toBe(3)
    expect(map.map(5, -1)).toBe(5)
    expect(map.map(5, 1)).toBe(5)
    expect(map.map(6, 1)).toBe(9)
    expect(map.map(6, -1)).toBe(5)
    expect(map.map(7)).toBe(9)
    expect(map.map(10)).toBe(12)
  })

  it('uses assoc for pure insertions', () => {
    const ins = StepMap.replace(4, 4, 3)
    expect(ins.map(4, -1)).toBe(4)
    expect(ins.map(4, 1)).toBe(7)
  })

  it('reports deletions', () => {
    const del = StepMap.replace(2, 6, 0)
    expect(del.mapResult(4).deleted).toBe(true)
    expect(del.mapResult(2, 1).deleted).toBe(true)
    expect(del.mapResult(2, -1).deleted).toBe(false)
    expect(del.mapResult(7).deleted).toBe(false)
    expect(del.map(7)).toBe(3)
  })

  it('inverts', () => {
    const inv = map.invert()
    expect(inv.map(12)).toBe(10)
    expect(inv.map(3)).toBe(3)
    const two = new StepMap([2, 1, 3, 10, 2, 0])
    for (const pos of [0, 1, 5, 9, 14]) expect(two.invert().map(two.map(pos))).toBe(pos)
  })

  it('iterates ranges', () => {
    const seen: number[][] = []
    new StepMap([2, 1, 3, 10, 2, 0]).forEach((a, b, c, d) => seen.push([a, b, c, d]))
    expect(seen).toEqual([
      [2, 3, 2, 5],
      [10, 12, 12, 12],
    ])
  })
})

describe('Mapping', () => {
  it('composes maps in order and inverts', () => {
    const m = new Mapping([StepMap.replace(0, 0, 2), StepMap.replace(5, 7, 0)])
    expect(m.map(3)).toBe(5)
    expect(m.map(6)).toBe(6)
    expect(m.map(10)).toBe(10)
    expect(m.invert().map(10)).toBe(10)
    expect(m.slice(1).map(6)).toBe(5)
  })
})
