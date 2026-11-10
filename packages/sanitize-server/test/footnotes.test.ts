import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba-editor/core'
import { linkMarks } from '../../plugins/link/src/index.js'
import { listNodes } from '../../plugins/list/src/index.js'
import { footnoteNodes } from '../../plugins/footnotes/src/nodes.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/** Footnotes (§5.4): ids only fn-<n> / fnref-<n>, links only to #fn-<n>. */
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...listNodes, ...footnoteNodes },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))
const REF = '<sup><a href="#fn-1" id="fnref-1">1</a></sup>'
const LIST = '<ol class="scriba-footnotes"><li id="fn-1"><p>nota</p></li></ol>'

const PAYLOADS = [
  `<p>a${REF}</p>${LIST}`,
  '<p><sup><a href="javascript:alert(1)" id="fnref-1">1</a></sup><sup><a href="#fn-1" id="location">x</a></sup></p>',
  '<p><sup><a href="#fn-1" id="fnref-1" onclick="alert(1)" name="cookie">1<img src=x onerror=alert(1)></a></sup></p>',
  '<p><sup><a href="#fn-01" id="fnref-01">1</a></sup><sup><a href="#fn-99999" id="fnref-99999">9</a></sup></p>',
  '<ol class="scriba-footnotes x" id="y" onclick="z"><li id="fn-1" class="w"><p>n</p></li><li id="__proto__"><p>m</p></li></ol>',
  '<ol class="scriba-footnotes"><li id="fn-1"><p>n<sup><a href="#fn-2" id="fnref-2">2</a></sup></p></li></ol>',
  '<ol><li id="fn-1"><p>voce</p></li></ol><ul><li id="fnref-1"><p>x</p></li></ul>',
  '<svg><sup><a href="#fn-1" id="fnref-1">1</a></sup></svg>',
]

describe('footnotes (server)', () => {
  it('keeps references and notes as they are', () => {
    expect(sanitize(`<p>a${REF}</p>${LIST}`)).toBe(`<p>a${REF}</p>${LIST}`)
  })

  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    for (const id of out.match(/ id="[^"]*"/g) ?? [])
      expect(id).toMatch(/^ id="fn(ref)?-[1-9]\d{0,3}"$/)
    expect(out).not.toMatch(/on\w+=|javascript:|name=|<img|class="(?!scriba-footnotes")/i)
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })
})
