// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  NodeSelection,
  Schema,
  TextSelection,
  basicSchemaSpec,
  history,
  parseHTML,
  serializeHTML,
  undo,
  type Transaction,
} from '@scriba/core'
import { listNodes } from '@scriba/plugin-list'
import { footnoteNodes, footnotes, goToFootnote, insertFootnote } from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...listNodes, ...footnoteNodes },
  marks: basicSchemaSpec.marks,
})
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const html = (input: string) => serializeHTML(parse(input))
const ref = (n: number) => `<sup><a href="#fn-${n}" id="fnref-${n}">${n}</a></sup>`
const list = (...notes: string[]) =>
  `<ol class="scriba-footnotes">${notes.map((t, i) => `<li id="fn-${i + 1}"><p>${t}</p></li>`).join('')}</ol>`

function stateOf(input: string, pos: number) {
  const doc = parse(input)
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, pos),
    plugins: [history(), footnotes()],
  })
}

describe('footnote nodes', () => {
  it('round trip of references and the notes list', () => {
    const doc = `<p>Testo${ref(1)} e altro${ref(2)}.</p>${list('Prima nota.', 'Seconda.')}`
    expect(html(doc)).toBe(doc)
  })

  it('the <sup> of a reference is not superscript formatting', () => {
    const out = html(`<p>a${ref(1)}</p>${list('n')}`)
    expect(out).not.toContain('<sup><sup>')
    expect(html('<p>x<sup>2</sup></p>')).toBe('<p>x<sup>2</sup></p>')
  })

  it('ids only with the fixed prefixes and a number', () => {
    expect(
      html(
        '<p><sup><a href="#fn-1" id="location">1</a></sup><sup><a href="#fn-x" id="fnref-x">x</a></sup><sup><a href="#fn-2" id="fnref-3">2</a></sup></p>',
      ),
    ).not.toMatch(/id="(?!fnref-\d)/)
    // a note without a valid id is not a note: its text is kept, its id dropped
    const out = html('<ol class="scriba-footnotes"><li id="cookie"><p>n</p></li></ol>')
    expect(out).toContain('<p>n</p>')
    expect(out).not.toContain('cookie')
  })

  it('a footnote <li> in an ordinary list stays a list item (no lost text)', () => {
    expect(html('<ol><li id="fn-1"><p>voce</p></li></ol>')).toBe('<ol><li><p>voce</p></li></ol>')
  })
})

describe('insertFootnote and syncing', () => {
  it('inserts a reference, its note at the end, and puts the cursor in the note', () => {
    let state = stateOf('<p>Uno due</p>', 4)
    insertFootnote(schema)(state, (tr) => (state = state.apply(tr)))
    expect(serializeHTML(state.doc)).toBe(`<p>Uno${ref(1)} due</p>${list('')}`)
    expect(state.selection.$from.parent.type.name).toBe('paragraph')
    expect(state.selection.$from.node(-1).type.name).toBe('footnote')
  })

  it('numbers follow the reading order; notes move with their references', () => {
    let state = stateOf(`<p>A${ref(1)} B</p>${list('nota A')}`, 5)
    const apply = (tr: Transaction) => (state = state.apply(tr))
    // a new reference before the first one: it becomes 1, the old one 2
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)))
    insertFootnote(schema)(state, apply)
    state.apply(state.tr) // no-op
    expect(serializeHTML(state.doc)).toBe(
      `<p>${ref(1)}A${ref(2)} B</p><ol class="scriba-footnotes"><li id="fn-1"><p></p></li><li id="fn-2"><p>nota A</p></li></ol>`,
    )
  })

  it('deleting a reference removes its note; the last one removes the list; undo restores', () => {
    let state = stateOf(`<p>A${ref(1)}B${ref(2)}</p>${list('uno', 'due')}`, 1)
    const apply = (tr: Transaction) => (state = state.apply(tr))
    apply(state.tr.delete(2, 3)) // the first reference
    expect(serializeHTML(state.doc)).toBe(`<p>AB${ref(1)}</p>${list('due')}`)
    apply(state.tr.delete(3, 4))
    expect(serializeHTML(state.doc)).toBe('<p>AB</p>')
    // both deletions are one undo step (typed within half a second): all comes back
    undo(state, apply)
    expect(serializeHTML(state.doc)).toBe(`<p>A${ref(1)}B${ref(2)}</p>${list('uno', 'due')}`)
  })

  it('a pasted reference without note gets an empty one; duplicates get their own', () => {
    let state = stateOf(`<p>A${ref(1)}</p>${list('uno')}`, 2)
    const pasted = parse(`<p>${ref(1)}</p>`).firstChild!.content
    state = state.apply(state.tr.insert(1, pasted))
    expect(serializeHTML(state.doc)).toBe(
      `<p>${ref(1)}A${ref(2)}</p><ol class="scriba-footnotes"><li id="fn-1"><p></p></li><li id="fn-2"><p>uno</p></li></ol>`,
    )
  })

  it('a reference inside a note is removed', () => {
    let state = stateOf(`<p>A${ref(1)}</p>${list('uno')}`, 2)
    const notePara = state.doc.child(1).child(0).child(0)
    const at = 2 + state.doc.child(0).nodeSize + notePara.content.size // end of the note text
    state = state.apply(state.tr.insert(at, schema.nodes['footnote_ref']!.create({ key: 'zzz' })))
    expect(serializeHTML(state.doc)).toBe(`<p>A${ref(1)}</p>${list('uno')}`)
  })

  it('typing elsewhere does not touch footnotes (no extra transaction)', () => {
    let state = stateOf(`<p>A${ref(1)} B</p>${list('n')}`, 1)
    const before = state.doc.child(1)
    state = state.apply(state.tr.insertText('x', 1))
    expect(state.doc.child(1)).toBe(before)
  })

  it('goToFootnote: from the reference to its note and back', () => {
    let state = stateOf(`<p>A${ref(1)}</p>${list('nota')}`, 1)
    // keys come from parsing: n1
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 2)))
    goToFootnote(state, (tr) => (state = state.apply(tr)))
    expect(state.selection.$from.node(-1).type.name).toBe('footnote')
    goToFootnote(state, (tr) => (state = state.apply(tr)))
    expect(state.selection instanceof NodeSelection && state.selection.node.type.name).toBe(
      'footnote_ref',
    )
  })

  it('not in code or inside a note', () => {
    expect(insertFootnote(schema)(stateOf(`<p>A${ref(1)}</p>${list('nota')}`, 7))).toBe(false)
  })
})
