// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  history,
  parseHTML,
  serializeHTML,
  splitBlock,
  undo,
} from '@scriba/core'
import { EditorView } from '@scriba/view'
import { addressBefore, autolink, linkMarks } from '../src/index.js'

const schema = new Schema({
  nodes: basicSchemaSpec.nodes,
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const link = schema.marks['link']!
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)

function at(html: string) {
  const doc = parse(html)
  const end = doc.firstChild!.content.size + 1
  return { state: EditorState.create({ doc }), end }
}
const found = (html: string) => {
  const { state, end } = at(html)
  return addressBefore(state, end, link)?.href ?? null
}

describe('addressBefore', () => {
  it('web addresses, www (https), e-mail (mailto)', () => {
    expect(found('<p>vedi https://example.com/a?b=1</p>')).toBe('https://example.com/a?b=1')
    expect(found('<p>vedi www.example.com</p>')).toBe('https://www.example.com')
    expect(found('<p>scrivi a anna.rossi@example.it</p>')).toBe('mailto:anna.rossi@example.it')
  })

  it('sentence punctuation and an unbalanced ")" stay out', () => {
    expect(found('<p>vedi www.example.com.</p>')).toBe('https://www.example.com')
    expect(found('<p>(vedi https://example.com/a)</p>')).toBe('https://example.com/a')
    expect(found('<p>https://it.wikipedia.org/wiki/Roma_(città)</p>')).toBe(
      'https://it.wikipedia.org/wiki/Roma_(città)',
    )
  })

  it('never other protocols, never inside code or an existing link', () => {
    expect(found('<p>javascript:alert(1)</p>')).toBeNull()
    expect(found('<p>vbscript:x www</p>')).toBeNull()
    expect(found('<p><code>https://example.com</code></p>')).toBeNull()
    expect(found('<p><a href="https://x.it">https://example.com</a></p>')).toBeNull()
    expect(found('<p>parola</p>')).toBeNull()
  })
})

describe('autolink plugin', () => {
  function mount(html: string) {
    const doc = parse(html)
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, doc.firstChild!.content.size + 1),
        plugins: [history(), autolink(link)],
      }),
    })
    return view
  }
  const typeSpace = (view: EditorView) =>
    view.dom.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: ' ',
        bubbles: true,
        cancelable: true,
      }),
    )

  it('a space links the address; Ctrl+Z drops the link and keeps the text', () => {
    const view = mount('<p>vedi www.example.com</p>')
    typeSpace(view)
    expect(serializeHTML(view.state.doc)).toBe(
      '<p>vedi <a href="https://www.example.com">www.example.com</a> </p>',
    )
    undo(view.state, (tr) => view.dispatch(tr), view)
    expect(serializeHTML(view.state.doc)).toBe('<p>vedi www.example.com </p>')
  })

  it('Enter at the end of the line links it too', () => {
    const view = mount('<p>https://example.com</p>')
    splitBlock(view.state, (tr) => view.dispatch(tr))
    expect(serializeHTML(view.state.doc)).toBe(
      '<p><a href="https://example.com">https://example.com</a></p><p></p>',
    )
  })
})
