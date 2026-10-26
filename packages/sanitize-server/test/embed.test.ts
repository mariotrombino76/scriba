import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba/core'
import { linkMarks } from '../../plugins/link/src/index.js'
import { embedNodes } from '../../plugins/embed/src/nodes.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/**
 * Video embeds (§5.5): an iframe only with the exact player address of YouTube
 * (privacy-enhanced) or Vimeo; src rebuilt, sandbox/referrerpolicy/loading fixed.
 */
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...embedNodes },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))
const plain = (html: string) => sanitizeHTML(new Schema(basicSchemaSpec), html)

const FIXED =
  'sandbox="allow-scripts allow-same-origin allow-presentation" ' +
  'referrerpolicy="strict-origin-when-cross-origin" loading="lazy"'

const PAYLOADS = [
  '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="ok"></iframe>',
  '<iframe src="https://player.vimeo.com/video/76979871" sandbox="allow-top-navigation allow-popups allow-forms" allow="camera" allowfullscreen></iframe>',
  '<iframe src="javascript:alert(1)"></iframe><iframe src="data:text/html,<script>alert(1)</script>"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe><iframe src="https://evil.example/embed/dQw4w9WgXcQ"></iframe>',
  '<iframe src="https://www.youtube-nocookie.com@evil.example/embed/dQw4w9WgXcQ"></iframe><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
  '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" onload="alert(1)" title="&quot; onload=&quot;alert(2)"></iframe>',
  '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"><img src=x onerror=alert(1)></iframe><p>dopo</p>',
  '<p>a<iframe src="https://player.vimeo.com/video/1" width="1e9" height="-5"></iframe>b</p>',
  '<frame src="https://player.vimeo.com/video/1"><object data="https://player.vimeo.com/video/1"></object><embed src="https://player.vimeo.com/video/1">',
  '<svg><iframe src="https://player.vimeo.com/video/1"></iframe></svg><math><iframe src="https://player.vimeo.com/video/1"></iframe></math>',
  '<noscript><iframe src="https://player.vimeo.com/video/1"></iframe></noscript>',
  '<template><iframe src="https://player.vimeo.com/video/1"></iframe></template>',
]

describe('embed (server)', () => {
  it('keeps the allowed players, rebuilt with the fixed attributes', () => {
    expect(sanitize(PAYLOADS[0]!)).toBe(
      `<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" width="560" height="315" title="ok" ${FIXED}></iframe>`,
    )
    expect(sanitize(PAYLOADS[1]!)).toBe(
      `<iframe src="https://player.vimeo.com/video/76979871" width="560" height="315" title="Vimeo" ${FIXED}></iframe>`,
    )
    expect(sanitize(PAYLOADS[2]!)).toBe('<p></p>')
    expect(sanitize(PAYLOADS[3]!)).toBe('<p></p>')
    expect(sanitize(PAYLOADS[4]!)).toBe('<p></p>')
  })

  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    // attribute names and tags only: text inside (escaped) attribute values is not markup
    const markup = out.replace(/"[^"]*"/g, '""')
    expect(out).not.toMatch(/javascript:|data:|srcdoc|<script/i)
    expect(markup).not.toMatch(
      /on\w+=|javascript:|data:|srcdoc|allow=|allowfullscreen|<img|<object|<embed|<frame /i,
    )
    for (const iframe of out.match(/<iframe[^>]*>/g) ?? [])
      expect(iframe).toMatch(
        /^<iframe src="https:\/\/(www\.youtube-nocookie\.com\/embed\/[\w-]{11}|player\.vimeo\.com\/video\/\d+)" width="\d+" height="\d+" title="[^"<>]*" sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="strict-origin-when-cross-origin" loading="lazy">$/,
      )
    expect(sanitize(out)).toBe(out)
  })

  // Not the leading <noscript> (a browser document moves it into <head>, see details.test.ts).
  const agree = PAYLOADS.filter((p) => !p.startsWith('<noscript>'))
  it.each(agree.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })

  it('a schema without the embed node drops every iframe', () => {
    for (const payload of PAYLOADS) expect(plain(payload)).not.toContain('<iframe')
  })
})
