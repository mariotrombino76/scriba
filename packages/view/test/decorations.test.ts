// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, Plugin, PluginKey, TextSelection, type Node } from '@scriba/core'
import { EditorView, type InlineDecoration } from '../src/index.js'
import { b, beforeInput, doc, p, schema } from './helpers.js'

const highlightKey = new PluginKey<InlineDecoration[]>('hl')

/** Test plugin whose decorations come from a meta-settable state. */
function decorationPlugin(initial: InlineDecoration[]) {
  return new Plugin<InlineDecoration[]>({
    key: highlightKey,
    state: {
      init: () => initial,
      apply: (tr, value) => {
        const next = tr.getMeta<InlineDecoration[]>(highlightKey)
        if (next) return next
        return value.map((d) => ({
          ...d,
          from: tr.mapping.map(d.from),
          to: tr.mapping.map(d.to, -1),
        }))
      },
    },
    props: { decorations: (state: EditorState) => highlightKey.getState(state) ?? [] },
  })
}

function mount(d: Node, decorations: InlineDecoration[], at = 1) {
  document.body.textContent = ''
  const place = document.createElement('div')
  document.body.appendChild(place)
  const state = EditorState.create({
    doc: d,
    selection: TextSelection.create(d, at),
    plugins: [decorationPlugin(decorations)],
  })
  const view = new EditorView(place, { state })
  view.focus()
  return view
}

describe('inline decorations', () => {
  it('wraps decorated ranges in spans, inside marks, without touching the document', () => {
    const view = mount(doc(p('const ', b('x'), ' = 1')), [
      { from: 1, to: 6, class: 'hl-keyword' },
      { from: 7, to: 8, class: 'hl-var' },
      { from: 3, to: 4, class: 'extra' },
    ])
    expect(view.dom.innerHTML).toBe(
      '<p><span class="hl-keyword">co</span><span class="hl-keyword extra">n</span><span class="hl-keyword">st</span> <strong><span class="hl-var">x</span></strong> = 1</p>',
    )
    expect(view.state.doc.eq(doc(p('const ', b('x'), ' = 1')))).toBe(true)
  })

  it('keeps DOM ↔ position mapping exact across decoration spans', () => {
    const d = doc(p('abcdef'), p('gh'))
    const view = mount(d, [
      { from: 2, to: 4, class: 'a' },
      { from: 3, to: 6, class: 'b' },
    ])
    for (let pos = 1; pos <= 7; pos++) {
      const { node, offset } = view.domAtPos(pos)
      expect(view.posAtDOM(node, offset), `pos ${pos}`).toBe(pos)
    }
  })

  it('types inside decorated text', () => {
    const view = mount(doc(p('abcd')), [{ from: 2, to: 4, class: 'x' }], 3)
    beforeInput(view, 'insertText', 'Z')
    expect(view.state.doc.eq(doc(p('abZcd')))).toBe(true)
    expect(view.dom.innerHTML).toBe('<p>a<span class="x">bZc</span>d</p>')
  })

  it('redraws when only the decorations change', () => {
    const view = mount(doc(p('abc'), p('def')), [])
    const second = view.dom.children[1]
    view.dispatch(view.state.tr.setMeta(highlightKey, [{ from: 1, to: 2, class: 'found' }]))
    expect(view.dom.innerHTML).toBe('<p><span class="found">a</span>bc</p><p>def</p>')
    expect(view.dom.children[1]).toBe(second) // untouched block reused
    view.dispatch(view.state.tr.setMeta(highlightKey, []))
    expect(view.dom.innerHTML).toBe('<p>abc</p><p>def</p>')
  })

  it('ignores invalid ranges and class names', () => {
    const view = mount(doc(p('abc')), [
      { from: 1, to: 2, class: 'ok' },
      { from: 2, to: 3, class: 'x" onclick="alert(1)' },
      { from: 3, to: 2, class: 'bad-range' },
      { from: 1, to: 99, class: 'out' },
    ])
    expect(view.dom.innerHTML).toBe('<p><span class="ok">a</span>bc</p>')
    expect(schema).toBeTruthy()
  })
})
