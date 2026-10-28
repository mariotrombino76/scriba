import { describe, expect, it } from 'vitest'
import { EditorState, Plugin, PluginKey, TextSelection } from '../../src/index.js'
import { b, doc, p, schema } from '../helpers/schema.js'
import { stateAt } from '../helpers/state.js'

describe('EditorState', () => {
  it('creates an empty valid document from the schema', () => {
    const state = EditorState.create({ schema })
    expect(state.doc.eq(doc(p()))).toBe(true)
    expect(state.selection.head).toBe(1)
  })

  it('applies transactions immutably', () => {
    const s1 = stateAt(doc(p('ab')), 3)
    const s2 = s1.apply(s1.tr.insertText('c'))
    expect(s1.doc.eq(doc(p('ab')))).toBe(true)
    expect(s2.doc.eq(doc(p('abc')))).toBe(true)
    expect(s2.selection.head).toBe(4)
  })

  it('maps the selection through steps', () => {
    const s = stateAt(doc(p('abcd')), 4)
    const tr = s.tr.insert(1, schema.text('XY'))
    expect(tr.selection.head).toBe(6)
  })

  it('types with stored marks and cursor marks', () => {
    const s = stateAt(doc(p('ab')), 3)
    const bold = s.apply(s.tr.addStoredMark(schema.mark('bold')).insertText('c'))
    expect(bold.doc.eq(doc(p('ab', b('c'))))).toBe(true)
    // continuing after bold text keeps bold
    const more = bold.apply(bold.tr.insertText('d'))
    expect(more.doc.eq(doc(p('ab', b('cd'))))).toBe(true)
  })

  it('replaces a selection when typing over it, keeping its marks', () => {
    const s = stateAt(doc(p('a', b('bc'), 'd')), 2, 4)
    const next = s.apply(s.tr.insertText('X'))
    expect(next.doc.eq(doc(p('a', b('X'), 'd')))).toBe(true)
  })

  it('rewriteTransaction replaces a transaction, which is still filtered', () => {
    const plugins = [
      new Plugin({
        // "x" typed anywhere becomes "y"
        rewriteTransaction: (tr, state) =>
          tr.getMeta('typed') === 'x' ? state.tr.insertText('y', 1) : null,
      }),
      new Plugin({ filterTransaction: (tr) => tr.getMeta('block') !== true }),
    ]
    const s = EditorState.create({ doc: doc(p('a')), plugins })
    const { state, transactions } = s.applyTransaction(
      s.tr.insertText('x', 1).setMeta('typed', 'x').setMeta('other', 1),
    )
    expect(state.doc.eq(doc(p('ya')))).toBe(true)
    // the replacement keeps the original's metadata
    expect(transactions[0]!.getMeta('other')).toBe(1)
    expect(transactions[0]!.getMeta('typed')).toBe('x')
    // and is filtered like any other
    expect(s.apply(s.tr.insertText('x', 1).setMeta('typed', 'x').setMeta('block', true))).toBe(s)
    // a replacement built on another document is a mistake
    const wrong = new Plugin({ rewriteTransaction: () => EditorState.create({ schema }).tr })
    const w = EditorState.create({ doc: doc(p('a')), plugins: [wrong] })
    expect(() => w.apply(w.tr.insertText('x', 1))).toThrow(RangeError)
  })

  it('runs plugin state, filterTransaction and appendTransaction', () => {
    const counter = new PluginKey<number>('counter')
    const plugins = [
      new Plugin({
        key: counter,
        state: { init: () => 0, apply: (tr, v) => (tr.docChanged ? v + 1 : v) },
      }),
      new Plugin({ filterTransaction: (tr) => tr.getMeta('block') !== true }),
      new Plugin({
        // normalization example: never leave the document without a trailing paragraph
        appendTransaction: (_trs, _old, state) => {
          const last = state.doc.lastChild!
          if (last.type === schema.nodes.paragraph) return null
          return state.tr.insert(state.doc.content.size, schema.node('paragraph'))
        },
      }),
    ]
    const s = EditorState.create({ doc: doc(p('a')), plugins })
    const blocked = s.apply(s.tr.insertText('x').setMeta('block', true))
    expect(blocked).toBe(s)
    const next = s.apply(s.tr.insert(3, schema.node('heading', null, [schema.text('H')])))
    expect(next.doc.lastChild!.type.name).toBe('paragraph')
    expect(counter.getState(next)).toBe(2)
  })

  it('rejects duplicate plugin keys and mismatched transactions', () => {
    const key = new PluginKey('dup')
    expect(() =>
      EditorState.create({ schema, plugins: [new Plugin({ key }), new Plugin({ key })] }),
    ).toThrow()
    const a = EditorState.create({ schema })
    const b2 = a.apply(a.tr.insertText('x'))
    expect(() => b2.apply(a.tr)).toThrow(/mismatched/)
  })

  it('round-trips JSON', () => {
    const s = stateAt(doc(p('ab')), 1, 3)
    const back = EditorState.fromJSON({ schema }, JSON.parse(JSON.stringify(s.toJSON())))
    expect(back.doc.eq(s.doc)).toBe(true)
    expect(back.selection.eq(TextSelection.create(back.doc, 1, 3))).toBe(true)
  })
})
