import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
} from '@scriba-editor/core'
import { anchorName, linkMarks, setAnchor, withAnchors } from '../../plugins/link/src/index.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/** Anchors: an id only with the fixed prefix and a safe name (DOM clobbering guard, §5.4). */
const schema = new Schema({
  nodes: withAnchors(basicSchemaSpec.nodes),
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))

const PAYLOADS = [
  '<h2 id="anchor-introduzione">Intro</h2><p><a href="#anchor-introduzione">vai</a></p>',
  '<p id="location">a</p><p id="cookie">b</p><form id="anchor-x"><p id="__proto__">c</p></form>',
  '<p id="anchor-">d</p><p id="anchor-A_B">e</p><p id="anchor-x&quot; onclick=&quot;alert(1)">f</p>',
  '<p id="anchor-x" name="y" onclick="alert(1)">g</p><a href="javascript:alert(1)#anchor-x">h</a>',
]

describe('anchors (server)', () => {
  it('keeps prefixed, valid ids only', () => {
    expect(sanitize(PAYLOADS[0]!)).toBe(
      '<h2 id="anchor-introduzione">Intro</h2><p><a href="#anchor-introduzione">vai</a></p>',
    )
    expect(sanitize(PAYLOADS[1]!)).toBe('<p>a</p><p>b</p><p>c</p>')
    expect(sanitize(PAYLOADS[2]!)).toBe('<p>d</p><p>e</p><p>f</p>')
  })

  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    expect(out).not.toMatch(/on\w+=|javascript:|name=|id="(?!anchor-[a-z0-9-]+")/i)
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })

  it('names are made valid; a name in use elsewhere is refused', () => {
    expect(anchorName('  Introduzione al Corso! ')).toBe('introduzione-al-corso')
    expect(anchorName('Perché è così?')).toBe('perche-e-cosi')
    const doc = parseHTML(schema, dom('<h2 id="anchor-uno">A</h2><p>b</p>'))
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 5) })
    expect(setAnchor('uno')(state)).toBe(false)
    expect(setAnchor('due')(state, (tr) => (state = state.apply(tr)))).toBe(true)
    expect(serializeHTML(state.doc)).toBe('<h2 id="anchor-uno">A</h2><p id="anchor-due">b</p>')
    expect(setAnchor('No Spaces')(state)).toBe(false)
  })
})
