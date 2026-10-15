import type { DOMLikeElement } from './types.js'

/**
 * Attribute where paste transforms put a rewritten style. Browsers enforcing a
 * strict CSP may refuse to (re)write `style` attributes, even in an inert
 * document; `data-*` attributes are not subject to CSP. Untrusted like `style`.
 */
export const STYLE_DATA_ATTR = 'data-scriba-style'

/**
 * Reads one CSS property from an element's inline style (`data-scriba-style`
 * when present, else `style`), lowercased. Only for *recognizing* formatting
 * while parsing (e.g. Google Docs bold spans); styles are never copied to the
 * output, values are validated by the parse rules.
 */
export function styleValue(el: DOMLikeElement, property: string): string | null {
  const style = el.getAttribute(STYLE_DATA_ATTR) ?? el.getAttribute('style')
  if (!style || style.length > 10_000) return null
  const wanted = property.toLowerCase()
  let found: string | null = null
  for (const decl of style.split(';')) {
    const colon = decl.indexOf(':')
    if (colon < 0) continue
    if (decl.slice(0, colon).trim().toLowerCase() === wanted)
      found = decl
        .slice(colon + 1)
        .trim()
        .toLowerCase()
  }
  return found
}

/** True when `font-weight` means bold. */
export function isBoldWeight(value: string | null): boolean {
  if (!value) return false
  return value === 'bold' || value === 'bolder' || (/^\d+$/.test(value) && Number(value) >= 600)
}
