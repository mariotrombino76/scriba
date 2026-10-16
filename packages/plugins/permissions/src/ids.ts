import type { HTMLAttrs, HTMLSpec, Node, NodeSpec, ParseRule } from '@scriba/core'

/** Name of the block id attribute in the model. */
export const BLOCK_ID = 'blockId'

/** Block types that get an id by default (those present in the schema). */
export const DEFAULT_BLOCK_TYPES: readonly string[] = [
  'paragraph',
  'heading',
  'blockquote',
  'bullet_list',
  'ordered_list',
  'list_item',
  'code_block',
  'table',
]

/** An id: 1–100 letters, digits, `_`, `-`, `.` or `:`. */
export function isBlockId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(value)
}

/** The id of a block, or null. */
export function blockIdOf(node: Node): string | null {
  const id = node.attrs[BLOCK_ID]
  return isBlockId(id) ? id : null
}

/** Adds `name="value"` to the outer element of a `toHTML` spec. */
function withAttr(spec: HTMLSpec, name: string, value: string | null): HTMLSpec {
  if (value === null || typeof spec === 'string') return spec
  const [tag, ...rest] = spec
  const first = rest[0]
  if (first !== undefined && first !== 0 && typeof first === 'object' && !Array.isArray(first)) {
    return [tag, { ...(first as HTMLAttrs), [name]: value }, ...rest.slice(1)]
  }
  return [tag, { [name]: value }, ...rest]
}

/**
 * Gives blocks an optional id (`data-block-id` in HTML), so that
 * `blockPermissions` and `checkBlockEdits` can tell which ones are protected.
 * Ids are yours to assign (in the HTML you load); blocks without one are
 * always editable.
 */
export function withBlockIds<N extends Record<string, NodeSpec>>(
  nodes: N,
  names: readonly string[] = DEFAULT_BLOCK_TYPES,
): N {
  const out: Record<string, NodeSpec> = { ...nodes }
  for (const name of names) {
    const spec = nodes[name]
    if (!spec) continue
    const toHTML = spec.toHTML
    out[name] = {
      ...spec,
      attrs: {
        ...spec.attrs,
        [BLOCK_ID]: { default: null, validate: (v) => v === null || isBlockId(v) },
      },
      parseHTML: (spec.parseHTML ?? []).map((rule): ParseRule => ({
        ...rule,
        getAttrs: (el) => {
          const base = rule.getAttrs ? rule.getAttrs(el) : null
          if (base === false) return false
          const id = el.getAttribute('data-block-id')
          return { ...base, [BLOCK_ID]: isBlockId(id) ? id : null }
        },
      })),
      ...(toHTML
        ? {
            toHTML: (node: Node): HTMLSpec =>
              withAttr(toHTML(node), 'data-block-id', blockIdOf(node)),
          }
        : {}),
    }
  }
  return out as N
}
