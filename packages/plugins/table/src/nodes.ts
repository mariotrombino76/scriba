import {
  BORDER_STYLES,
  normalizeColor,
  styleValue,
  type DOMLike,
  type DOMLikeElement,
  type HTMLSpec,
  type Node,
  type NodeSpec,
  type StyleDecls,
} from '@scriba/core'

export const MAX_SPAN = 100
export const MIN_COL_WIDTH = 24
export const MAX_COL_WIDTH = 2000
export const MAX_BORDER_WIDTH = 10
export const MAX_CAPTION_LENGTH = 500

export type BorderStyle = (typeof BORDER_STYLES)[number]
export type VerticalAlign = 'top' | 'middle' | 'bottom'
export type TableAlign = 'center' | 'right'

const VALIGNS: readonly string[] = ['top', 'middle', 'bottom']

const span = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_SPAN
/** Column widths of a cell (one per spanned column, 0 = unset). */
const widths = (v: unknown) =>
  v === null ||
  (Array.isArray(v) &&
    v.length >= 1 &&
    v.length <= MAX_SPAN &&
    v.every((w) => w === 0 || (Number.isInteger(w) && w >= MIN_COL_WIDTH && w <= MAX_COL_WIDTH)))
const color = (v: unknown) => v === null || (typeof v === 'string' && normalizeColor(v) === v)
const oneOf = (list: readonly string[]) => (v: unknown) =>
  v === null || (typeof v === 'string' && list.includes(v))
const borderWidth = (v: unknown) =>
  v === null || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_BORDER_WIDTH)

/** Typed border attributes shared by tables and cells. */
const borderAttrs = {
  borderWidth: { default: null, validate: borderWidth },
  borderStyle: { default: null, validate: oneOf(BORDER_STYLES) },
  borderColor: { default: null, validate: color },
}

function readSpan(value: string | null): number {
  const n = value ? Number.parseInt(value, 10) : 1
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_SPAN) : 1
}

function readWidths(el: DOMLikeElement, colspan: number): number[] | null {
  const data = el.getAttribute('data-colwidth')
  const list = data
    ? data.split(',').map((w) => Number.parseInt(w, 10))
    : el.getAttribute('width') && colspan === 1
      ? [Number.parseInt(el.getAttribute('width')!, 10)]
      : null
  if (!list || list.length !== colspan) return null
  const clean = list.map((w) =>
    Number.isInteger(w) && w >= MIN_COL_WIDTH ? Math.min(w, MAX_COL_WIDTH) : 0,
  )
  return clean.some((w) => w) ? clean : null
}

/** A border width in px (Word writes points: 1pt ≈ 1.33px; a hairline stays visible as 1px). */
function readPx(value: string | null): number | null {
  const m = value ? /^(\d{0,3}(?:\.\d{1,3})?)(px|pt)?$/.exec(value.trim()) : null
  if (!m || !m[1])
    return value === 'thin' ? 1 : value === 'medium' ? 3 : value === 'thick' ? 5 : null
  const n = Number(m[1]) * (m[2] === 'pt' ? 4 / 3 : 1)
  return Math.min(n > 0 ? Math.max(1, Math.round(n)) : 0, MAX_BORDER_WIDTH)
}

/** Border from `border-*` styles, the `border` shorthand (Word, Google Docs) or `border="1"`. */
function readBorder(el: DOMLikeElement): Record<string, unknown> {
  let width = readPx(styleValue(el, 'border-width'))
  let style = styleValue(el, 'border-style')
  let col = styleValue(el, 'border-color')
  const shorthand = styleValue(el, 'border')
  if (shorthand && shorthand.length < 100) {
    for (const part of shorthand.split(/\s+/)) {
      if (width === null && readPx(part) !== null) width = readPx(part)
      else if (!style && (BORDER_STYLES as readonly string[]).includes(part)) style = part
      else if (!col && normalizeColor(part)) col = part
    }
  }
  const attr = el.getAttribute('border')
  if (width === null && attr !== null && el.nodeName.toLowerCase() === 'table') width = readPx(attr)
  const borderStyle = style && (BORDER_STYLES as readonly string[]).includes(style) ? style : null
  return {
    borderWidth: width,
    // a width without a style would be invisible elsewhere: solid is what was meant
    borderStyle: borderStyle ?? (width ? 'solid' : null),
    borderColor: col ? normalizeColor(col) : null,
  }
}

function borderStyleDecls(node: Node): StyleDecls {
  const width = node.attrs['borderWidth'] as number | null
  return {
    'border-width': width === null ? null : `${width}px`,
    'border-style': node.attrs['borderStyle'] as string | null,
    'border-color': node.attrs['borderColor'] as string | null,
  }
}

const cellAttrs = {
  colspan: { default: 1, validate: span },
  rowspan: { default: 1, validate: span },
  colwidth: { default: null, validate: widths },
  background: { default: null, validate: color },
  valign: { default: null, validate: oneOf(VALIGNS) },
  ...borderAttrs,
}

