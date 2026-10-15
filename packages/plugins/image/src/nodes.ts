import {
  styleValue,
  type DOMLikeElement,
  type HTMLSpec,
  type NodeSpec,
  type StyleDecls,
} from '@scriba/core'

export type ImageAlign = 'left' | 'center' | 'right'
const ALIGNS: readonly string[] = ['left', 'center', 'right']
export const MIN_WIDTH = 16
export const MAX_WIDTH = 4000

function readWidth(el: DOMLikeElement): number | null {
  const attr = el.getAttribute('width')
  const style = styleValue(el, 'width')
  const raw =
    attr && /^\d+$/.test(attr.trim())
      ? attr.trim()
      : style && /^\d+(\.\d+)?px$/.test(style)
        ? style
        : null
  if (!raw) return null
  const n = Math.round(Number.parseFloat(raw))
  return n >= MIN_WIDTH && n <= MAX_WIDTH ? n : null
}

function readAlign(el: DOMLikeElement): ImageAlign | null {
  const float = styleValue(el, 'float')
  if (float === 'left' || float === 'right') return float
  if (styleValue(el, 'display') === 'block' && styleValue(el, 'margin-left') === 'auto')
    return 'center'
  const attr = el.getAttribute('align')?.toLowerCase()
  if (attr === 'left' || attr === 'right') return attr
  if (attr === 'middle' || attr === 'center') return 'center'
  return null
}

/** Typed alignment styles (only these enumerated values are allowed, §5.4). */
export function alignStyle(align: ImageAlign | null): StyleDecls {
  if (align === 'left' || align === 'right') return { float: align }
  if (align === 'center') return { display: 'block', 'margin-left': 'auto', 'margin-right': 'auto' }
  return {}
}

/**
 * The image node: inline, atomic. `src` is checked against the image URL
 * whitelist wherever the node is created (HTML, JSON, collaboration): http(s),
 * relative, or raster `data:` within the size limit; never SVG data (§5.3).
 */
export const imageNodes = {
  image: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: {
      src: { url: { kind: 'image' } },
      alt: { default: '', validate: (v) => typeof v === 'string' && v.length <= 1000 },
      width: {
        default: null,
        validate: (v) =>
          v === null ||
          (Number.isInteger(v) && (v as number) >= MIN_WIDTH && (v as number) <= MAX_WIDTH),
      },
      align: { default: null, validate: (v) => v === null || ALIGNS.includes(v as string) },
    },
    parseHTML: [
      {
        tag: 'img',
        getAttrs: (el) => ({
          src: el.getAttribute('src'),
          alt: (el.getAttribute('alt') ?? '').slice(0, 1000),
          width: readWidth(el),
          align: readAlign(el),
        }),
      },
    ],
    toHTML: (node): HTMLSpec => [
      'img',
      {
        src: node.attrs['src'] as string,
        alt: node.attrs['alt'] as string,
        width: node.attrs['width'] as number | null,
        style: alignStyle(node.attrs['align'] as ImageAlign | null),
      },
    ],
  },
} satisfies Record<string, NodeSpec>
