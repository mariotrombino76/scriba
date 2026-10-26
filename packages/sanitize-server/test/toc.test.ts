import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba/core'
import { linkMarks, withAnchors } from '../../plugins/link/src/index.js'
import { listNodes } from '../../plugins/list/src/index.js'
import { tocNodes } from '../../plugins/toc/src/index.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/** Table of contents (§5.3/§5.4): links only to #anchor-<name>, text only. */
const schema = new Schema({
  nodes: { ...withAnchors(basicSchemaSpec.nodes), ...listNodes, ...tocNodes },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))

const deep =
  '<ol class="scriba-toc">' +
  '<li><a href="#anchor-a">a</a><ol>'.repeat(30) +
  '</ol></li>'.repeat(30) +
  '</ol>'
const PAYLOADS = [
  '<ol class="scriba-toc"><li><a href="#anchor-intro">Intro</a></li></ol><h2 id="anchor-intro">Intro</h2>',
  '<ol class="scriba-toc"><li><a href="javascript:alert(1)">x</a></li><li><a href="#anchor-a" onclick="alert(1)">a<img src=x onerror=alert(1)></a></li></ol>',
  '<ol class="scriba-toc"><li><a href="#anchor-a&quot; onmouseover=&quot;alert(1)">b</a></li><li><a href="data:text/html,x">c</a></li></ol>',
  '<ol class="scriba-toc x" style="position:fixed"><li><a href="#anchor-' +
    'a'.repeat(100) +
    '">long</a></li></ol>',
  deep,
  '<ol class="scriba-toc"><li><a href="#anchor-a">' + 'x'.repeat(500) + '</a></li></ol>',
]

describe('table of contents (server)', () => {
  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    for (const href of out.match(/href="[^"]*"/g) ?? [])
      expect(href).toMatch(/^href="#anchor-[a-z0-9-]+"$/)
    expect(out).not.toMatch(/on\w+=|javascript:|data:|<img|style=/i)
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })

  it('levels stop at 6 and text at 200 characters', () => {
    expect((sanitize(deep).match(/<ol/g) ?? []).length).toBeLessThanOrEqual(6)
    expect(sanitize(PAYLOADS[5]!)).toContain(`>${'x'.repeat(200)}</a>`)
  })
})
