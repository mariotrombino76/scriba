import { describe, expect, it } from 'vitest'
import { sanitizeUrl } from '../../src/index.js'

const link = { kind: 'link' } as const
const image = { kind: 'image' } as const

describe('sanitizeUrl (whitelist, CLAUDE.md §5.3)', () => {
  it.each([
    'https://example.com/a?b=c#d',
    'http://example.com',
    'mailto:a@b.it',
    'tel:+390123456',
    '/relative/path',
    'relative.html',
    '#anchor',
    '?q=1',
  ])('accepts link %s', (url) => {
    expect(sanitizeUrl(url, link)).toBe(url)
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'java\u0000script:alert(1)',
    '&#106;avascript:alert(1)',
    '&#x6A;avascript:alert(1)',
    '&#0000106avascript:alert(1)',
    'javascript&colon;alert(1)',
    '&amp;#106;avascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:text/html;base64,PHNjcmlwdD4=',
    'file:///etc/passwd',
    'ftp://x',
    'blob:https://x/1',
    'livescript:x',
    '\u00a0javascript:alert(1)',
    '\ufeffjavascript:alert(1)',
    '',
    '   ',
  ])('rejects link %j', (url) => {
    expect(sanitizeUrl(url, link)).toBeNull()
  })

  it('rejects non-strings', () => {
    expect(sanitizeUrl(null, link)).toBeNull()
    expect(sanitizeUrl({ toString: () => 'https://x' }, link)).toBeNull()
  })

  it('allows only raster data images within the size limit', () => {
    expect(sanitizeUrl('data:image/png;base64,iVBORw0KGgo=', image)).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    )
    expect(sanitizeUrl('data:IMAGE/JPEG;base64,AAAA', image)).toBe('data:image/jpeg;base64,AAAA')
    expect(sanitizeUrl('data:image/svg+xml;base64,PHN2Zz4=', image)).toBeNull()
    expect(sanitizeUrl('data:image/svg+xml,<svg onload=alert(1)>', image)).toBeNull()
    expect(sanitizeUrl('data:image/png,rawdata', image)).toBeNull()
    expect(
      sanitizeUrl('data:image/png;base64,' + 'A'.repeat(4000), {
        kind: 'image',
        maxDataBytes: 1000,
      }),
    ).toBeNull()
    expect(sanitizeUrl('data:image/png;base64,AAAA', link)).toBeNull()
  })

  it('does not allow mailto/tel for images', () => {
    expect(sanitizeUrl('mailto:a@b.it', image)).toBeNull()
    expect(sanitizeUrl('https://x/y.png', image)).toBe('https://x/y.png')
  })
})
