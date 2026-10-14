import type { DOMLikeElement } from './types.js'

/**
 * Reads one CSS property from an element's inline `style`, lowercased.
 * Only for *recognizing* formatting while parsing (e.g. Google Docs bold spans);
 * styles are never copied to the output.
 */
export function styleValue(el: DOMLikeElement, property: string): string | null {
  const style = el.getAttribute('style')
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
