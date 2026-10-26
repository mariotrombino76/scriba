import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba/core'
import { mergeTagNodes } from '../../plugins/merge-tags/src/index.js'
import { textStyleMarks } from '../../plugins/text-style/src/index.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/** Merge tags (§5.4): data-merge-tag with a safe name, text rebuilt from it. */
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...mergeTagNodes },
  marks: { ...basicSchemaSpec.marks, ...textStyleMarks },
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))

const PAYLOADS = [
  '<p><span data-merge-tag="cliente.nome">{{cliente.nome}}</span></p>',
  '<p><span data-merge-tag="x&quot; onclick=&quot;alert(1)">a</span><span data-merge-tag="<img src=x onerror=alert(1)>">b</span></p>',
  '<p><span data-merge-tag="ok" onclick="alert(1)" style="color:red" class="x"><script>alert(1)</script>c</span></p>',
  '<p><span data-merge-tag="ok"><span data-merge-tag="nested">d</span></span></p>',
  '<p>{{testo.normale}} <span data-merge-tag="">e</span></p>',
  '<svg><span data-merge-tag="ok">f</span></svg>',
]

describe('merge tags (server)', () => {
  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    for (const attr of out.match(/data-merge-tag="[^"]*"/g) ?? [])
      expect(attr).toMatch(/^data-merge-tag="[a-z0-9_]+(\.[a-z0-9_]+)*"$/)
    expect(out).not.toMatch(/on\w+=|<script|<img|class=/i)
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })

  it('plain {{text}} stays text', () => {
    expect(sanitize('<p>{{a.b}}</p>')).toBe('<p>{{a.b}}</p>')
  })
})
