import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { HTMLLimitError } from '@scriba-editor/core'
import { InputTooLargeError, sanitizeHTML } from '../src/index.js'
import { schema } from '../../core/test/helpers/schema.js'
import { clean as cleanInBrowser } from '../../core/test/helpers/html.js'
import { expectSafe } from '../../core/test/helpers/safe.js'

const sanitize = (html: string) => sanitizeHTML(schema, html)

const PAYLOADS = [
  '<script>alert(1)</script><p>ok</p>',
  '<img src=x onerror=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="jav&#x09;ascript:alert(1)">x</a>',
  '<svg onload=alert(1)><p>x</p></svg>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '<template><img src=x onerror=alert(1)></template>',
  '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
  '<p style="x" onclick="y">t</p>',
  '<iframe src="https://x"></iframe><form><input></form>',
  '<a href="https://ok.it" target="_blank">x</a>',
  '<h2>T</h2><p>a <b>b</b> <i>c</i><br>d</p><blockquote><p>q</p></blockquote><pre>  x\n y</pre>',
  '<b style="font-weight:normal"><p><span style="font-weight:700">B</span></p></b>',
  // regression: parsed as a whole document like the editor's DOMParser, not as a fragment
  // (a leading <noscript> goes into <head>, its other content back to <body>)
  '<noscript><blockquote></noscript><p>h</p>',
  '<noscript><h1>x</h1></noscript><p>y</p>',
  '<title>t</title><meta charset="x"><style>p{}</style><p>z</p>',
  '<html><head><noscript><p>a</p></noscript></head><body><p>b</p></body></html>',
  '<frameset><frame src="javascript:alert(1)"></frameset>',
  '</head><p>c</p></body><p>d</p></html><p>e</p>',
]

describe('sanitizeHTML (server)', () => {
  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    expectSafe(out)
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))(
    'gives the same result as the browser parser for %s',
    (payload) => {
      expect(sanitize(payload)).toBe(cleanInBrowser(payload))
    },
  )

  it('keeps legitimate content', () => {
    expect(sanitize('<p>Ciao <strong>mondo</strong></p>')).toBe(
      '<p>Ciao <strong>mondo</strong></p>',
    )
  })

  it('enforces input limits', () => {
    expect(() => sanitizeHTML(schema, 'x'.repeat(100), { maxInputLength: 10 })).toThrow(
      InputTooLargeError,
    )
    expect(() => sanitizeHTML(schema, '<div>'.repeat(2000) + 'x')).toThrow(HTMLLimitError)
    expect(() => sanitizeHTML(schema, 42 as unknown as string)).toThrow(TypeError)
  })

  it('fuzz: server output is always safe and stable', () => {
    const chunk = fc.constantFrom(
      '<p>',
      '</p>',
      '<b>',
      '</b>',
      '<a href="javascript:x">',
      '<a href="https://x">',
      '</a>',
      '<img src=x onerror=y>',
      '<svg>',
      '</svg>',
      '<script>',
      '</script>',
      '<style>',
      '<noscript>',
      '<!--',
      '-->',
      'text',
      '"',
      "'",
      '&amp;',
      '<',
      '>',
      '<pre>',
      '</pre>',
      '<math>',
      '<table>',
      '<td>',
      '<template>',
      '<br>',
    )
    fc.assert(
      fc.property(fc.array(chunk, { maxLength: 30 }), (parts) => {
        const out = sanitize(parts.join(''))
        expectSafe(out)
        expect(sanitize(out)).toBe(out)
      }),
      { numRuns: 500 },
    )
    // fuzzing is CPU-heavy: generous timeout under parallel runs (same number of cases)
  }, 30_000)
})
