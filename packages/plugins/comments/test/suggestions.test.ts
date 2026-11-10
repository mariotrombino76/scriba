// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  ADD_TO_HISTORY,
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  deleteChar,
  history,
  parseHTML,
  serializeHTML,
  splitBlock,
  toggleMark,
  undo,
} from '@scriba-editor/core'
import { EditorView } from '@scriba-editor/view'
import {
  createMemoryCommentStore,
  listSuggestions,
  resolveAllSuggestions,
  resolveSuggestion,
  setSuggesting,
  suggestionMarks,
  suggestionsPlugin,
  commentsPlugin,
  commentMarks,
  getComments,
} from '../src/index.js'

const schema = new Schema({
  nodes: basicSchemaSpec.nodes,
  marks: { ...basicSchemaSpec.marks, ...suggestionMarks },
})
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const tick = () => new Promise((r) => setTimeout(r, 0))

function setup(html = '<p>ciao mondo</p>', cursor = 5) {
  const store = createMemoryCommentStore({ id: 'u1', name: 'Anna' })
  let blocked = 0
  const doc = parse(html)
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, cursor),
      plugins: [history(), suggestionsPlugin({ store, onBlocked: () => blocked++ })],
    }),
  })
  setSuggesting(view, true)
  const run = (
    cmd: (s: EditorState, d?: (tr: import('@scriba-editor/core').Transaction) => void) => boolean,
  ) => cmd(view.state, (tr) => view.dispatch(tr))
  /** The document with proposals shown as [+x] and [-x]. */
  const show = () => {
    let out = ''
    view.state.doc.descendants((n) => {
      if (n.isTextblock && out) out += '|'
      if (!n.isText) return true
      const ins = n.marks.some((m) => m.type.name === 'suggest_insert')
      const del = n.marks.some((m) => m.type.name === 'suggest_delete')
      out += ins ? `[+${n.text}]` : del ? `[-${n.text}]` : n.text
      return true
    })
    return out
  }
  return {
    view,
    store,
    run,
    show,
    blocked: () => blocked,
    type: (t: string) => view.dispatch(view.state.tr.insertText(t)),
  }
}

describe('suggestion mode', () => {
  it('typed text becomes a proposed insertion (one proposal while typing on)', () => {
    const { type, show, view } = setup()
    type('X')
    type('Y')
    expect(show()).toBe('ciao[+XY] mondo')
    expect(listSuggestions(view.state.doc)).toHaveLength(1)
  })

  it('Backspace strikes text instead of deleting it; the cursor moves before it', () => {
    const { run, show, view } = setup()
    run(deleteChar(-1))
    run(deleteChar(-1))
    expect(show()).toBe('ci[-ao] mondo')
    expect(view.state.selection.head).toBe(3)
    expect(serializeHTML(view.state.doc)).toBe('<p>ciao mondo</p>') // nothing exported as markup
  })

  it('deleting your own proposed text really removes it', () => {
    const { type, run, show } = setup()
    type('XY')
    run(deleteChar(-1))
    expect(show()).toBe('ciao[+X] mondo')
  })

  it('replacing selected text: the old text struck, the new one proposed', () => {
    const { view, type, show } = setup()
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6, 11)))
    type('mare')
    expect(show()).toBe('ciao [-mondo][+mare]')
  })

  it('replacing like the browser does (delete + insert in one transaction), then typing on', () => {
    const { view, show } = setup()
    const tr = view.state.tr.insertText('m', 6, 11)
    tr.setSelection(TextSelection.create(tr.doc, 7))
    view.dispatch(tr)
    view.dispatch(view.state.tr.insertText('are'))
    expect(show()).toBe('ciao [-mondo][+mare]')
    expect(listSuggestions(view.state.doc)).toHaveLength(1) // one proposal: a replacement
  })

  it('formatting and structural changes are refused while suggesting', () => {
    const { run, show, blocked } = setup()
    run(splitBlock)
    run(toggleMark(schema.marks['bold']!))
    expect(show()).toBe('ciao mondo')
    return tick().then(() => expect(blocked()).toBeGreaterThanOrEqual(1))
  })

  it("other users' changes (remote) are not turned into proposals", () => {
    const { view, show } = setup()
    view.dispatch(view.state.tr.insertText('R', 1).setMeta(ADD_TO_HISTORY, false))
    expect(show()).toBe('Rciao mondo')
  })

  it('typing and its proposal are one undo step', () => {
    const { type, view, show } = setup()
    type('X')
    undo(view.state, (tr) => view.dispatch(tr), view)
    expect(show()).toBe('ciao mondo')
  })

  it('accept / reject one or all', () => {
    const a = setup()
    a.type('X')
    a.view.dispatch(a.view.state.tr.setSelection(TextSelection.create(a.view.state.doc, 7, 12)))
    a.type('M')
    const [first, second] = listSuggestions(a.view.state.doc)
    resolveSuggestion(a.view, first!.id, true)
    expect(a.show()).toBe('ciaoX [-mondo][+M]')
    resolveSuggestion(a.view, second!.id, false)
    expect(a.show()).toBe('ciaoX mondo')
    const b = setup()
    b.type('X')
    b.run(deleteChar(-1)) // own: removed
    b.view.dispatch(b.view.state.tr.setSelection(TextSelection.create(b.view.state.doc, 1, 5)))
    b.type('Hey')
    expect(serializeHTML(resolveAllSuggestions(b.view.state, true))).toBe('<p>Hey mondo</p>')
    expect(serializeHTML(resolveAllSuggestions(b.view.state, false))).toBe('<p>ciao mondo</p>')
    resolveSuggestion(b.view, null, true)
    expect(b.show()).toBe('Hey mondo')
  })

  it("proposals get the store's id (the author is set by the store)", async () => {
    const { type, view, store } = setup()
    type('X')
    await tick()
    const [s] = listSuggestions(view.state.doc)
    const thread = store.threads().find((t) => t.id === s!.id)
    expect(thread).toMatchObject({ kind: 'suggestion', author: { id: 'u1', name: 'Anna' } })
  })
})

describe('with the comments plugin', () => {
  it('the new proposal reaches the comments state (no lost nested update)', async () => {
    const both = new Schema({
      nodes: basicSchemaSpec.nodes,
      marks: { ...basicSchemaSpec.marks, ...suggestionMarks, ...commentMarks },
    })
    const store = createMemoryCommentStore({ id: 'u1', name: 'Anna' })
    const doc = parseHTML(both, new DOMParser().parseFromString('<p>ab</p>', 'text/html').body)
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 3),
        plugins: [commentsPlugin(store), suggestionsPlugin({ store })],
      }),
    })
    setSuggesting(view, true)
    view.dispatch(view.state.tr.insertText('X'))
    await tick()
    const [s] = listSuggestions(view.state.doc)
    expect(getComments(view.state).threads.map((t) => t.id)).toContain(s!.id)
  })
})
