/** WHATWG URL parser, available in browsers and Node; declared here because core has no DOM lib. */
declare const URL: new (url: string, base?: string) => { readonly protocol: string }

/**
 * URL whitelist (CLAUDE.md §5.3). Only these protocols are accepted; everything
 * else is rejected. Changing these lists is a security decision: ask first.
 */
const LINK_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const IMAGE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:'])
/** Raster formats only: never `image/svg+xml` (SVG can carry scripts). */
const DATA_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

/** Default maximum decoded size of a `data:` image. */
export const DEFAULT_MAX_DATA_IMAGE_BYTES = 1_000_000

/** How an attribute holding a URL is checked. */
export type UrlRule = { kind: 'link' } | { kind: 'image'; maxDataBytes?: number }

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  tab: '\t',
  newline: '\n',
  sol: '/',
  lpar: '(',
  rpar: ')',
}

/** Decodes numeric and a few named HTML entities, repeatedly (catches double encoding). */
function decodeEntities(value: string): string {
  let prev: string
  let current = value
  let rounds = 0
  do {
    prev = current
    current = current.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);?/gi, (match, body: string) => {
      if (body[0] === '#') {
        const code =
          body[1] === 'x' || body[1] === 'X'
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10)
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? match
    })
  } while (current !== prev && ++rounds < 5)
  return current
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/* eslint-disable no-control-regex -- matching control characters is the point (security normalization) */
/** Removes ASCII control chars, whitespace and C1 controls (browsers ignore many of them in URLs). */
function stripInvisible(value: string): string {
  // Matching control characters is the point here (security normalization).
  const invisible =
    /[\u0000-\u0020\u007f-\u00a0\u1680\u2000-\u200f\u2028-\u202f\u205f\u3000\ufeff]+/g
  return value.replace(invisible, '')
}
/* eslint-enable no-control-regex */

function protocolOf(value: string): string | null {
  const cleaned = stripInvisible(decodeEntities(value))
  // Explicit scheme? Then let the URL parser confirm it (handles odd casing and escapes).
  try {
    return new URL(cleaned, 'https://relative.invalid/').protocol.toLowerCase()
  } catch {
    return null
  }
}

function checkDataImage(value: string, maxBytes: number): string | null {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([a-z0-9+/]*={0,2})$/i.exec(value)
  if (!match) return null
  const type = match[1]!.toLowerCase()
  if (!DATA_IMAGE_TYPES.has(type)) return null
  if (Math.floor((match[2]!.length * 3) / 4) > maxBytes) return null
  return `data:${type};base64,${match[2]}`
}

/**
 * Returns a safe, normalized URL or null when it must be dropped.
 * Relative URLs are allowed. Checks the value both raw and entity-decoded.
 */
export function sanitizeUrl(value: unknown, rule: UrlRule): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2_000_000) return null
  if (hasControlChar(trimmed)) {
    // Control characters inside a URL are never legitimate.
    return null
  }
  const lower = stripInvisible(decodeEntities(trimmed)).toLowerCase()
  if (rule.kind === 'image' && lower.startsWith('data:')) {
    return checkDataImage(
      trimmed.replace(/\s+/g, ''),
      rule.maxDataBytes ?? DEFAULT_MAX_DATA_IMAGE_BYTES,
    )
  }
  const allowed = rule.kind === 'link' ? LINK_PROTOCOLS : IMAGE_PROTOCOLS
  const protocol = protocolOf(trimmed)
  if (!protocol || !allowed.has(protocol)) return null
  // Raw form must agree with the decoded one (no hidden scheme behind entities).
  const rawProtocol = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]
  if (rawProtocol && !allowed.has(rawProtocol.toLowerCase() + ':')) return null
  return trimmed
}
