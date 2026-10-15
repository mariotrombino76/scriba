import type { DOMLikeElement, HTMLSpec, Node, NodeSpec } from '@scriba/core'

export const MAX_SPAN = 100
export const MIN_COL_WIDTH = 24
export const MAX_COL_WIDTH = 2000

const span = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_SPAN
/** Column widths of a cell (one per spanned column, 0 = unset). */
const widths = (v: unknown) =>
  v === null ||
  (Array.isArray(v) &&
    v.length >= 1 &&
    v.length <= MAX_SPAN &&
    v.every((w) => w === 0 || (Number.isInteger(w) && w >= MIN_COL_WIDTH && w <= MAX_COL_WIDTH)))

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

const cellAttrs = {
  colspan: { default: 1, validate: span },
  rowspan: { default: 1, validate: span },
  colwidth: { default: null, validate: widths },
}

function cellParse(tag: 'td' | 'th') {
  return [
    {
      tag,
      getAttrs: (el: DOMLikeElement) => {
        const colspan = readSpan(el.getAttribute('colspan'))
        return {
          colspan,
          rowspan: readSpan(el.getAttribute('rowspan')),
          colwidth: readWidths(el, colspan),
        }
      },
    },
  ]
}

/** Width as HTML attributes (no inline style needed): `width` total, per-column list when spanning. */
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
      },
      0,
    ]
  }
}

/** Table nodes. Cells hold blocks; both cell kinds are isolating (editing never crosses them). */
export const tableNodes = {
  table: {
    content: 'table_row+',
    group: 'block',
    isolating: true,
    tableRole: 'table',
    parseHTML: [{ tag: 'table' }],
    toHTML: (): HTMLSpec => ['table', ['tbody', 0]],
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
