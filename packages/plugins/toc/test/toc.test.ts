// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
} from '@scriba-editor/core'
import { linkMarks, withAnchors } from '@scriba-editor/plugin-link'
import { insertTableOfContents, tableOfContents, tocNodes } from '../src/index.js'

const schema = new Schema({
  nodes: { ...withAnchors(basicSchemaSpec.nodes), ...tocNodes },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const html = (input: string) => serializeHTML(parse(input))
const TOC =
  '<ol class="scriba-toc"><li><a href="#anchor-intro">Intro</a><ol><li><a href="#anchor-dettagli">Dettagli</a></li></ol></li><li><a href="#anchor-fine">Fine</a></li></ol>'

describe('table of contents node', () => {
  it('round trip of a saved index (nested levels)', () => {
    expect(html(TOC)).toBe(TOC)
  })

  it('only links to anchors, text only, no other attributes', () => {
    expect(
      html(
        '<ol class="scriba-toc" id="x" onclick="alert(1)"><li><a href="javascript:alert(1)">a</a></li><li><a href="#anchor-ok" onclick="y"><b>Ok</b><img src=x onerror=alert(1)></a></li><li><a href="https://evil.example">e</a></li><li><a href="#anchor-x&quot;&gt;">q</a></li></ol>',
      ),
    ).toBe('<ol class="scriba-toc"><li><a href="#anchor-ok">Ok</a></li></ol>')
  })

  it('a plain <ol> stays a list', () => {
    expect(html('<ol><li><p>a</p></li></ol>')).not.toContain('scriba-toc')
  })
})

describe('keeping it up to date', () => {
  function stateOf(input: string, pos = 1) {
    const doc = parse(input)
    return EditorState.create({
      doc,
      selection: TextSelection.create(doc, pos),
      plugins: [tableOfContents()],
    })
  }

  it('inserting gives headings anchors and lists them', () => {
    let state = stateOf('<p></p><h2>Perché è così?</h2><p>x</p><h3>Perché è così?</h3>')
    insertTableOfContents(schema)(state, (tr) => (state = state.apply(tr)))
    expect(serializeHTML(state.doc)).toBe(
      '<ol class="scriba-toc"><li><a href="#anchor-perche-e-cosi">Perché è così?</a><ol><li><a href="#anchor-perche-e-cosi-2">Perché è così?</a></li></ol></li></ol>' +
        // (it took the place of the empty paragraph)
        '<h2 id="anchor-perche-e-cosi">Perché è così?</h2><p>x</p><h3 id="anchor-perche-e-cosi-2">Perché è così?</h3>',
    )
  })

  it('follows heading edits; existing anchors are kept (links stay valid)', () => {
    let state = stateOf(
      `${TOC}<h1 id="anchor-intro">Intro</h1><h2 id="anchor-dettagli">Dettagli</h2>`,
      1,
    )
    // retitle the first heading
    const h1 = state.doc.child(1)
    state = state.apply(
      state.tr.insertText(' generale', 1 + state.doc.child(0).nodeSize + h1.content.size),
    )
    expect(serializeHTML(state.doc)).toBe(
      '<ol class="scriba-toc"><li><a href="#anchor-intro">Intro generale</a><ol><li><a href="#anchor-dettagli">Dettagli</a></li></ol></li></ol>' +
        '<h1 id="anchor-intro">Intro generale</h1><h2 id="anchor-dettagli">Dettagli</h2>',
    )
  })

  it('no index: headings are left alone', () => {
    let state = stateOf('<h2>Titolo</h2>')
    state = state.apply(state.tr.insertText('!', 7))
    expect(serializeHTML(state.doc)).toBe('<h2>Titolo!</h2>')
  })
})
