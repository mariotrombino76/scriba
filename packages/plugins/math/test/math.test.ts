// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import katex from 'katex'
import {
  EditorState,
  NodeSelection,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
} from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import { createMathNodes, insertMath, mathNodeView } from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...createMathNodes(katex) },
  marks: basicSchemaSpec.marks,
})
const t = createTranslator('it')
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const html = (input: string) => serializeHTML(parse(input))
const latexIn = (out: string) =>
  [...out.matchAll(/<annotation encoding="application\/x-tex">([^<]*)<\/annotation>/g)].map(
    (m) => m[1],
  )

function insert(latex: string, display: boolean, input = '<p>x = </p>', pos = 4) {
  const doc = parse(input)
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, pos) })
  const ok = insertMath(latex, display)(state, (tr) => (state = state.apply(tr)))
  return { ok, state, html: serializeHTML(state.doc) }
}

describe('formulas', () => {
  it('inline: MathML with the LaTeX in an annotation, read back the same', () => {
    const { html: out } = insert('\\frac{a}{b}', false)
    expect(out).toMatch(
      /^<p>x =<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"><semantics><mrow><mfrac><mi>a<\/mi><mi>b<\/mi><\/mfrac><\/mrow><annotation encoding="application\/x-tex">\\frac\{a\}\{b\}<\/annotation><\/semantics><\/math><\/p>$/,
    )
    expect(html(out)).toBe(out)
  })

  it('display: its own block with display="block"', () => {
    const { html: out } = insert('\\sum_{i=1}^n i', true, '<p></p>', 1)
    expect(out).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">')
    expect(html(out)).toBe(out)
  })

  it('the MathML that comes in is never kept: it is generated again from the LaTeX', () => {
    const forged =
      '<p><math><semantics><mi href="javascript:alert(1)" onclick="x" class="y">FALSO</mi><maction actiontype="statusline">z</maction><annotation encoding="application/x-tex">x^2</annotation></semantics></math></p>'
    const out = html(forged)
    expect(out).not.toMatch(/FALSO|href|onclick|class=|maction/)
    expect(out).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
  })

  it('a <math> without LaTeX source is dropped (its text is not read)', () => {
    expect(html('<p>a<math><mi>x</mi></math>b</p>')).toBe('<p>ab</p>')
    expect(
      html(
        '<p><math><annotation encoding="text/html">&lt;img src=x onerror=alert(1)&gt;</annotation></math></p>',
      ),
    ).toBe('<p></p>')
  })

  it('no trust: \\href and friends become text, never links', () => {
    const { html: out } = insert(
      '\\href{javascript:alert(1)}{x}\\url{https://e.x}\\htmlClass{y}{z}',
      false,
    )
    expect(out).not.toMatch(/<[^>]+\s(href|class|style|id)=/)
  })

  it('a macro bomb or a huge formula does not hang (limits)', () => {
    const start = Date.now()
    insert('\\def\\a{\\a\\a}\\a', false)
    insert('\\frac{'.repeat(500) + 'x' + '}{y}'.repeat(500), false)
    expect(Date.now() - start).toBeLessThan(5000)
    expect(insert('x'.repeat(4001), false).ok).toBe(false)
  })

  it('JSON with control characters or a too long source is refused', () => {
    const json = (latex: string) => ({
      type: 'doc',
      content: [{ type: 'math_display', attrs: { latex } }],
    })
    expect(() => schema.nodeFromJSON(json('x^2'))).not.toThrow()
    expect(() => schema.nodeFromJSON(json('a\u0000b'))).toThrow()
    expect(() => schema.nodeFromJSON(json('x'.repeat(4001)))).toThrow()
  })

  it('editing a selected formula; switching inline to display', () => {
    const first = insert('a', false)
    let state = first.state
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 4)))
    insertMath('b', false)(state, (tr) => (state = state.apply(tr)))
    expect(latexIn(serializeHTML(state.doc))).toEqual(['b'])
    // to its own line: the paragraph is split around it
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 4)))
    insertMath('c', true)(state, (tr) => (state = state.apply(tr)))
    const out = serializeHTML(state.doc)
    expect(latexIn(out)).toEqual(['c'])
    expect(out).toMatch(/^<p>x =<\/p><math [^>]*display="block">/)
  })

  it('the editor draws real MathML elements', () => {
    const place = document.createElement('div')
    document.body.appendChild(place)
    const view = new EditorView(place, {
      state: EditorState.create({ schema, doc: insert('x^2', false).state.doc }),
      nodeViews: { math_inline: mathNodeView(t), math_display: mathNodeView(t) },
    })
    const math = place.querySelector('math')!
    expect(math.namespaceURI).toBe('http://www.w3.org/1998/Math/MathML')
    expect(place.querySelector('.scriba-math')!.getAttribute('aria-label')).toBe('Formula: x^2')
    view.destroy()
  })
})
