import { describe, expect, it } from 'vitest'
import { Schema, parseHTML, serializeHTML, type DOMLike } from '../../src/index.js'
import { b, bi, br, doc, h, i, img, p, pre, quote, schema } from '../helpers/schema.js'
import { clean, dom, fromHTML } from '../helpers/html.js'

const same = (html: string, expected: ReturnType<typeof doc>) => {
  const parsed = fromHTML(html)
  expect(parsed.toString()).toBe(expected.toString())
}

describe('HTMLParser', () => {
  it('parses blocks, inline nodes and marks', () => {
    same(
      '<h1>T</h1><p>a <strong>b</strong><br><em>c</em></p>',
      doc(h(1, 'T'), p('a ', b('b'), br(), i('c'))),
    )
    same('<blockquote><p>q</p></blockquote>', doc(quote(p('q'))))
    same(
      '<p><img src="x.png" alt="X"></p>',
      doc(p(schema.node('image', { src: 'x.png', alt: 'X' }))),
    )
    expect(img('x')).toBeTruthy()
  })

  it('returns a valid empty document for empty input', () => {
    same('', doc(p()))
    same('<script>x</script>', doc(p()))
  })

  it('wraps stray inline content in paragraphs', () => {
    same('hello <b>world</b>', doc(p('hello ', b('world'))))
    same('<div>one</div><div>two</div>', doc(p('one'), p('two')))
    same('<p>a</p>loose<p>b</p>', doc(p('a'), p('loose'), p('b')))
  })

  it('collapses whitespace outside code', () => {
    same('<p>  a \n  b  </p>\n  <p> c</p>', doc(p('a b'), p('c')))
    same('<p>a<br> b</p>', doc(p('a', br(), 'b')))
    same('<pre>  x\n  y</pre>', doc(pre('  x\n  y')))
  })

  it('turns <br> inside code blocks into newlines', () => {
    same('<pre>a<br>b</pre>', doc(pre('a\nb')))
  })

  it('drops marks not allowed in the parent', () => {
    same('<pre><code><b>x</b></code></pre>', doc(pre('x')))
  })

  it('recognizes Google Docs and Word style formatting', () => {
    same(
      '<b style="font-weight:normal" id="docs-internal-guid-1"><p><span style="font-weight:700">B</span> <span style="font-style:italic">I</span></p></b>',
      doc(p(b('B'), ' ', i('I'))),
    )
    same('<p><span style="font-weight: bold; font-style: italic">x</span></p>', doc(p(bi('x'))))
  })

  it('closes paragraphs when blocks appear inside them (non-browser trees)', () => {
    // Browsers fix this nesting themselves; other DOM sources (adapters) may not.
    const text = (v: string): DOMLike => ({
      nodeType: 3,
      nodeName: '#text',
      nodeValue: v,
      childNodes: [],
    })
    const el = (tag: string, ...kids: DOMLike[]): DOMLike => ({
      nodeType: 1,
      nodeName: tag,
      nodeValue: null,
      childNodes: kids,
      getAttribute: () => null,
    })
    const root = el(
      'body',
      el('p', text('a'), el('blockquote', text('q')), text('b')),
      el('h2', text('c'), el('h3', text('d'))),
    )
    expect(parseHTML(schema, root).toString()).toBe(
      doc(p('a'), quote(p('q')), p('b'), h(2, 'c'), h(3, 'd')).toString(),
    )
  })

  it('unwraps unknown elements, keeping text', () => {
    same('<p><span class="x" data-y="1">t</span><font color="red">u</font></p>', doc(p('tu')))
  })

  it('keeps links with safe URLs', () => {
    const link = schema.mark('link', { href: 'https://example.com' })
    same('<p><a href="https://example.com">x</a></p>', doc(p(schema.text('x', [link]))))
  })

  it('round-trips its own output', () => {
    const html =
      '<h2>T</h2><p>a<strong><em>b</em>c</strong><br>d</p><blockquote><p>q</p></blockquote>'
    expect(clean(html)).toBe(html)
  })

  describe('content that must start with a title ("title block+")', () => {
    const titled = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          group: 'block',
          content: 'inline*',
          parseHTML: [{ tag: 'p' }],
          toHTML: () => ['p', 0],
        },
        box: {
          group: 'block',
          content: 'box_title block+',
          parseHTML: [{ tag: 'section' }],
          toHTML: () => ['section', 0],
        },
        box_title: { content: 'inline*', parseHTML: [{ tag: 'h6' }], toHTML: () => ['h6', 0] },
        text: { group: 'inline' },
      },
    })
    const parse = (html: string) => serializeHTML(parseHTML(titled, dom(html)))

    it('loose text after the title goes into a paragraph, not a second title', () => {
      expect(parse('<section><h6>T</h6>testo</section>')).toBe(
        '<section><h6>T</h6><p>testo</p></section>',
      )
    })

    it('a missing title is created empty, the content is kept', () => {
      expect(parse('<section><p>a</p><p>b</p></section>')).toBe(
        '<section><h6></h6><p>a</p><p>b</p></section>',
      )
    })
  })
})