function cellParse(tag: 'td' | 'th') {
  return [
    {
      tag,
      getAttrs: (el: DOMLikeElement) => {
        const colspan = readSpan(el.getAttribute('colspan'))
        const bg =
          styleValue(el, 'background-color') ??
          styleValue(el, 'background') ??
          el.getAttribute('bgcolor')
        const valign = (
          styleValue(el, 'vertical-align') ??
          el.getAttribute('valign') ??
          ''
        ).toLowerCase()
        return {
          colspan,
          rowspan: readSpan(el.getAttribute('rowspan')),
          colwidth: readWidths(el, colspan),
          background: bg ? normalizeColor(bg) : null,
          valign: VALIGNS.includes(valign) ? valign : null,
          ...readBorder(el),
        }
      },
    },
  ]
}

/** Width as HTML attributes (`width`, per-column `data-colwidth`); colors and borders as typed styles. */
function cellToHTML(tag: 'td' | 'th') {
  return (node: Node): HTMLSpec => {
    const colspan = node.attrs['colspan'] as number
    const rowspan = node.attrs['rowspan'] as number
    const colwidth = node.attrs['colwidth'] as number[] | null
    const complete = colwidth && colwidth.every((w) => w > 0)
    return [
      tag,
      {
        colspan: colspan > 1 ? colspan : null,
        rowspan: rowspan > 1 ? rowspan : null,
        width: complete ? colwidth.reduce((a, b) => a + b, 0) : null,
        'data-colwidth': colwidth && colspan > 1 ? colwidth.join(',') : null,
        style: {
          'background-color': node.attrs['background'] as string | null,
          'vertical-align': node.attrs['valign'] as string | null,
          ...borderStyleDecls(node),
        },
      },
      0,
    ]
  }
}

/** Elements whose text is not visible text (never part of a caption). */
const HIDDEN = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'svg',
  'math',
  'iframe',
  'textarea',
  'title',
])

/** Plain text of an element (depth-limited), whitespace collapsed. */
function textOf(node: DOMLike, depth = 0): string {
  if (node.nodeType === 3) return node.nodeValue ?? ''
  if (depth > 20 || node.nodeType !== 1 || HIDDEN.has(node.nodeName.toLowerCase())) return ''
  let out = ''
  for (let i = 0; i < node.childNodes.length && out.length <= MAX_CAPTION_LENGTH; i++)
    out += textOf(node.childNodes[i]!, depth + 1)
  return out
}

function readCaption(el: DOMLikeElement): string | null {
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i]!
    if (child.nodeType === 1 && child.nodeName.toLowerCase() === 'caption') {
      const text = textOf(child).replace(/\s+/g, ' ').trim().slice(0, MAX_CAPTION_LENGTH)
      return text || null
    }
  }
  return null
}

function readTableAlign(el: DOMLikeElement): TableAlign | null {
  const left = styleValue(el, 'margin-left')
  const right = styleValue(el, 'margin-right')
  if (left === 'auto') return right === 'auto' ? 'center' : 'right'
  const attr = el.getAttribute('align')?.toLowerCase()
  return attr === 'center' || attr === 'right' ? attr : null
}

const caption = (v: unknown) =>
  v === null || (typeof v === 'string' && v.length >= 1 && v.length <= MAX_CAPTION_LENGTH)

/** Table nodes. Cells hold blocks; both cell kinds are isolating (editing never crosses them). */
export const tableNodes = {
  table: {
    content: 'table_row+',
    group: 'block',
    isolating: true,
    tableRole: 'table',
    attrs: {
      caption: { default: null, validate: caption },
      align: { default: null, validate: oneOf(['center', 'right']) },
      ...borderAttrs,
    },
    parseHTML: [
      {
        tag: 'table',
        getAttrs: (el: DOMLikeElement) => ({
          caption: readCaption(el),
          align: readTableAlign(el),
          ...readBorder(el),
        }),
      },
    ],
    toHTML: (node: Node): HTMLSpec => {
      const align = node.attrs['align'] as TableAlign | null
      const text = node.attrs['caption'] as string | null
      const attrs = {
        style: {
          'margin-left': align ? 'auto' : null,
          'margin-right': align === 'center' ? 'auto' : null,
          ...borderStyleDecls(node),
        },
      }
      return text
        ? ['table', attrs, ['caption', text], ['tbody', 0]]
        : ['table', attrs, ['tbody', 0]]
    },
  },
  table_row: {
    content: '(table_cell | table_header)+',
    tableRole: 'row',
    parseHTML: [{ tag: 'tr' }],
    toHTML: (): HTMLSpec => ['tr', 0],
  },
  table_cell: {
    content: 'block+',
    isolating: true,
    tableRole: 'cell',
    attrs: cellAttrs,
    parseHTML: cellParse('td'),
    toHTML: cellToHTML('td'),
  },
  table_header: {
    content: 'block+',
    isolating: true,
    tableRole: 'header_cell',
    attrs: cellAttrs,
    parseHTML: cellParse('th'),
    toHTML: cellToHTML('th'),
  },
} satisfies Record<string, NodeSpec>

export function isCell(node: Node): boolean {
  const role = node.type.spec['tableRole']
  return role === 'cell' || role === 'header_cell'
}
