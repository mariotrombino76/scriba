import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  serializeHTML,
} from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { blockquoteNodes, blockquoteToolbarItems, toggleBlockquote } from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...blockquoteNodes },
  marks: basicSchemaSpec.marks,
})

describe('blockquote plugin', () => {
  it('toggles a quote around the selected blocks', () => {
    const p = (t: string) => schema.node('paragraph', null, [schema.text(t)])
    const doc = schema.node('doc', null, [p('a'), p('b')])
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 1, 4) })
    toggleBlockquote(schema)(state, (tr) => (state = state.apply(tr)))
    expect(serializeHTML(state.doc)).toBe('<blockquote><p>a</p><p>b</p></blockquote>')
    const [button] = blockquoteToolbarItems(schema)
    expect(button?.type === 'button' && button.isActive?.(state)).toBe(true)
    expect(button?.type === 'button' && button.label(createTranslator('it'))).toBe('Citazione')
    toggleBlockquote(schema)(state, (tr) => (state = state.apply(tr)))
    expect(serializeHTML(state.doc)).toBe('<p>a</p><p>b</p>')
  })

  it('requires the node in the schema', () => {
    const plain = new Schema({ nodes: basicSchemaSpec.nodes, marks: basicSchemaSpec.marks })
    expect(() => toggleBlockquote(plain)).toThrow(/blockquote/)
  })
})
