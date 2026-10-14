import { sanitizeUrl, type UrlRule } from '../html/url.js'

/** Immutable attribute bag of nodes and marks. Values must be JSON-serializable. */
export type Attrs = Readonly<Record<string, unknown>>

/** Declares one attribute of a node or mark type. */
export interface AttrSpec {
  /** Default value. When absent, the attribute is required. */
  default?: unknown
  /** Optional validator; invalid values make node/mark creation throw. */
  validate?: (value: unknown) => boolean
  /**
   * Marks the attribute as a URL. Unsafe URLs (non-whitelisted protocols,
   * SVG data images…) are rejected wherever the node or mark is created:
   * HTML parsing, JSON, collaboration steps. Normalized values are stored.
   */
  url?: UrlRule
}

export const emptyAttrs: Attrs = Object.freeze({})

/** Shallow-deep structural equality for JSON-like attribute values. */
export function attrsEqual(a: Attrs, b: Attrs): boolean {
  if (a === b) return true
  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) return false
  return keysA.every((k) => valueEqual(a[k], b[k]))
}

function valueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) =>
    valueEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  )
}

/**
 * Fills defaults, drops unknown attributes and validates the result.
 * Throws when a required attribute is missing or invalid.
 */
export function computeAttrs(
  specs: Readonly<Record<string, AttrSpec>>,
  given: Record<string, unknown> | null | undefined,
  owner: string,
): Attrs {
  const names = Object.keys(specs)
  if (!names.length) return emptyAttrs
  const result: Record<string, unknown> = {}
  for (const name of names) {
    const spec = specs[name]!
    let value = given?.[name]
    if (value === undefined) {
      if (!('default' in spec))
        throw new RangeError(`No value supplied for attribute "${name}" of ${owner}`)
      value = spec.default
    }
    if (spec.url && !(value === null && spec.default === null)) {
      const safe = sanitizeUrl(value, spec.url)
      if (safe === null) throw new RangeError(`Unsafe URL in attribute "${name}" of ${owner}`)
      value = safe
    }
    if (spec.validate && !spec.validate(value)) {
      throw new RangeError(`Invalid value for attribute "${name}" of ${owner}`)
    }
    result[name] = value
  }
  return Object.freeze(result)
}
