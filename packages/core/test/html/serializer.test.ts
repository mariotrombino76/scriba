import { describe, expect, it } from 'vitest'
import { HTMLSerializer, Schema, serializeHTML, type HTMLSpec } from '../../src/index.js'
import { b, bi, br, doc, h, i, img, p, pre, quote, schema } from '../helpers/schema.js'

describe('serializeHTML', () => {
  it('writes blocks and inline nodes', () => {
    const d = doc(h(2, 'T'), p('a', br(), 'b'), quote(p('q')), pre('x < y'))
    expect(serializeHTML(d)).toBe(
      '<h2>T</h2><p>a<br>b</p><blockquote><p>q</p></blockquote><pre><code>x &lt; y</code></pre>',
    )
  })

  it('opens and closes marks minimally', () => {
    expect(serializeHTML(doc(p('a', bi('b'), b('c'), i('d'))))).toBe(
      '<p>a<strong><em>b</em>c</strong><em>d</em></p>',
    )
  })

  it('leaves out marks with serialize: false (only their text is written)', () => {
    const s = new Schema({
      nodes: {
        doc: { content: 'para+' },
        para: { content: 'text*', toHTML: () => ['p', 0] },
        text: {},
      },
      marks: {
        note: {
          attrs: { id: {} },
          serialize: false,
          excludes: '',
          toHTML: () => ['span', { class: 'n' }, 0],
        },
        strong: { toHTML: () => ['strong', 0] },
      },
    })
    const text = s.text('ab', [s.mark('note', { id: '1' }), s.mark('strong')])
    expect(new HTMLSerializer(s).serializeNode(s.node('para', null, [text]))).toBe(
      '<p><strong>ab</strong></p>',
    )
  })

  it('escapes text and attributes', () => {
    expect(serializeHTML(doc(p('<script>alert("x")</script> & co')))).toBe(
      '<p>&lt;script&gt;alert("x")&lt;/script&gt; &amp; co</p>',
    )
    const image = schema.node('image', { src: 'a.png', alt: '"><script>' })
    expect(serializeHTML(doc(p(image)))).toBe(
      '<p><img src="a.png" alt="&#34;&#62;&#60;script&#62;"></p>',
    )
    expect(img('x')).toBeTruthy()
  })

  it('adds rel to links opening a new tab', () => {
    const link = schema.mark('link', { href: 'https://x.it', target: '_blank' })
    expect(serializeHTML(doc(p(schema.text('x', [link]))))).toBe(
      '<p><a href="https://x.it" target="_blank" rel="noopener noreferrer">x</a></p>',
    )
  })

  it('refuses dangerous output specs from schema authors', () => {
    const make = (toHTML: () => HTMLSpec) =>
      new HTMLSerializer(
        new Schema({
          nodes: {
            doc: { content: 'block+' },
            para: { content: 'text*', group: 'block', toHTML },
            text: {},
          },
        }),
      )
    const run = (toHTML: () => HTMLSpec) => {
      const s = make(toHTML)
      return s.serializeNode(s.schema.node('para', null, [s.schema.text('x')]))
    }
    expect(() => run(() => ['p', { onclick: 'alert(1)' }, 0])).toThrow(/onclick/)
    expect(() => run(() => ['p', { style: 'color:red' }, 0])).toThrow(/style/)
    expect(() => run(() => ['p onclick=x', 0])).toThrow(/tag/)
    expect(run(() => ['a', { href: 'javascript:alert(1)' }, 0])).toBe('<a>x</a>')
  })
})
