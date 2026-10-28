// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  AllSelection,
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  history,
  parseHTML,
  serializeHTML,
  undo,
} from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import { blockquoteNodes } from '@scriba/plugin-blockquote'
import {
  blockPermissions,
  checkBlockEdits,
  deleteSelectionKeepingLocked,
  pasteKeepingLocked,
  typeKeepingLocked,
  withBlockIds,
  type BlockRules,
} from '../src/index.js'

const schema = new Schema({
  nodes: withBlockIds({ ...basicSchemaSpec.nodes, ...blockquoteNodes }),
  marks: basicSchemaSpec.marks,
})
const t = createTranslator('it')
const rules: BlockRules = { canEdit: (id) => !id.startsWith('lock') }
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const LOCK = '<p data-block-id="lock-1">fisso</p>'
const html = (state: EditorState) => serializeHTML(state.doc)

function select(source: string, from: number | 'all', to?: number) {
  const doc = parse(source)
  return EditorState.create({
    doc,
    selection: from === 'all' ? new AllSelection(doc) : TextSelection.create(doc, from, to),
    plugins: [history(), ...blockPermissions({ ...rules, t })],
  })
}
const apply = (state: EditorState, tr: ReturnType<typeof typeKeepingLocked>) => {
  expect(tr).not.toBeNull()
  return state.apply(tr!)
}

describe('editing a selection with protected blocks', () => {
  it('select all + type: everything else goes, the protected block stays', () => {
    const state = select(`<h2>Titolo</h2><p>uno</p>${LOCK}<p>due</p>`, 'all')
    const next = apply(state, typeKeepingLocked(state, 0, state.doc.content.size, 'x', rules))
    // like any editor, the first block keeps its type
    expect(html(next)).toBe(`<h2>x</h2>${LOCK}`)
    expect(next.selection.from).toBe(2)
  })

  it('a selection across a protected block keeps the text around it', () => {
    // "u|no", fisso, "du|e"
    const source = `<p>uno</p>${LOCK}<p>due</p>`
    const state = select(source, 2, 15)
    expect(state.doc.textBetween(2, 15, '|')).toBe('no|fisso|du')
    const next = apply(state, typeKeepingLocked(state, 2, 15, 'X', rules))
    expect(html(next)).toBe(`<p>uX</p>${LOCK}<p>e</p>`)
  })

  it('a selection starting inside the protected block keeps that block whole', () => {
    const state = select(`${LOCK}<p>due</p>`, 3, 10)
    const next = apply(state, typeKeepingLocked(state, 3, 10, 'X', rules))
    expect(html(next)).toBe(`${LOCK}<p>Xe</p>`)
  })

  it('only protected content selected: nothing to delete, still refused', () => {
    const state = select(`<p>a</p>${LOCK}<p>b</p>`, 4, 9)
    expect(typeKeepingLocked(state, 4, 9, 'X', rules)).toBeNull()
  })

  it('no protected block in the selection: the normal path handles it', () => {
    const state = select(`<p>uno</p>${LOCK}`, 1, 3)
    expect(typeKeepingLocked(state, 1, 3, 'X', rules)).toBeNull()
    expect(deleteSelectionKeepingLocked(rules)(state)).toBe(false)
  })

  it('delete and cut: one undo step brings everything back, not the typing before', () => {
    const source = `<p>uno</p>${LOCK}<p>due</p>`
    let state = select(source, 'all')
    // text typed just before (grouped as typing) is a separate undo step
    state = state.apply(state.tr.insertText('!', 4))
    state = state.apply(state.tr.setSelection(new AllSelection(state.doc)))
    deleteSelectionKeepingLocked(rules)(state, (tr) => (state = state.apply(tr)))
    expect(html(state)).toBe(`<p></p>${LOCK}`)
    undo(state, (tr) => (state = state.apply(tr)))
    expect(html(state)).toBe(`<p>uno!</p>${LOCK}<p>due</p>`)
  })

  it("a text selection over all the text (the browser's select all) leaves no empty block", () => {
    const source = `<p>uno</p>${LOCK}<p>due</p>`
    let state = select(source, 1, 16)
    deleteSelectionKeepingLocked(rules)(state, (tr) => (state = state.apply(tr)))
    expect(html(state)).toBe(`<p></p>${LOCK}`)
  })

  it('paste over the selection: the content goes where the selection started', () => {
    const state = select(`<p>uno</p>${LOCK}<p>due</p>`, 'all')
    const content = parse('<p>incollato</p>').content
    expect(html(apply(state, pasteKeepingLocked(state, content, rules)))).toBe(
      `<p>incollato</p>${LOCK}`,
    )
  })

  it('in the view: keys, typing and cut go through the plugin', () => {
    const place = document.createElement('div')
    document.body.replaceChildren(place)
    const view = new EditorView(place, { state: select(`<p>uno</p>${LOCK}<p>due</p>`, 'all') })
    view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    )
    expect(serializeHTML(view.state.doc)).toBe(`<p></p>${LOCK}`)
    view.destroy()
  })

  it('fuzz: typing over any selection never changes a protected block', () => {
    const source = `<p>uno</p>${LOCK}<blockquote><p>due</p><p data-block-id="lock-2">ancora</p></blockquote><h2>tre</h2>`
    const base = parse(source)
    const size = base.content.size
    fc.assert(
      fc.property(fc.integer({ min: 0, max: size }), fc.integer({ min: 0, max: size }), (a, b) => {
        const from = Math.min(a, b)
        const to = Math.max(a, b)
        let state: EditorState
        try {
          state = select(source, from, to)
        } catch {
          return // not a valid text position
        }
        const tr = typeKeepingLocked(state, state.selection.from, state.selection.to, 'Z', rules)
        if (tr) expect(checkBlockEdits(base, state.apply(tr).doc, rules)).toEqual([])
        let deleted = state
        deleteSelectionKeepingLocked(rules)(state, (t) => (deleted = state.apply(t)))
        expect(checkBlockEdits(base, deleted.doc, rules)).toEqual([])
      }),
      { numRuns: 300 },
    )
  })
})
