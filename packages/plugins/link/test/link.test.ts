import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
  type Command,
} from '@scriba/core'
import { JSDOM } from 'jsdom'
import { linkMarks, linkRange, normalizeLinkInput, removeLink, setLink } from '../src/index.js'

const schema = new Schema({
  nodes: basicSchemaSpec.nodes,
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const { DOMParser } = new JSDOM('').window
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)

function run(html: string, from: number, to: number, cmd: Command) {
  const doc = parse(html)
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to) })
  const ok = cmd(state, (tr) => (state = state.apply(tr)))
  return { ok, html: serializeHTML(state.doc), state }
}

describe('link plugin', () => {
  it('links the selection', () => {
    expect(run('<p>abc</p>', 2, 3, setLink(schema, 'https://x.it')).html).toBe(
      '<p>a<a href="https://x.it">b</a>c</p>',
    )
  })

  it('opens in a new tab with rel=noopener noreferrer', () => {
    expect(run('<p>abc</p>', 1, 4, setLink(schema, 'https://x.it', '_blank')).html).toBe(
      '<p><a href="https://x.it" target="_blank" rel="noopener noreferrer">abc</a></p>',
    )
  })

  it('updates the whole link around the cursor', () => {
    const r = run(
      '<p>a<a href="https://old.it">link</a>b</p>',
      4,
      4,
      setLink(schema, 'https://new.it'),
    )
    expect(r.html).toBe('<p>a<a href="https://new.it">link</a>b</p>')
  })

  it('inserts the address as text at a bare cursor', () => {
    const r = run('<p>ab</p>', 2, 2, setLink(schema, 'mailto:a@b.it'))
    expect(r.html).toBe('<p>a<a href="mailto:a@b.it">mailto:a@b.it</a>b</p>')
    expect(r.state.selection.head).toBe(2 + 'mailto:a@b.it'.length)
  })

  it.each([
    'javascript:alert(1)',
    ' JaVaScRiPt:alert(1)',
    'data:text/html,x',
    'vbscript:x',
    'file:///etc/passwd',
  ])('refuses unsafe URL %j', (url) => {
    const r = run('<p>abc</p>', 1, 4, setLink(schema, url))
    expect(r.ok).toBe(false)
    expect(r.html).toBe('<p>abc</p>')
  })

  it('removes the link around the cursor', () => {
    expect(run('<p>a<a href="https://x.it">link</a>b</p>', 3, 3, removeLink(schema)).html).toBe(
      '<p>alinkb</p>',
    )
    expect(run('<p>abc</p>', 2, 2, removeLink(schema)).ok).toBe(false)
  })

  it('finds the link range at its edges', () => {
    const doc = parse('<p>a<a href="https://x.it">link</a>b</p>')
    const at = (pos: number) =>
      linkRange(
        EditorState.create({ doc, selection: TextSelection.create(doc, pos) }),
        schema.marks.link!,
      )
    expect(at(3)).toMatchObject({ from: 2, to: 6 })
    expect(at(6)).toMatchObject({ from: 2, to: 6 })
    expect(at(1)).toBeNull()
  })

  it('normalizes common input', () => {
    expect(normalizeLinkInput(' www.esempio.it ')).toBe('https://www.esempio.it')
    expect(normalizeLinkInput('mario@esempio.it')).toBe('mailto:mario@esempio.it')
    expect(normalizeLinkInput('/pagina')).toBe('/pagina')
  })

  it('drops unsafe links when parsing pasted HTML', () => {
    expect(
      serializeHTML(
        parse('<p><a href="javascript:alert(1)">x</a> <a href="https://ok.it">y</a></p>'),
      ),
    ).toBe('<p>x <a href="https://ok.it">y</a></p>')
  })
})
