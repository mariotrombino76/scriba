import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba-editor/core'
import { hrNodes } from '../../plugins/hr/src/index.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/** Lines and page breaks: a bare <hr>, or <hr> with the one fixed class; nothing else survives. */
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...hrNodes },
  marks: basicSchemaSpec.marks,
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))

const PAYLOADS = [
  '<hr onclick="alert(1)" style="background:url(javascript:x)" id="x" title="t">',
  '<hr class="scriba-page-break evil" onmouseover="alert(1)" data-x="1">',
  '<hr class="&quot; onmouseover=&quot;alert(1)">',
  '<hr class="scriba-page-breakx">',
  '<p>a<hr class="scriba-page-break">b</p>',
  '<math><mtext><hr class="scriba-page-break"><mglyph><style><img src=x onerror=alert(1)>',
]

describe('horizontal lines and page breaks (server)', () => {
  it('keeps a page break and a line, nothing else', () => {
    expect(sanitize(PAYLOADS[0]!)).toBe('<hr>')
    expect(sanitize(PAYLOADS[1]!)).toBe('<hr class="scriba-page-break">')
    expect(sanitize(PAYLOADS[3]!)).toBe('<hr>')
  })

  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    expect(out).not.toMatch(/<(script|img|style)|on\w+=|javascript:|style=|id=|data-/i)
    for (const m of out.matchAll(/class="([^"]*)"/g)) expect(m[1]).toBe('scriba-page-break')
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })
})
