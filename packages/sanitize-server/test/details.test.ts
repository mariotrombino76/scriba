import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba-editor/core'
import { linkMarks } from '../../plugins/link/src/index.js'
import { detailsNodes } from '../../plugins/details/src/nodes.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/** Collapsible sections: `<details>` keeps only `open`, `<summary>` nothing (§5.4). */
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...detailsNodes },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))

const PAYLOADS = [
  '<details open ontoggle="alert(1)"><summary>T</summary><p>a</p></details>',
  '<details ontoggle=alert(1) open id="location" class="x" style="background:url(javascript:alert(1))"><p>b</p></details>',
  '<details><summary onclick="alert(1)"><img src=x onerror=alert(1)><a href="javascript:alert(1)">c</a></summary>d</details>',
  '<details><summary><script>alert(1)</script><style>*{}</style>e</summary><iframe src="javascript:alert(1)"></iframe></details>',
  '<svg><details open ontoggle=alert(1)><summary>f</summary></details></svg><math><details><summary>g</summary></details></math>',
  '<noscript><details open ontoggle=alert(1)></noscript><p>h</p>',
  '<details><summary>i</summary><details><summary>j</summary><details ontoggle=alert(1)>k</details></details></details>',
  '<summary ontoggle=alert(1)>l</summary><p>m<details open><summary>n</summary>o</details>p</p>',
]

describe('details (server)', () => {
  it('keeps the section, open or closed, and nothing else', () => {
    expect(sanitize(PAYLOADS[0]!)).toBe('<details open=""><summary>T</summary><p>a</p></details>')
    expect(sanitize(PAYLOADS[1]!)).toBe('<details open=""><summary></summary><p>b</p></details>')
    expect(sanitize(PAYLOADS[2]!)).toBe('<details><summary>c</summary><p>d</p></details>')
  })

  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    expect(out).not.toMatch(
      /on\w+=|javascript:|<script|<style|<iframe|<img|<svg|id=|class=|style=/i,
    )
    expect(out).not.toMatch(/<details(?! open="">|>)/)
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })

  it('deeply nested sections stop at the depth limit', () => {
    const deep = '<details><summary>x</summary>'.repeat(400) + '</details>'.repeat(400)
    expect(() => sanitize(deep)).toThrow()
  })
})
