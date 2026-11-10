import { isInNode, toggleWrap, type Command, type NodeSpec, type Schema } from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import type { ToolbarButton } from '@scriba-editor/ui'

/** The kinds of callout (a closed list: anything else becomes "info"). */
export const CALLOUT_KINDS = ['info', 'tip', 'warning', 'danger'] as const
export type CalloutKind = (typeof CALLOUT_KINDS)[number]

export function isCalloutKind(value: unknown): value is CalloutKind {
  return typeof value === 'string' && (CALLOUT_KINDS as readonly string[]).includes(value)
}

/**
 * The callout node: a box around blocks (paragraphs, lists…) with a kind.
 * HTML: `<aside class="scriba-callout" data-callout="warning">…</aside>`;
 * only an `<aside>` with `data-callout` is read as one (a plain `<aside>`
 * from a web page keeps just its content). Its look comes from a node view
 * (e.g. `CalloutView` with `vueNodeView` in `@scriba-editor/vue`).
 */
export const calloutNodes = {
  callout: {
    group: 'block',
    content: 'block+',
    defining: true,
    attrs: { kind: { default: 'info', validate: isCalloutKind } },
    parseHTML: [
      {
        tag: 'aside',
        getAttrs: (el) => {
          const kind = el.getAttribute('data-callout')
          if (kind === null) return false
          return { kind: isCalloutKind(kind) ? kind : 'info' }
        },
      },
    ],
    toHTML: (node) => [
      'aside',
      { class: 'scriba-callout', 'data-callout': node.attrs['kind'] as string },
      0,
    ],
  },
} satisfies Record<string, NodeSpec>

/** Wraps the selected blocks in a callout of `kind`, or takes them out of one. */
export function toggleCallout(schema: Schema, kind: CalloutKind = 'info'): Command {
  const type = schema.nodes['callout']
  if (!type) throw new RangeError('The schema has no "callout" node (add calloutNodes)')
  return toggleWrap(type, { kind })
}

/** Toolbar button: callout on/off (pressed inside one). */
export function calloutToolbarItem(schema: Schema): ToolbarButton {
  const type = schema.nodes['callout']!
  return {
    type: 'button',
    id: 'callout',
    icon: 'callout',
    label: (t) => t('callout.insert'),
    command: toggleCallout(schema),
    isActive: (state) => isInNode(state, type),
  }
}

/** Slash menu entry ("/riquadro"). */
export function calloutSlashItem(schema: Schema): {
  id: string
  label: (t: Translate) => string
  keywords: string[]
  icon: 'callout'
  command: Command
} {
  return {
    id: 'callout',
    label: (t) => t('callout.insert'),
    keywords: ['callout', 'riquadro', 'nota', 'avviso', 'box', 'note'],
    icon: 'callout',
    command: toggleCallout(schema),
  }
}
