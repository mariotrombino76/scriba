import { describe, expect, it } from 'vitest'
import {
  AddMarkStep,
  Fragment,
  Mapping,
  RemoveMarkStep,
  ReplaceStep,
  SetAttrsStep,
  SetNodeTypeStep,
  Slice,
  Step,
  StepMap,
} from '../../src/index.js'
import { b, doc, h, p, schema } from '../helpers/schema.js'

const bold = schema.mark('bold')
const text = (t: string) => new Slice(Fragment.from(schema.text(t)), 0, 0)

/** apply → invert → apply restores the original, and JSON round-trips. */
function checkStep(d: ReturnType<typeof doc>, step: Step, expected: ReturnType<typeof doc>) {
  const result = step.apply(d)
  expect(result.failed).toBeNull()
  expect(result.doc!.eq(expected)).toBe(true)
  const back = step.invert(d).apply(result.doc!)
  expect(back.doc!.eq(d)).toBe(true)
  const json = JSON.parse(JSON.stringify(step.toJSON()))
  expect(Step.fromJSON(schema, json).apply(d).doc!.eq(expected)).toBe(true)
}

describe('steps', () => {
  it('ReplaceStep inserts and deletes', () => {
    checkStep(doc(p('ad')), new ReplaceStep(2, 2, text('bc')), doc(p('abcd')))
    checkStep(doc(p('abcd')), new ReplaceStep(2, 4, Slice.empty), doc(p('ad')))
    checkStep(doc(p('ab'), p('cd')), new ReplaceStep(2, 6, Slice.empty), doc(p('ad')))
  })

  it('ReplaceStep fails without throwing on invalid content', () => {
    const r = new ReplaceStep(0, 3, Slice.empty).apply(doc(p('a')))
    expect(r.doc).toBeNull()
    expect(r.failed).toMatch(/doc/)
    expect(new ReplaceStep(0, 99, Slice.empty).apply(doc(p('a'))).failed).toBeTruthy()
  })

  it('AddMarkStep / RemoveMarkStep', () => {
    checkStep(doc(p('abcd')), new AddMarkStep(2, 4, bold), doc(p('a', b('bc'), 'd')))
    checkStep(doc(p('a', b('bc'), 'd')), new RemoveMarkStep(2, 4, bold), doc(p('abcd')))
    checkStep(
      doc(p('ab'), p('cd')),
      new AddMarkStep(2, 6, bold),
      doc(p('a', b('b')), p(b('c'), 'd')),
    )
  })

  it('AddMarkStep skips parents that forbid the mark', () => {
    const d = schema.node('doc', null, [schema.node('code_block', null, [schema.text('x')])])
    expect(new AddMarkStep(1, 2, bold).apply(d).doc!.eq(d)).toBe(true)
  })

  it('SetAttrsStep validates attributes', () => {
    checkStep(doc(h(1, 'x')), new SetAttrsStep(0, { level: 3 }), doc(h(3, 'x')))
    expect(new SetAttrsStep(0, { level: 42 }).apply(doc(h(1, 'x'))).failed).toBeTruthy()
    expect(new SetAttrsStep(1, {}).apply(doc(h(1, 'x'))).failed).toMatch(/No node/)
  })

  it('SetNodeTypeStep keeps content and positions', () => {
    const step = new SetNodeTypeStep(0, schema.nodes.heading, { level: 2 })
    checkStep(doc(p('x')), step, doc(h(2, 'x')))
    expect(step.getMap()).toBe(StepMap.empty)
    const toCode = new SetNodeTypeStep(0, schema.nodes.code_block, null)
    expect(toCode.apply(doc(p(b('x')))).failed).toBeTruthy()
  })

  it('maps steps through other changes', () => {
    const step = new ReplaceStep(4, 5, Slice.empty)
    const mapped = step.map(new Mapping([StepMap.replace(1, 1, 3)]))!
    expect(mapped).toBeInstanceOf(ReplaceStep)
    expect((mapped as ReplaceStep).from).toBe(7)
    expect(step.map(new Mapping([StepMap.replace(2, 8, 0)]))).toBeNull()
    expect(new AddMarkStep(2, 4, bold).map(new Mapping([StepMap.replace(1, 6, 0)]))).toBeNull()
  })

  it('merges typing and backspacing', () => {
    const a = new ReplaceStep(1, 1, text('a'))
    const merged = a.merge(new ReplaceStep(2, 2, text('b'))) as ReplaceStep
    expect(merged.slice.content.firstChild!.text).toBe('ab')
    const del = new ReplaceStep(5, 6, Slice.empty).merge(
      new ReplaceStep(4, 5, Slice.empty),
    ) as ReplaceStep
    expect([del.from, del.to]).toEqual([4, 6])
    expect(new ReplaceStep(1, 1, text('a')).merge(new ReplaceStep(9, 9, text('b')))).toBeNull()
  })
})
