import { describe, expect, it } from 'vitest'
import { Step, type StepJSON } from '../../src/index.js'
import { doc, p, schema } from '../helpers/schema.js'

/** Steps arrive from other collaborators: untrusted input (CLAUDE.md §5.8). */
describe('Step.fromJSON with untrusted input', () => {
  const bad: unknown[] = [
    null,
    {},
    { stepType: 'evil' },
    { stepType: '__proto__' },
    { stepType: 'replace', from: -1, to: 2 },
    { stepType: 'replace', from: 1.5, to: 2 },
    { stepType: 'replace', from: '1', to: 2 },
    { stepType: 'replace', from: 3, to: 1 },
    { stepType: 'replace', from: 1, to: 1, slice: { content: [{ type: 'script' }] } },
    {
      stepType: 'replace',
      from: 1,
      to: 1,
      slice: { content: [{ type: 'text', text: 'x' }], openStart: -1 },
    },
    { stepType: 'addMark', from: 1, to: 2, mark: { type: 'onclick' } },
    { stepType: 'addMark', from: 1, to: 1, mark: { type: 'bold' } },
    { stepType: 'setAttrs', pos: 0, attrs: 'x' },
    { stepType: 'setNodeType', pos: 0, type: 'iframe' },
  ]

  it.each(bad.map((j) => [JSON.stringify(j), j]))('rejects %s', (_label, json) => {
    expect(() => Step.fromJSON(schema, json as StepJSON)).toThrow()
  })

  it('drops unknown attributes when applied', () => {
    const step = Step.fromJSON(schema, {
      stepType: 'setNodeType',
      pos: 0,
      type: 'heading',
      attrs: { level: 2, onclick: 'x' },
    })
    const result = step.apply(doc(p('a')))
    expect(result.doc!.firstChild!.attrs).toEqual({ level: 2 })
  })

  it('fails (not throws) when positions are out of range', () => {
    const step = Step.fromJSON(schema, { stepType: 'replace', from: 50, to: 60 })
    expect(step.apply(doc(p('a'))).failed).toBeTruthy()
  })
})

describe('replaceAround step JSON', () => {
  it.each([
    [{ stepType: 'replaceAround', from: 5, to: 2, gapFrom: 3, gapTo: 4, insert: 0 }],
    [{ stepType: 'replaceAround', from: 0, to: 4, gapFrom: 3, gapTo: 2, insert: 0 }],
    [{ stepType: 'replaceAround', from: 0, to: 4, gapFrom: 0, gapTo: 4, insert: 9 }],
    [{ stepType: 'replaceAround', from: 0, to: 4, gapFrom: 0, gapTo: 4, insert: -1 }],
  ])('rejects %j', (json) => {
    expect(() => Step.fromJSON(schema, json as StepJSON)).toThrow()
  })
})

describe('slices with incomplete nodes (regression)', () => {
  it('accepts incomplete wrappers in slice JSON but never inserts them whole', () => {
    // An empty blockquote is invalid (block+). As an inserted whole node it must be refused.
    const step = Step.fromJSON(schema, {
      stepType: 'replace',
      from: 3,
      to: 3,
      slice: { content: [{ type: 'blockquote' }] },
    })
    const result = step.apply(doc(p('a')))
    expect(result.doc).toBeNull()
    expect(result.failed).toMatch(/blockquote/)
  })

  it('still rejects wrong child types in partial content', () => {
    expect(() =>
      Step.fromJSON(schema, {
        stepType: 'replace',
        from: 1,
        to: 1,
        slice: { content: [{ type: 'blockquote', content: [{ type: 'text', text: 'x' }] }] },
      }),
    ).toThrow()
  })
})
