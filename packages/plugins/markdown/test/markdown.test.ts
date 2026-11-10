// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  HTMLLimitError,
  Schema,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
} from '@scriba-editor/core'
import { listNodes } from '@scriba-editor/plugin-list'
import { blockquoteNodes } from '@scriba-editor/plugin-blockquote'
import { codeBlockNodes } from '@scriba-editor/plugin-code-block'
import { linkMarks } from '@scriba-editor/plugin-link'
import { imageNodes } from '@scriba-editor/plugin-image'
import { tableNodes } from '@scriba-editor/plugin-table'
import { parseMarkdown, serializeMarkdown } from '../src/index.js'

const schema = new Schema({
  nodes: {
    ...basicSchemaSpec.nodes,
    ...listNodes,
    ...blockquoteNodes,
    ...codeBlockNodes,
    ...imageNodes,
    ...tableNodes,
  },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const fromHTML = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const toMd = (html: string) => serializeMarkdown(fromHTML(html))
const fromMd = (md: string) => serializeHTML(parseMarkdown(schema, md))

describe('export (document → Markdown)', () => {
  it.each([
    ['<h2>Titolo</h2><p>testo</p>', '## Titolo\n\ntesto\n'],
    [
      '<p>a <strong>b</strong> <em>c</em> <s>d</s> <code>e`f</code></p>',
      'a **b** *c* ~~d~~ ``e`f``\n',
    ],
    ['<p><a href="https://x.it/a b">link</a></p>', '[link](https://x.it/a%20b)\n'],
    ['<p><strong>grassetto </strong>dopo</p>', '**grassetto** dopo\n'],
    ['<p>riga<br>due</p>', 'riga\\\ndue\n'],
    ['<ul><li><p>a</p></li><li><p>b</p><ul><li><p>c</p></li></ul></li></ul>', '- a\n- b\n  - c\n'],
    ['<ol start="3"><li><p>tre</p></li><li><p>quattro</p></li></ol>', '3. tre\n4. quattro\n'],
    ['<blockquote><p>a</p><p>b</p></blockquote>', '> a\n>\n> b\n'],
    ['<pre><code class="language-js">let a = `x`</code></pre>', '```js\nlet a = `x`\n```\n'],
    ['<p><img src="a.png" alt="foto"></p>', '![foto](a.png)\n'],
  ])('%s', (html, md) => {
    expect(toMd(html)).toBe(md)
  })

  it('escapes text that would become Markdown syntax', () => {
    expect(toMd('<p># no *no* [no](x) 1. no</p>')).toBe('\\# no \\*no\\* \\[no\\](x) 1. no\n')
    expect(toMd('<p>1. elenco?</p>')).toBe('1\\. elenco?\n')
  })

  it('tables: first row as header, spans filled with empty cells', () => {
    expect(
      toMd('<table><tr><th>A</th><th>B</th></tr><tr><td colspan="2">x | y</td></tr></table>'),
    ).toBe('| A | B |\n| --- | --- |\n| x \\| y |  |\n')
  })
})

describe('import (Markdown → document)', () => {
  it('CommonMark and GFM', () => {
    expect(fromMd('# T\n\n- a\n- **b**\n\n| x | y |\n|---|---|\n| 1 | ~~2~~ |\n')).toBe(
      '<h1>T</h1><ul><li><p>a</p></li><li><p><strong>b</strong></p></li></ul>' +
        '<table><tbody><tr><th><p>x</p></th><th><p>y</p></th></tr><tr><td><p>1</p></td><td><p><s>2</s></p></td></tr></tbody></table>',
    )
  })

  it('is untrusted input: raw HTML stays text, unsafe links are removed', () => {
    const out = fromMd(
      '<script>alert(1)</script>\n\n[x](javascript:alert(1)) <img src=x onerror=alert(1)>\n\n![a](data:image/svg+xml;base64,PHN2Zz4=)',
    )
    // real elements/attributes (escaped text like "&lt;img onerror…" is harmless)
    const body = new DOMParser().parseFromString(out, 'text/html').body
    expect(body.querySelector('script, img, [onerror]')).toBeNull()
    expect([...body.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([])
    expect(out).toContain('&lt;script&gt;')
  })

  it('refuses inputs over the limit', () => {
    expect(() => parseMarkdown(schema, 'x'.repeat(20), { maxLength: 10 })).toThrow(HTMLLimitError)
  })
})

describe('round trips', () => {
  const samples = [
    '<h1>Titolo</h1><p>Testo con <strong>grassetto</strong>, <em>corsivo</em> e <a href="https://example.com">link</a>.</p>',
    '<ul><li><p>uno</p></li><li><p>due</p><ol><li><p>a</p></li><li><p>b</p></li></ol></li></ul>',
    '<blockquote><p>citazione <code>codice</code></p></blockquote><pre><code class="language-ts">const a = 1\nconst b = 2</code></pre>',
    '<p>simboli * _ ` [ ] # &lt;tag&gt; | ~ \\ fine</p>',
    '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p><strong>2</strong></p></td></tr></tbody></table>',
  ]
  it.each(samples.map((s) => [s]))('document → Markdown → document: %s', (html) => {
    const doc = fromHTML(html)
    expect(serializeHTML(parseMarkdown(schema, serializeMarkdown(doc)))).toBe(serializeHTML(doc))
  })

  it('Markdown → document → Markdown is stable', () => {
    const md = '# T\n\n1. a\n2. b\n\n> q\n\n```js\nx\n```\n\nfine **b** e `c`\n'
    const once = serializeMarkdown(parseMarkdown(schema, md))
    expect(once).toBe(md)
  })
})
