import type { HTMLAttrs, HTMLSpec } from './types.js'

/** The attributes object of a spec `[tag, attrs?, …]`, if it has one. */
function attrsOf(rest: readonly unknown[]): HTMLAttrs | null {
  const first = rest[0]
  return first !== undefined && first !== 0 && typeof first === 'object' && !Array.isArray(first)
    ? (first as HTMLAttrs)
    : null
}

/**
 * Sets `name="value"` on the outer element of a `toHTML` spec (null: the spec
 * as it is). Used by plugins that decorate other nodes (ids, direction…). The
 * serializer still checks every attribute.
 */
export function withAttr(spec: HTMLSpec, name: string, value: string | null): HTMLSpec {
  if (value === null || typeof spec === 'string') return spec
  const [tag, ...rest] = spec
  const attrs = attrsOf(rest)
  if (attrs) return [tag, { ...attrs, [name]: value }, ...rest.slice(1)]
  return [tag, { [name]: value }, ...rest]
}

/** Adds a class to the outer element of a `toHTML` spec, after any it already has. */
export function withClass(spec: HTMLSpec, name: string | null): HTMLSpec {
  if (name === null || typeof spec === 'string') return spec
  const current = attrsOf(spec.slice(1))?.['class']
  return withAttr(
    spec,
    'class',
    typeof current === 'string' && current ? `${current} ${name}` : name,
  )
}
