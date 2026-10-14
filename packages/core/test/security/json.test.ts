import { describe, expect, it } from 'vitest'
import type { NodeJSON } from '../../src/index.js'
import { schema } from '../helpers/schema.js'

/** JSON coming from storage, collaboration or import is untrusted (CLAUDE.md §5.8, §5.10). */
describe('nodeFromJSON with untrusted input', () => {
  it('rejects unknown node types', () => {
    expect(() => schema.nodeFromJSON({ type: 'script', content: [] })).toThrow()
  })

  it('rejects unknown mark types', () => {
    const json = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'onclick' }] }] },
      ],
    }
    expect(() => schema.nodeFromJSON(json)).toThrow()
  })

  it('drops unknown attributes', () => {
    const json = {
      type: 'heading',
      attrs: { level: 2, onclick: 'alert(1)', style: 'x' },
      content: [],
    }
    expect(schema.nodeFromJSON(json).attrs).toEqual({ level: 2 })
  })

  it('validates attribute values', () => {
    expect(() => schema.nodeFromJSON({ type: 'heading', attrs: { level: '<script>' } })).toThrow()
  })

  it('rejects content that violates the schema', () => {
    expect(() =>
      schema.nodeFromJSON({ type: 'doc', content: [{ type: 'text', text: 'x' }] }),
    ).toThrow()
  })

  it('rejects malformed shapes', () => {
    expect(() => schema.nodeFromJSON(null as unknown as NodeJSON)).toThrow()
    expect(() =>
      schema.nodeFromJSON({ type: 'doc', content: 'x' } as unknown as NodeJSON),
    ).toThrow()
    expect(() => schema.nodeFromJSON({ type: 'doc', marks: {} } as unknown as NodeJSON)).toThrow()
    expect(() => schema.nodeFromJSON({ type: 'text' })).toThrow()
    expect(() => schema.nodeFromJSON({ type: 'text', text: '' })).toThrow()
  })

  it('limits nesting depth (no unbounded recursion)', () => {
    let json: NodeJSON = { type: 'paragraph' }
    for (let i = 0; i < 10_000; i++) json = { type: 'blockquote', content: [json] }
    json = { type: 'doc', content: [json] }
    expect(() => schema.nodeFromJSON(json)).toThrow(/depth/)
    expect(() =>
      schema.nodeFromJSON(
        { type: 'doc', content: [{ type: 'blockquote', content: [{ type: 'paragraph' }] }] },
        { maxDepth: 2 },
      ),
    ).toThrow(/depth/)
  })
})
