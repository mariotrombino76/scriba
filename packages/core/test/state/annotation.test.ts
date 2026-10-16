import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  basicSchemaSpec,
  isAnnotationOnly,
  keymap,
  runKeymaps,
  type MarkSpec,
} from '../../src/index.js'

const schema = new Schema({
  nodes: basicSchemaSpec.nodes,
  marks: {
    ...basicSchemaSpec.marks,
    note: { attrs: { id: {} }, annotation: true, toHTML: () => ['span', 0] } satisfies MarkSpec,
  },
})
const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('abc')])])
const state = EditorState.create({ schema, doc })
const note = schema.marks['note']!.create({ id: 'n1' })

describe('isAnnotationOnly', () => {
  it('true only for transactions adding/removing annotation marks', () => {
    expect(isAnnotationOnly(state.tr.addMark(1, 3, note))).toBe(true)
    expect(isAnnotationOnly(state.tr.removeMark(1, 3, note))).toBe(false) // nothing removed: no change
    const marked = state.apply(state.tr.addMark(1, 3, note))
    expect(isAnnotationOnly(marked.tr.removeMark(1, 3, note))).toBe(true)
    expect(isAnnotationOnly(state.tr.addMark(1, 3, schema.marks['bold']!.create()))).toBe(false)
    expect(isAnnotationOnly(state.tr.addMark(1, 3, note).insertText('x', 1))).toBe(false)
    expect(isAnnotationOnly(state.tr)).toBe(false)
  })

  it('read-only keymaps: commenters may annotate, readers may not', () => {
    const s = state.reconfigure({
      plugins: [
        keymap(
          {
            'Mod-m': (st, dispatch) => {
              dispatch?.(st.tr.addMark(1, 3, note))
              return true
            },
          },
          { readOnly: true, mac: false },
        ),
      ],
    })
    const press = (canAnnotate: boolean) => {
      let next = s
      runKeymaps(s, (tr) => (next = s.apply(tr)), { key: 'm', ctrlKey: true }, undefined, {
        readOnly: true,
        canAnnotate,
      })
      return next.doc.rangeHasMark(1, 3, schema.marks['note']!)
    }
    expect(press(false)).toBe(false)
    expect(press(true)).toBe(true)
  })
})
