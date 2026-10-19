import { describe, expect, it } from 'vitest'
import { Fragment, canReplace } from '../../src/index.js'
import { doc, h, p, quote, schema } from '../helpers/schema.js'

describe('canReplace', () => {
  const d = doc(p('a'), h(2, 'b'), quote(p('c')))
  const blocks = Fragment.from([p('x'), h(1, 'y')])

  it('"block+": new blocks anywhere, never an empty document, never inline content', () => {
    expect(d.type.contentExpr.repeated).not.toBeNull()
    expect(canReplace(d, 1, 2, blocks)).toBe(true) // replace the heading
    expect(canReplace(d, 0, 3)).toBe(false) // nothing left: "block+" needs one
    expect(canReplace(d, 0, 3, Fragment.from(p()))).toBe(true)
    expect(canReplace(d, 1, 1, Fragment.from(schema.text('x')))).toBe(false)
  })

  it('the same answers as the general matcher', () => {
    const expr = d.type.contentExpr
    const general = (from: number, to: number, content: Fragment) => {
      let state = expr.matchFragment(d.content, undefined, 0, from)
      if (state) state = expr.matchFragment(content, state)
      if (state) state = expr.matchFragment(d.content, state, to)
      return !!state && expr.validEnd(state)
    }
    const contents = [Fragment.empty, blocks, Fragment.from(schema.text('x')), Fragment.from(p())]
    for (let from = 0; from <= 3; from++)
      for (let to = from; to <= 3; to++)
        for (const c of contents) expect(canReplace(d, from, to, c)).toBe(general(from, to, c))
  })
})
