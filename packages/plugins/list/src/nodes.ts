import {
  BULLET_STYLES,
  styleValue,
  withStyle,
  type DOMLikeElement,
  type HTMLSpec,
  type NodeSpec,
} from '@scriba-editor/core'

const MAX_START = 1_000_000

/** Numbering of an ordered list (the `type` of `<ol>`). */
export const NUMBERINGS = ['1', 'a', 'A', 'i', 'I'] as const
export type Numbering = (typeof NUMBERINGS)[number]
export type BulletStyle = (typeof BULLET_STYLES)[number]

/** Word and others write numbering as a style. */
const NUMBERING_STYLES: Record<string, Numbering> = {
  decimal: '1',
  'lower-alpha': 'a',
  'lower-latin': 'a',
  'upper-alpha': 'A',
  'upper-latin': 'A',
  'lower-roman': 'i',
  'upper-roman': 'I',
}

function readNumbering(el: DOMLikeElement): Numbering | null {
  const type = el.getAttribute('type')
  if (type && (NUMBERINGS as readonly string[]).includes(type) && type !== '1')
    return type as Numbering
  const style = styleValue(el, 'list-style-type')?.toLowerCase()
  const fromStyle = style ? NUMBERING_STYLES[style] : undefined
  return fromStyle && fromStyle !== '1' ? fromStyle : null
}

function readBullet(el: DOMLikeElement): BulletStyle | null {
  const style = styleValue(el, 'list-style-type')?.toLowerCase()
  // disc is the default: kept as null
  return style === 'circle' || style === 'square' ? style : null
}

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
    attrs: {
      bullet: {
        default: null,
        validate: (v) => v === null || (BULLET_STYLES as readonly unknown[]).includes(v),
      },
    },
    parseHTML: [{ tag: 'ul', getAttrs: (el) => ({ bullet: readBullet(el) }) }],
    toHTML: (node): HTMLSpec =>
      withStyle(['ul', 0], { 'list-style-type': node.attrs['bullet'] as string | null }),
  },
  ordered_list: {
    content: 'list_item+',
    group: 'block',
    attrs: {
      start: {
        default: 1,
        validate: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_START,
      },
      numbering: {
        default: null,
        validate: (v) => v === null || (NUMBERINGS as readonly unknown[]).includes(v),
      },
    },
    parseHTML: [
      {
        tag: 'ol',
        getAttrs: (el) => ({
          start: readStart(el.getAttribute('start')),
          numbering: readNumbering(el),
        }),
      },
    ],
    toHTML: (node) => {
      const start = node.attrs['start'] as number
      return [
        'ol',
        { start: start === 1 ? null : start, type: node.attrs['numbering'] as string | null },
        0,
      ]
    },
  },
  list_item: {
    content: 'paragraph block*',
    defining: true,
    parseHTML: [{ tag: 'li' }],
    toHTML: () => ['li', 0],
  },
} satisfies Record<string, NodeSpec>
