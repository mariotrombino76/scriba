import { isInNode, toggleWrap, type Command, type NodeSpec, type Schema } from '@scriba/core'
import type { ToolbarControl } from '@scriba/ui'

/** Node specs to add to a schema. Requires a `block` group. */
export const blockquoteNodes = {
  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    parseHTML: [{ tag: 'blockquote' }],
    toHTML: () => ['blockquote', 0],
  },
} satisfies Record<string, NodeSpec>

function quoteType(schema: Schema) {
  const type = schema.nodes['blockquote']
  if (!type) throw new RangeError('The schema has no "blockquote" node (add blockquoteNodes)')
  return type
}

/** Wraps the selected blocks in a quote, or takes them out of it. */
export function toggleBlockquote(schema: Schema): Command {
  return toggleWrap(quoteType(schema))
}

/** Toolbar button for the quote. */
export function blockquoteToolbarItems(schema: Schema): ToolbarControl[] {
  const type = quoteType(schema)
  return [
    {
      type: 'button',
      id: 'blockquote',
      icon: 'quote',
      label: (t) => t('block.blockquote'),
      command: toggleWrap(type),
      isActive: (state) => isInNode(state, type),
    },
  ]
}
