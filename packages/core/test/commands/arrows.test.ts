import { describe, expect, it } from 'vitest'
import {
  EditorState,
  NodeSelection,
  Schema,
  TextSelection,
  arrowAtom,
  basicSchemaSpec,
  type Command,
  type CommandView,
  type Node,
  type NodeSpec,
} from '../../src/index.js'

const schema = new Schema({
  nodes: {
    ...basicSchemaSpec.nodes,
    widget: { group: 'block', atom: true, toHTML: () => ['div'] } satisfies NodeSpec,
  },
  marks: basicSchemaSpec.marks,
})
const p = (text: string) => schema.node('paragraph', null, text ? [schema.text(text)] : [])
const w = () => schema.nodes['widget']!.create()
// <p>ab</p> 0–4 (text 1–3), widget 4–5, <p>cd</p> 5–9 (text 6–8)
const DOC = schema.node('doc', null, [p('ab'), w(), p('cd')])

function after(state: EditorState, cmd: Command, view?: CommandView): EditorState | null {
  let next: EditorState | null = null
  cmd(state, (tr) => (next = state.apply(tr)), view)
  return next
}
const caret = (doc: Node, pos: number) =>
  EditorState.create({ schema, doc, selection: TextSelection.create(doc, pos) })
const node = (doc: Node, pos: number) =>
  EditorState.create({ schema, doc, selection: NodeSelection.create(doc, pos) })
const sel = (s: EditorState | null) =>
  s &&
  (s.selection instanceof NodeSelection ? `node ${s.selection.from}` : `text ${s.selection.from}`)

describe('arrowAtom', () => {
  it('from a selected block: to the text before or after it', () => {
    expect(sel(after(node(DOC, 4), arrowAtom('down')))).toBe('text 6')
    expect(sel(after(node(DOC, 4), arrowAtom('right')))).toBe('text 6')
    expect(sel(after(node(DOC, 4), arrowAtom('up')))).toBe('text 3')
    expect(sel(after(node(DOC, 4), arrowAtom('left')))).toBe('text 3')
  })

  it('from the edge of a textblock: selects the atom instead of jumping over it', () => {
    expect(sel(after(caret(DOC, 3), arrowAtom('right')))).toBe('node 4')
    expect(sel(after(caret(DOC, 3), arrowAtom('down')))).toBe('node 4')
    expect(sel(after(caret(DOC, 6), arrowAtom('left')))).toBe('node 4')
    expect(sel(after(caret(DOC, 6), arrowAtom('up')))).toBe('node 4')
  })

  it('elsewhere: not handled (the browser moves the caret)', () => {
    expect(after(caret(DOC, 2), arrowAtom('right'))).toBeNull()
    expect(after(caret(DOC, 7), arrowAtom('down'))).toBeNull() // no view: not at the end
    expect(after(caret(DOC, 1), arrowAtom('up'))).toBeNull() // nothing before the first block
    const text = schema.node('doc', null, [p('ab'), p('cd')])
    expect(after(caret(text, 3), arrowAtom('right'))).toBeNull()
  })

  it('up/down use the view to know the caret is on the first/last line', () => {
    const view = {
      state: caret(DOC, 2),
      dispatch: () => {},
      // one line: every position of "ab" has the same box
      coordsAtPos: (pos: number) => (pos <= 3 ? { top: 0, bottom: 20 } : { top: 20, bottom: 40 }),
    }
    expect(sel(after(caret(DOC, 2), arrowAtom('down'), view))).toBe('node 4')
    const twoLines = {
      ...view,
      coordsAtPos: (pos: number) => ({ top: pos * 20, bottom: pos * 20 + 20 }),
    }
    expect(after(caret(DOC, 2), arrowAtom('down'), twoLines)).toBeNull()
  })

  it('an atom at the end of the document: the selection stays', () => {
    const last = schema.node('doc', null, [p('ab'), w()])
    expect(after(node(last, 4), arrowAtom('down'))).toBeNull()
  })
})
