import { Fragment, Selection, type Command, type EditorState, type Node } from '@scriba-editor/core'
import { selectedRect } from './commands.js'
import type { TableGrid } from './grid.js'

/*
 * Sorting a table by a column (TinyMCE's advanced tables).
 *
 * Simple picture: the rows are cards; each card is read at the chosen column
 * and the cards are put in order. The header rows at the top stay where they
 * are, and each row moves whole, with its formatting.
 */

export type SortOrder = 'asc' | 'desc'

export interface SortOptions {
  /**
   * Language of the values: decimal separator, alphabetical order. Default: the
   * `lang` of the editor or of the page (the content's language), else the browser's.
   */
  locale?: string
}

/** The content's language: the nearest `lang` around the editing area. */
function contentLocale(view: unknown): string | undefined {
  const dom = (view as { dom?: Element } | undefined)?.dom
  return dom?.closest?.('[lang]')?.getAttribute('lang') || undefined
}

/** Number of header rows at the top: rows made only of header cells. */
function headerRows(table: Node): number {
  let n = 0
  while (n < table.childCount) {
    let all = true
    table.child(n).forEach((cell) => {
      if (cell.type.name !== 'table_header') all = false
    })
    if (!all) break
    n++
  }
  return n
}

/**
 * Rows `from…height` can be reordered when no cell spans several of them, and
 * none from above reaches into them.
 */
function movableRows(grid: TableGrid, from: number): boolean {
  return grid.cells.every((c) => c.rowspan === 1 || c.row + c.rowspan <= from)
}

/** Separators and collator per locale (built once: sorting compares many pairs). */
const formats = new Map<string, { group: string; decimal: string; collator: Intl.Collator }>()
function formatOf(locale?: string) {
  const key = locale ?? ''
  let f = formats.get(key)
  if (!f) {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
    f = {
      group: parts.find((p) => p.type === 'group')?.value ?? ',',
      decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
      collator: new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }),
    }
    formats.set(key, f)
  }
  return f
}

/** A value read as a number in `locale` (1.234,5 in Italian; 1,234.5 in English), or null. */
export function parseLocaleNumber(text: string, locale?: string): number | null {
  const { group, decimal } = formatOf(locale)
  // spaces (\s includes the no-break ones), currency and percent signs around the number are ignored
  const raw = text.replace(/\s/g, '').replace(/^[^\d\-+.,]+|[^\d.,]+$/g, '')
  if (!/^[-+]?[\d.,]+$/.test(raw)) return null
  const plain = raw.split(group).join('').replace(decimal, '.')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(plain)) return null
  const value = Number(plain)
  return Number.isFinite(value) ? value : null
}

/**
 * Compares two cell texts: numbers by value when both are numbers, otherwise
 * alphabetically (ignoring case and accents, "2" before "10"). Empty texts
 * are not compared here (they always go last).
 */
export function compareCellText(a: string, b: string, locale?: string): number {
  const x = parseLocaleNumber(a, locale)
  const y = parseLocaleNumber(b, locale)
  if (x !== null && y !== null) return x - y
  return formatOf(locale).collator.compare(a, b)
}

/**
 * Sorts the rows of the table around the selection by the column of the
 * selected cell, ascending or descending. Header rows at the top stay; empty
 * cells go last in both orders; equal values keep their order. Not possible
 * when a cell spans several rows to sort (merged cells). One undo step.
 */
export function sortTable(order: SortOrder, options: SortOptions = {}): Command {
  return (state: EditorState, dispatch, view) => {
    const ctx = selectedRect(state)
    if (!ctx) return false
    const { table, grid } = ctx
    const first = headerRows(table)
    if (table.childCount - first < 2 || !movableRows(grid, first)) return false
    if (!dispatch) return true

    const locale = options.locale ?? contentLocale(view)
    const col = ctx.cell.col
    const rows: { row: Node; index: number; text: string }[] = []
    for (let r = first; r < table.childCount; r++) {
      const cell = grid.at(r, col)
      // a cell merged across columns is read once, by every column it covers
      rows.push({ row: table.child(r), index: r, text: cell ? cell.node.textContent.trim() : '' })
    }
    const sign = order === 'asc' ? 1 : -1
    const sorted = [...rows].sort((a, b) => {
      if (!a.text || !b.text) return (a.text ? 0 : 1) - (b.text ? 0 : 1)
      return sign * compareCellText(a.text, b.text, locale)
    })
    if (sorted.every((r, i) => r === rows[i])) return true // already in order

    // replace the rows below the header (cell content and formatting move with them)
    let start = ctx.pos + 1
    for (let r = 0; r < first; r++) start += table.child(r).nodeSize
    const end = ctx.pos + table.nodeSize - 1
    const tr = state.tr.replaceWith(start, end, Fragment.from(sorted.map((r) => r.row)))

    // the cursor follows its row
    const head = state.selection.head
    let at = start
    let place: number | null = null
    let oldStart = start
    const oldStarts = rows.map((r) => {
      const s = oldStart
      oldStart += r.row.nodeSize
      return s
    })
    for (const r of sorted) {
      const from = oldStarts[r.index - first]!
      if (head >= from && head < from + r.row.nodeSize) place = at + (head - from)
      at += r.row.nodeSize
    }
    if (place !== null) tr.setSelection(Selection.near(tr.doc.resolve(place)))
    dispatch(tr.scrollIntoView())
    return true
  }
}
