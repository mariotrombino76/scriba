import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { HTMLLimitError, parseHTML, type DOMLike } from '../../src/index.js'
import { clean, dom } from '../helpers/html.js'
import { schema } from '../helpers/schema.js'
import { expectSafe } from '../helpers/safe.js'

// Known payloads (OWASP XSS Filter Evasion, PortSwigger cheat sheet, mutation XSS).
const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<img src="javascript:alert(1)">',
  '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">',
  '<svg onload=alert(1)><p>x</p></svg>',
  '<svg><script>alert(1)</script></svg>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="  JaVaScRiPt:alert(1)">x</a>',
  '<a href="jav&#x09;ascript:alert(1)">x</a>',
  '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<p onclick="alert(1)" style="background:url(javascript:alert(1))">x</p>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<object data="javascript:alert(1)"></object>',
  '<embed src="x.swf">',
  '<form action="javascript:alert(1)"><button>x</button></form>',
  '<input autofocus onfocus=alert(1)>',
  '<details open ontoggle=alert(1)>',
  '<body onload=alert(1)>',
  '<style>@import "javascript:alert(1)";</style>',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<base href="javascript:alert(1)//">',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '<template><img src=x onerror=alert(1)></template>',
  '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
  '<img src="x" alt="&quot; onerror=alert(1) &quot;">',
  '<a href="https://ok.it" onmouseover="alert(1)">x</a>',
  '<a href="https://ok.it" target="_blank">x</a>',
  '<p id="__proto__" name="getElementById">clobber</p>',
  '<!--<img src=x onerror=alert(1)>-->',
  '<scr<script>ipt>alert(1)</script>',
  '<img src=`x`onerror=alert(1)>',
  '<a href="\u0001javascript:alert(1)">x</a>',
  '"><img src=x onerror=alert(1)>',
]

const stable = (html: string) => {
  const once = clean(html)
  expect(clean(once)).toBe(once)
  return once
}

describe('XSS payloads', () => {
  it.each(PAYLOADS.map((p) => [p]))('neutralizes %s', (payload) => {
    expectSafe(stable(payload))
  })

  it('keeps the visible text of neutralized links', () => {
    expect(clean('<p><a href="javascript:alert(1)">click</a></p>')).toBe('<p>click</p>')
  })

  it('keeps safe images and links', () => {
    expect(clean('<p><img src="https://x.it/a.png" onerror="alert(1)"></p>')).toBe(
      '<p><img src="https://x.it/a.png" alt=""></p>',
    )
    expect(clean('<a href="https://ok.it" target="_blank">x</a>')).toBe(
      '<p><a href="https://ok.it" target="_blank" rel="noopener noreferrer">x</a></p>',
    )
  })

  it('drops ids and names (DOM clobbering)', () => {
    expect(clean('<p id="x" name="y">t</p>')).toBe('<p>t</p>')
  })
})

describe('round-trip fuzzing (mutation XSS guard)', () => {
  const tags = [
    'p',
    'b',
    'i',
    'em',
    'strong',
    'a',
    'img',
    'br',
    'h1',
    'h3',
    'blockquote',
    'pre',
    'code',
    'div',
    'span',
    'script',
    'style',
    'svg',
    'math',
    'table',
    'td',
    'noscript',
    'template',
    'iframe',
    'textarea',
    'title',
  ]
  const attrs = ['href', 'src', 'onerror', 'onclick', 'style', 'target', 'alt', 'id', 'srcset']
  const values = [
    'javascript:alert(1)',
    'https://x.it',
    'x.png',
    'data:image/png;base64,AAAA',
    '"><b>',
    '_blank',
    'data:image/svg+xml;base64,AA',
    '&#106;avascript:alert(1)',
  ]
  const text = fc.constantFrom(
    'x',
    ' ',
    '<',
    '>',
    '&',
    '"',
    "'",
    '&lt;script&gt;',
    '\n',
    '<!--',
    '-->',
    ']]>',
  )

  const html: fc.Arbitrary<string> = fc.letrec((tie) => ({
    node: fc.oneof(
      { depthSize: 'small', withCrossShrink: true },
      text,
      fc
        .tuple(
          fc.constantFrom(...tags),
          fc.array(fc.tuple(fc.constantFrom(...attrs), fc.constantFrom(...values)), {
            maxLength: 2,
          }),
          fc.array(tie('node'), { maxLength: 3 }),
        )
        .map(
          ([tag, as, kids]) =>
            `<${tag}${as.map(([n, v]) => ` ${n}="${v}"`).join('')}>${kids.join('')}</${tag}>`,
        ),
    ),
  })).node as fc.Arbitrary<string>

  it('output is stable and never dangerous', () => {
    fc.assert(
      fc.property(html, (input) => {
        const out = clean(input)
        expectSafe(out)
        expect(clean(out)).toBe(out)
      }),
      { numRuns: 500 },
    )
    // fuzzing is CPU-heavy: generous timeout under parallel runs (same number of cases)
  }, 30_000)
})

describe('parse limits (CLAUDE.md §5.10)', () => {
  const nest = (depth: number): DOMLike => {
    let node: DOMLike = { nodeType: 3, nodeName: '#text', nodeValue: 'x', childNodes: [] }
    for (let i = 0; i < depth; i++) {
      node = {
        nodeType: 1,
        nodeName: 'DIV',
        nodeValue: null,
        childNodes: [node],
        getAttribute: () => null,
      }
    }
    return { nodeType: 11, nodeName: '#document-fragment', nodeValue: null, childNodes: [node] }
  }

  it('rejects too deep nesting', () => {
    expect(() => parseHTML(schema, nest(100_000))).toThrow(HTMLLimitError)
    expect(() => parseHTML(schema, nest(20), { maxDepth: 10 })).toThrow(HTMLLimitError)
    expect(parseHTML(schema, nest(20)).textContent).toBe('x')
  })

  it('rejects too many nodes', () => {
    const many = '<p>x</p>'.repeat(50)
    expect(() => clean(many)).not.toThrow()
    expect(() => parseHTML(schema, dom(many), { maxNodes: 20 })).toThrow(HTMLLimitError)
  })
})
