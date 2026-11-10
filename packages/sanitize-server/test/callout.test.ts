import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba-editor/core'
import { calloutNodes } from '../../plugins/callout/src/index.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/** Callouts: an <aside> with a fixed class and a kind from a closed list; content through the schema. */
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...calloutNodes },
  marks: basicSchemaSpec.marks,
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))

const PAYLOADS = [
  '<aside data-callout="warning" onclick="alert(1)" style="background:url(javascript:x)" id="x"><p>a</p></aside>',
  '<aside data-callout="&quot; onmouseover=&quot;alert(1)"><p>b</p></aside>',
  '<aside data-callout="info"><script>alert(1)</script><img src=x onerror=alert(1)><p onclick="x">c</p></aside>',
  '<aside data-callout="tip"><aside data-callout="danger"><p>annidato</p></aside></aside>',
  '<aside data-callout="info"></aside>',
  '<math><mtext><aside data-callout="info"><mglyph><style><img src=x onerror=alert(1)>',
]

describe('callouts (server)', () => {
  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    expect(out).not.toMatch(/<(script|img|style)|on\w+=|javascript:|style=|id=/i)
    for (const m of out.matchAll(/data-callout="([^"]*)"/g))
      expect(['info', 'tip', 'warning', 'danger']).toContain(m[1])
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })
})
