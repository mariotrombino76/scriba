import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba-editor/core'
import { mentionNodes } from '../../plugins/mention/src/nodes.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/** Mentions: `data-mention-id` (no spaces, no control characters) and a fixed class, nothing else. */
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...mentionNodes },
  marks: basicSchemaSpec.marks,
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))

const ALLOWED: Record<string, readonly string[]> = {
  span: ['class', 'data-mention-id'], p: [], h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
  br: [], strong: [], em: [], u: [], s: [], code: [],
} // prettier-ignore

interface El {
  nodeType: number
  nodeName: string
  childNodes: ArrayLike<El>
  attributes?: ArrayLike<{ name: string; value: string }>
}

function expectSafeMentions(html: string): void {
  const walk = (node: El): void => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i]!
      if (child.nodeType !== 1) continue
      const tag = child.nodeName.toLowerCase()
      expect(Object.keys(ALLOWED), `tag <${tag}> in ${html}`).toContain(tag)
      for (let j = 0; j < (child.attributes?.length ?? 0); j++) {
        const { name, value } = child.attributes![j]!
        expect(ALLOWED[tag], `attribute ${name} on <${tag}> in ${html}`).toContain(name)
        if (name === 'class') expect(value).toBe('scriba-mention')
        else expect(value, `id in ${html}`).toMatch(/^\S{1,200}$/)
      }
      if (tag === 'span') {
        // the mention's text only: no markup inside
        expect(child.childNodes.length).toBe(1)
        expect(child.childNodes[0]!.nodeType).toBe(3)
      }
      walk(child)
    }
  }
  walk(dom(html) as unknown as El)
}

const PAYLOADS = [
  '<p><span data-mention-id="u1" onclick="alert(1)" style="color:red" id="x" name="y">@Anna</span></p>',
  '<p><span data-mention-id="&quot;><img src=x onerror=alert(1)>">@Anna</span></p>',
  '<p><span data-mention-id="u1"><img src=x onerror=alert(1)>@<b>Anna</b><script>alert(1)</script></span></p>',
  '<p><span data-mention-id="u1">@&lt;img src=x onerror=alert(1)&gt;</span></p>',
  '<p><span data-mention-id="javascript:alert(1)">@Link</span></p>',
  '<p><span data-mention-id="u1" class="evil scriba-mention">@Anna</span></p>',
  '<p><a href="javascript:alert(1)"><span data-mention-id="u1">@Anna</span></a></p>',
  '<p><span data-mention-id="u1‮">@Anna</span><span data-mention-id="">@Vuoto</span></p>',
  '<span data-mention-id="u1">@fuori</span><h1><span data-mention-id="u2">@Titolo</span></h1>',
  '<math><mtext><span data-mention-id="u1"><mglyph><style><img src=x onerror=alert(1)>',
]

describe('mentions (server)', () => {
  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    expectSafeMentions(out)
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })

  it('keeps a valid mention as is; the id is escaped, not interpreted', () => {
    expect(sanitize('<p>Ciao <span data-mention-id="u-1@x.it">@Anna Rossi</span></p>')).toBe(
      '<p>Ciao <span class="scriba-mention" data-mention-id="u-1@x.it">@Anna Rossi</span></p>',
    )
    expect(sanitize('<p><span data-mention-id="a&quot;b&lt;c">@X</span></p>')).toBe(
      '<p><span class="scriba-mention" data-mention-id="a&#34;b&#60;c">@X</span></p>',
    )
  })

  it('fuzz: mention output is always safe and stable', () => {
    const chunk = fc.constantFrom(
      '<span data-mention-id="u1">',
      '<span data-mention-id="a b">',
      '<span data-mention-id=">',
      '<span data-mention-id="x" onmouseover=y>',
      '</span>',
      '<p>',
      '</p>',
      '@',
      'Anna',
      ' ',
      '<b>',
      '<img src=x onerror=y>',
      '<script>',
      '"',
      '<',
    )
    fc.assert(
      fc.property(fc.array(chunk, { maxLength: 30 }), (parts) => {
        const out = sanitize(parts.join(''))
        expectSafeMentions(out)
        expect(sanitize(out)).toBe(out)
      }),
      { numRuns: 300 },
    )
  }, 30_000)
})
