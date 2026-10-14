import { describe, expect, it } from 'vitest'
import {
  HTMLSerializer,
  Schema,
  normalizeColor,
  normalizeFontFamily,
  normalizeLength,
  safeStyleDecls,
  styleToString,
  type HTMLSpec,
} from '../../src/index.js'

/** Typed styles (CLAUDE.md §5.4): whitelisted properties, strict values, no free CSS. */
describe('typed styles', () => {
  it.each([
    'red; background: url(javascript:alert(1))',
    'expression(alert(1))',
    'url(https://evil.example/x.png)',
    'var(--x)',
    '#12345g',
    '#1234',
    'rgb(300, 0, 0)',
    'rgba(0, 0, 0, 0.5)',
    'hsl(0, 100%, 50%)',
    '/**/red',
    'red !important',
    '',
  ])('rejects color %j', (value) => {
    expect(normalizeColor(value)).toBeNull()
  })

  it('normalizes accepted colors to #rrggbb', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc')
    expect(normalizeColor(' #C0392B ')).toBe('#c0392b')
    expect(normalizeColor('rgb(255, 0, 10)')).toBe('#ff000a')
    expect(normalizeColor('Navy')).toBe('#000080')
  })

  it.each(['12', '12px;color:red', '-5px', '1e3px', '12vh', 'calc(1px + 2px)', '99999px'])(
    'rejects length %j',
    (value) => {
      expect(normalizeLength(value, ['px', 'pt', 'em', 'rem', '%'])).toBeNull()
    },
  )

  it.each([
    'Arial; } body { display:none',
    "x'); background: url(javascript:alert(1)) ('",
    'Arial</style><script>alert(1)</script>',
    '"Comic Sans MS',
    '@import x',
    'a\\62 c',
  ])('rejects font family %j', (value) => {
    expect(normalizeFontFamily(value)).toBeNull()
  })

  it('normalizes font families', () => {
    expect(normalizeFontFamily('"Times New Roman", serif')).toBe("'Times New Roman', serif")
    expect(normalizeFontFamily('Arial')).toBe('Arial')
  })

  it('refuses unknown properties and drops invalid values', () => {
    expect(() => safeStyleDecls({ position: 'fixed' })).toThrow(/position/)
    expect(() => safeStyleDecls({ behavior: 'url(x.htc)' })).toThrow()
    expect(safeStyleDecls({ 'text-align': 'center', color: 'url(x)' })).toEqual([
      ['text-align', 'center'],
    ])
    expect(styleToString({ 'text-align': 'RIGHT', 'margin-left': '4em' })).toBe(
      'text-align: right; margin-left: 4em',
    )
  })

  it('serializer writes only validated styles and never free style strings', () => {
    const make = (toHTML: () => HTMLSpec) =>
      new HTMLSerializer(
        new Schema({
          nodes: { doc: { content: 'para+' }, para: { content: 'text*', toHTML }, text: {} },
        }),
      )
    const out = (toHTML: () => HTMLSpec) => {
      const s = make(toHTML)
      return s.serializeNode(s.schema.node('para', null, [s.schema.text('x')]))
    }
    expect(out(() => ['p', { style: { color: '#ABC', 'text-align': 'center' } }, 0])).toBe(
      '<p style="color: #aabbcc; text-align: center">x</p>',
    )
    expect(out(() => ['p', { style: { color: 'red;x:url(y)' } }, 0])).toBe('<p>x</p>')
    expect(() => out(() => ['p', { style: 'color: red' }, 0])).toThrow(/typed/)
  })
})
