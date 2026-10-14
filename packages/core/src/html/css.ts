/**
 * Typed inline styles (CLAUDE.md §5.4).
 *
 * Styles never pass through as free text. Node/mark specs output a
 * `{ property: value }` object; only the properties below are allowed and every
 * value is normalized by a strict validator (or dropped). `url()`, `expression()`,
 * `var()`, `@import`, comments and extra declarations can never get through.
 * Adding a property here is a security decision: ask first.
 */

export type StyleDecls = Readonly<Record<string, string | null | undefined>>

/** The 16 basic HTML color names (as produced by Word and older editors). */
const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: '#000000',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  white: '#ffffff',
  maroon: '#800000',
  red: '#ff0000',
  purple: '#800080',
  fuchsia: '#ff00ff',
  green: '#008000',
  lime: '#00ff00',
  olive: '#808000',
  yellow: '#ffff00',
  navy: '#000080',
  blue: '#0000ff',
  teal: '#008080',
  aqua: '#00ffff',
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0')

/** `#rgb`, `#rrggbb`, `rgb(r, g, b)` or a basic color name → `#rrggbb`; anything else → null. */
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null
  const v = value.trim().toLowerCase()
  if (NAMED_COLORS[v]) return NAMED_COLORS[v]!
  let m = /^#([0-9a-f]{3})$/.exec(v)
  if (m) return '#' + [...m[1]!].map((c) => c + c).join('')
  m = /^#([0-9a-f]{6})$/.exec(v)
  if (m) return v
  m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v)
  if (m) {
    const parts = [m[1], m[2], m[3]].map(Number)
    if (parts.every((n) => n <= 255)) return '#' + parts.map(hex2).join('')
  }
  return null
}

/** A number with one of the allowed units, within `max`; normalized (e.g. `"12.0pt"` → `"12pt"`). */
export function normalizeLength(
  value: unknown,
  units: readonly string[],
  max = 1000,
): string | null {
  if (typeof value !== 'string' || value.length > 32) return null
  const m = /^(\d{1,4}(?:\.\d{1,3})?)(px|pt|em|rem|%)$/.exec(value.trim().toLowerCase())
  if (!m || !units.includes(m[2]!)) return null
  const n = Number(m[1])
  if (!(n >= 0 && n <= max)) return null
  return `${n}${m[2]}`
}

/** Font family list: names made of letters, digits, spaces, hyphens; optionally quoted. */
export function normalizeFontFamily(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 200) return null
  const families = value.split(',').map((f) => f.trim())
  const out: string[] = []
  for (const family of families) {
    const m = /^(["']?)([a-zA-Z0-9][a-zA-Z0-9 -]{0,60})\1$/.exec(family)
    if (!m) return null
    const name = m[2]!.replace(/\s+/g, ' ')
    out.push(/\s/.test(name) ? `'${name}'` : name)
  }
  return out.length ? out.join(', ') : null
}

const ALIGN = new Set(['left', 'center', 'right', 'justify'])

/** Allowed properties and their validators. */
const PROPERTIES: Readonly<Record<string, (value: string) => string | null>> = {
  'text-align': (v) => (ALIGN.has(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null),
  color: normalizeColor,
  'background-color': normalizeColor,
  'font-family': normalizeFontFamily,
  'font-size': (v) => normalizeLength(v, ['px', 'pt', 'em', 'rem', '%'], 400),
  'margin-left': (v) => normalizeLength(v, ['em', 'rem', 'px'], 1000),
}

/** True when a property may appear in typed styles. */
export function isAllowedStyleProperty(property: string): boolean {
  return Object.hasOwn(PROPERTIES, property)
}

/**
 * Validates typed style declarations. Unknown properties throw (a spec bug);
 * invalid values are dropped. Returns `[property, value]` pairs.
 */
export function safeStyleDecls(decls: StyleDecls): [string, string][] {
  const out: [string, string][] = []
  for (const [property, raw] of Object.entries(decls)) {
    if (raw === null || raw === undefined || raw === '') continue
    const validate = Object.hasOwn(PROPERTIES, property) ? PROPERTIES[property] : undefined
    if (!validate) throw new RangeError(`Style property "${property}" is not allowed`)
    const value = validate(String(raw))
    if (value !== null) out.push([property, value])
  }
  return out
}

/** Serialized `style` attribute value (empty string when nothing is left). */
export function styleToString(decls: StyleDecls): string {
  return safeStyleDecls(decls)
    .map(([p, v]) => `${p}: ${v}`)
    .join('; ')
}

/**
 * Adds typed style declarations to the outer element of a `toHTML` spec
 * (merging with an existing `style` object). Used by plugins that decorate
 * other nodes, e.g. text alignment on paragraphs.
 */
export function withStyle<S extends string | readonly unknown[]>(spec: S, decls: StyleDecls): S {
  if (
    typeof spec === 'string' ||
    !Object.values(decls).some((v) => v !== null && v !== undefined && v !== '')
  ) {
    return spec
  }
  const [tag, ...rest] = spec as readonly unknown[]
  const first = rest[0]
  if (first !== undefined && first !== 0 && typeof first === 'object' && !Array.isArray(first)) {
    const attrs = first as Record<string, unknown>
    const style = { ...((attrs['style'] as StyleDecls | undefined) ?? {}), ...decls }
    return [tag, { ...attrs, style }, ...rest.slice(1)] as unknown as S
  }
  return [tag, { style: decls }, ...rest] as unknown as S
}
