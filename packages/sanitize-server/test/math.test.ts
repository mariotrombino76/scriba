import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba/core'
import { linkMarks } from '../../plugins/link/src/index.js'
import { createMathNodes } from '../../plugins/math/src/nodes.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/**
 * Formulas (§5.2, §5.5): only the LaTeX annotation is read; the MathML is
 * generated again by KaTeX (no trust). Known MathML mutation XSS payloads.
 */
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...createMathNodes(katex) },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))
const TEX = (latex: string, display = false) =>
  `<math${display ? ' display="block"' : ''}><semantics><mrow></mrow><annotation encoding="application/x-tex">${latex}</annotation></semantics></math>`

/** Re-parses the output like a browser and checks every element and attribute. */
const HTML_TAGS = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'br',
  'strong',
  'em',
  'code',
  'pre',
  'blockquote',
]
const MATH_TAGS = [
  'math', 'semantics', 'annotation', 'mrow', 'mi', 'mn', 'mo', 'ms', 'mtext', 'mspace', 'msup',
  'msub', 'msubsup', 'munder', 'mover', 'munderover', 'mfrac', 'msqrt', 'mroot', 'mstyle',
  'mpadded', 'mphantom', 'menclose', 'mtable', 'mtr', 'mtd', 'mlabeledtr', 'merror',
  'mmultiscripts', 'mprescripts', 'none',
] // prettier-ignore
const NEVER = /^(on.*|href|xlink:href|src|style|class|id|name|action|formaction|srcdoc)$/i
function expectSafeMath(html: string): void {
  interface El {
    nodeType: number
    nodeName: string
    childNodes: ArrayLike<El>
    attributes?: ArrayLike<{ name: string }>
  }
  const walk = (node: El): void => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i]!
      expect(child.nodeType).not.toBe(8)
      if (child.nodeType !== 1) continue
      const tag = child.nodeName.toLowerCase()
      expect([...HTML_TAGS, ...MATH_TAGS], `tag <${tag}> in ${html}`).toContain(tag)
      for (let j = 0; j < (child.attributes?.length ?? 0); j++)
        expect(child.attributes![j]!.name, `attribute on <${tag}> in ${html}`).not.toMatch(NEVER)
      walk(child)
    }
  }
  walk(dom(html) as unknown as El)
}

const PAYLOADS = [
  `<p>${TEX('x^2+1')}</p>${TEX('\\int_0^1 f', true)}`,
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<math><mtext><h1><a href="javascript:alert(1)">x</a></h1></mtext><annotation encoding="application/x-tex">a</annotation></math>',
  '<math><annotation-xml encoding="text/html"><img src=x onerror=alert(1)></annotation-xml><annotation encoding="application/x-tex">b</annotation></math>',
  '<math href="javascript:alert(1)"><mi xlink:href="javascript:alert(1)">c</mi><annotation encoding="application/x-tex">c</annotation></math>',
  `<p>${TEX('\\href{javascript:alert(1)}{x}\\includegraphics{https://e.x/a.png}')}</p>`,
  `<p>${TEX('&lt;/annotation&gt;&lt;img src=x onerror=alert(1)&gt;')}</p>`,
  '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
  '<math><mi><mglyph><svg><mtext><style><img src=x onerror=alert(1)></style></mtext></svg></mglyph></mi></math>',
  '<svg><math><annotation encoding="application/x-tex">d</annotation></math></svg>',
  `<p>${TEX('\\def\\a{\\a\\a}\\a')}</p>`,
]

describe('formulas (server)', () => {
  it('regenerates the MathML from the LaTeX', () => {
    const out = sanitize(`<p>${TEX('x^2')}</p>`)
    expect(out).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
    expect(out).toContain('<annotation encoding="application/x-tex">x^2</annotation>')
  })

  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    expectSafeMath(out)
    // attribute names only (the LaTeX annotation is text and may contain anything, escaped)
    const markup = out.replace(/>[^<]*</g, '><')
    expect(markup).not.toMatch(
      /\s(href|xlink:href|on\w+|style|class|src)=|<(img|svg|style|mglyph|annotation-xml|maction|a|h1|form|table)\b/i,
    )
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })

  it('a schema without formulas drops every <math>', () => {
    const plain = new Schema(basicSchemaSpec)
    for (const payload of PAYLOADS) expect(sanitizeHTML(plain, payload)).not.toContain('<math')
  })
})
