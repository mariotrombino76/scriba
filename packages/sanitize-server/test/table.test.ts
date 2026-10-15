import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba/core'
import { tableNodes } from '../../plugins/table/src/nodes.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/** Tables: spans and widths are the only cell attributes, all numeric (no style, no handlers). */
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...tableNodes },
  marks: basicSchemaSpec.marks,
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))

const CELL_ATTRS = ['colspan', 'rowspan', 'width', 'data-colwidth']
const ALLOWED: Record<string, readonly string[]> = {
  table: [], tbody: [], tr: [], td: CELL_ATTRS, th: CELL_ATTRS, p: [], h1: [], h2: [], h3: [],
  h4: [], h5: [], h6: [], br: [], strong: [], em: [], u: [], s: [], code: [],
} // prettier-ignore

interface El {
  nodeType: number
  nodeName: string
  childNodes: ArrayLike<El>
  attributes?: ArrayLike<{ name: string; value: string }>
}

function expectSafeTable(html: string): void {
  const walk = (node: El): void => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i]!
      if (child.nodeType !== 1) continue
      const tag = child.nodeName.toLowerCase()
      expect(Object.keys(ALLOWED), `tag <${tag}> in ${html}`).toContain(tag)
      for (let j = 0; j < (child.attributes?.length ?? 0); j++) {
        const { name, value } = child.attributes![j]!
        expect(ALLOWED[tag], `attribute ${name} on <${tag}> in ${html}`).toContain(name)
        expect(value, `value of ${name} in ${html}`).toMatch(/^\d+(,\d+)*$/)
      }
      walk(child)
    }
  }
  walk(dom(html) as unknown as El)
}

const PAYLOADS = [
  '<table><tr><td onclick="alert(1)" style="background:url(javascript:alert(1))">a</td></tr></table>',
  '<table><tr><td colspan="2 onmouseover=alert(1)" rowspan="1e9">a</td></tr></table>',
  '<table><tr><td width="100px;background:red" data-colwidth="1,javascript:2">a</td></tr></table>',
  '<table background="javascript:alert(1)"><caption><script>alert(1)</script></caption><tr><td>a</td></tr></table>',
  '<table><tr><td><iframe src="https://evil"></iframe><img src=x onerror=alert(1)>b</td></tr></table>',
  '<table><tr><td>a</td></tr><tr></tr><tr><th id="x" name="y" class="z">h</th></tr></table>',
  '<table><colgroup><col style="width:1px"></colgroup><thead><tr><th>h</th></tr></thead><tfoot><tr><td>f</td></tr></tfoot></table>',
  '<td>orphan</td><tr><td>row</td></tr>',
  '<table><tr><td><table><tr><td>nested</td></tr></table></td></tr></table>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
]

describe('tables (server)', () => {
  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    expectSafeTable(out)
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })

  it('keeps spans and widths', () => {
    expect(sanitize('<table><tr><td colspan="2" data-colwidth="100,50">a</td></tr></table>')).toBe(
      '<table><tbody><tr><td colspan="2" width="150" data-colwidth="100,50"><p>a</p></td></tr></tbody></table>',
    )
  })

  it('fuzz: table output is always safe and stable', () => {
    const chunk = fc.constantFrom(
      '<table>',
      '</table>',
      '<tr>',
      '</tr>',
      '<td colspan="3">',
      '<td rowspan="0">',
      '<td width="-5">',
      '<td data-colwidth="9,x">',
      '<th onclick=x>',
      '</td>',
      '<tbody>',
      '<caption>',
      '<p>',
      'text',
      '<img src=x onerror=y>',
      '<script>',
      '"',
      '<',
    )
    fc.assert(
      fc.property(fc.array(chunk, { maxLength: 30 }), (parts) => {
        const out = sanitize(parts.join(''))
        expectSafeTable(out)
        expect(sanitize(out)).toBe(out)
      }),
      { numRuns: 300 },
    )
  }, 30_000)
})
