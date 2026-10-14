import type { NodeSpec } from '@scriba/core'

const MAX_START = 1_000_000

function readStart(value: string | null): number {
  const n = value === null ? 1 : Number.parseInt(value, 10)
  return Number.isInteger(n) && n >= 0 && n <= MAX_START ? n : 1
}

/**
 * Node specs for lists. `list_item` must start with a `paragraph`, so the
 * schema needs a node of that name. Lists join the `block` group.
 */
export const listNodes = {
  bullet_list: {
    content: 'list_item+',
    group: 'block',
    parseHTML: [{ tag: 'ul' }],
    toHTML: () => ['ul', 0],
  },
  ordered_list: {
    content: 'list_item+',
    group: 'block',
    attrs: {
      start: {
        default: 1,
        validate: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_START,
      },
    },
    parseHTML: [{ tag: 'ol', getAttrs: (el) => ({ start: readStart(el.getAttribute('start')) }) }],
    toHTML: (node) => {
      const start = node.attrs['start'] as number
      return ['ol', { start: start === 1 ? null : start }, 0]
    },
  },
  list_item: {
    content: 'paragraph block*',
    defining: true,
    parseHTML: [{ tag: 'li' }],
    toHTML: () => ['li', 0],
  },
} satisfies Record<string, NodeSpec>
