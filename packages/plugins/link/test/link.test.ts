import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
  type Command,
} from '@scriba-editor/core'
import { JSDOM } from 'jsdom'
import { createTranslator } from '@scriba-editor/i18n'
import type { MenuItem, ToolbarButton } from '@scriba-editor/ui'
import type { EditorView } from '@scriba-editor/view'
import {
  linkContextMenu,
  linkMarks,
  linkRange,
  normalizeLinkInput,
  removeLink,
  setLink,
} from '../src/index.js'

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

describe('link context menu', () => {
  const button = (i: MenuItem): ToolbarButton => {
    if (i === '|' || !('type' in i) || i.type !== 'button') throw new Error('not a button')
    return i
  }

  it('applies on a link: edit, remove, open (also read-only)', () => {
    const section = linkContextMenu(schema, createTranslator('it'))
    const doc = parse('<p>a <a href="https://example.com">link</a></p>')
    const at = (pos: number) =>
      EditorState.create({ doc, selection: TextSelection.create(doc, pos) })
    expect(section.isVisible(at(1))).toBe(false)
    expect(section.isVisible(at(5))).toBe(true)
    const buttons = section.items.map(button)
    expect(buttons.map((b) => b.id)).toEqual(['link', 'unlink', 'open_link'])
    expect(buttons.some((b) => b.isActive)).toBe(false) // an action here, not a pressed toggle
    expect(buttons[2]!.readOnly).toBe(true)
  })

  it('"Open link" opens in a new tab without access to the page', () => {
    const open = button(linkContextMenu(schema, createTranslator('it')).items[2]!)
    const calls: unknown[][] = []
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('x', [schema.mark('link', { href: 'https://example.com/a' })]),
      ]),
    ])
    const view = {
      state: EditorState.create({ doc, selection: TextSelection.create(doc, 1) }),
      document: { defaultView: { open: (...a: unknown[]) => calls.push(a) } },
    }
    open.run!(view as unknown as EditorView)
    expect(calls).toEqual([['https://example.com/a', '_blank', 'noopener,noreferrer']])
  })
})
