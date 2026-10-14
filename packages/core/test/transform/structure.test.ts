import { describe, expect, it } from 'vitest'
import {
  Fragment,
  ReplaceAroundStep,
  Slice,
  Step,
  Transform,
  blockRange,
  findWrapping,
  liftTarget,
  type Node,
} from '../../src/index.js'
import { doc, h, p, quote, schema } from '../helpers/schema.js'

const bq = schema.nodes.blockquote

function wrapIn(d: Node, from: number, to: number) {
  const range = blockRange(d.resolve(from), d.resolve(to))!
  const wrappers = findWrapping(range, bq)!
  return new Transform(d).wrap(range, wrappers)
}

function liftOut(d: Node, from: number, to: number) {
  const range = blockRange(d.resolve(from), d.resolve(to))!
  return new Transform(d).lift(range, liftTarget(range)!)
}

/** Every step must invert exactly and survive a JSON round trip. */
function checkSteps(t: Transform) {
  let cur = t.doc
  for (let i = t.steps.length - 1; i >= 0; i--) {
    const step = t.steps[i]!
    const back = step.invert(t.docs[i]!).apply(cur)
    expect(back.failed).toBeNull()
    cur = back.doc!
  }
  expect(cur.eq(t.before)).toBe(true)
  t.steps.forEach((step, i) => {
    const again = Step.fromJSON(schema, JSON.parse(JSON.stringify(step.toJSON())))
    expect(again.apply(t.docs[i]!).doc!.eq(i + 1 < t.docs.length ? t.docs[i + 1]! : t.doc)).toBe(
      true,
    )
  })
}

describe('ReplaceAroundStep', () => {
  it('wraps content keeping it intact', () => {
    const d = doc(p('a'))
    const step = new ReplaceAroundStep(0, 3, 0, 3, new Slice(Fragment.from(bq.create()), 0, 0), 1)
    const result = step.apply(d)
    expect(result.doc!.eq(doc(quote(p('a'))))).toBe(true)
    // positions inside move, they are not deleted
    expect(step.getMap().mapResult(2).pos).toBe(3)
    expect(step.getMap().mapResult(2).deleted).toBe(false)
  })

  it('fails on an open gap', () => {
    const step = new ReplaceAroundStep(0, 3, 1, 3, new Slice(Fragment.from(bq.create()), 0, 0), 1)
    expect(step.apply(doc(p('a'))).failed).toBeTruthy()
  })
})

describe('wrap', () => {
  it('wraps one or more blocks in a blockquote', () => {
    const t = wrapIn(doc(p('a'), p('b'), p('c')), 1, 4)
    expect(t.doc.eq(doc(quote(p('a'), p('b')), p('c')))).toBe(true)
    checkSteps(t)
  })

  it('keeps the cursor inside the wrapped text', () => {
    const t = wrapIn(doc(p('ab')), 2, 2)
    expect(t.mapping.map(2)).toBe(3)
  })

  it('finds no wrapping where the schema forbids it', () => {
    const d = schema.node('doc', null, [schema.node('code_block', null, [schema.text('x')])])
    const range = blockRange(d.resolve(1))!
    expect(findWrapping(range, schema.nodes.heading)).toBeNull()
  })
})

describe('lift', () => {
  it('lifts the whole content out of a blockquote', () => {
    const t = liftOut(doc(quote(p('a'), p('b'))), 2, 5)
    expect(t.doc.eq(doc(p('a'), p('b')))).toBe(true)
    checkSteps(t)
  })

  it('splits the blockquote when lifting from the middle', () => {
    const t = liftOut(doc(quote(p('a'), p('b'), p('c'))), 5, 5)
    expect(t.doc.eq(doc(quote(p('a')), p('b'), quote(p('c'))))).toBe(true)
    checkSteps(t)
  })

  it('lifts the first or last block, keeping the rest quoted', () => {
    expect(liftOut(doc(quote(p('a'), p('b'))), 2, 2).doc.eq(doc(p('a'), quote(p('b'))))).toBe(true)
    expect(liftOut(doc(quote(p('a'), p('b'))), 5, 5).doc.eq(doc(quote(p('a')), p('b')))).toBe(true)
  })

  it('lifts across two levels when needed', () => {
    const t = liftOut(doc(quote(quote(p('a')))), 3, 3)
    expect(t.doc.eq(doc(quote(p('a'))))).toBe(true)
  })

  it('has no target at the top level', () => {
    const d = doc(p('a'), h(1, 'b'))
    expect(liftTarget(blockRange(d.resolve(1))!)).toBeNull()
  })

  it('maps steps over other changes', () => {
    const d = doc(p('x'), quote(p('a')))
    const t = liftOut(d, 5, 5)
    const step = t.steps[0]!
    const other = new Transform(d).insert(1, schema.text('YY'))
    const mapped = step.map(other.mapping)!
    expect(mapped.apply(other.doc).doc!.eq(doc(p('YYx'), p('a')))).toBe(true)
  })
})
