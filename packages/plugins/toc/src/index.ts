import {
  Fragment,
  Plugin,
  Selection,
  insertContent,
  type Command,
  type DOMLike,
  type DOMLikeElement,
  type HTMLSpec,
  type Node,
  type NodeSpec,
  type Schema,
  type Transaction,
} from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import type { ToolbarButton } from '@scriba-editor/ui'
import { ANCHOR_PREFIX, anchorName, isAnchorName } from '@scriba-editor/plugin-link'

/**
 * Table of contents, like TinyMCE's: a list of the document's headings, each
 * a link to the heading's anchor, kept up to date by `tableOfContents()`.
 * HTML: `<ol class="scriba-toc"><li><a href="#anchor-intro">Intro</a><ol>…</ol></li></ol>`
 * (only tags, classes and ids already allowed: lists, links, `anchor-` ids).
 * Needs `withAnchors` (from `@scriba-editor/plugin-link`) on headings.
 */
export const TOC_CLASS = 'scriba-toc'
export const MAX_TOC_ENTRIES = 500
export const MAX_TOC_TEXT = 200

export interface TocEntry {
  /** Heading level, 1–6. */
  readonly level: number
  readonly text: string
  /** The heading's anchor name (its id is `anchor-<name>`). */
  readonly anchor: string
}

const isText = (v: unknown) =>
  typeof v === 'string' &&
  v.length <= MAX_TOC_TEXT &&
  ![...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)

function isEntry(v: unknown): v is TocEntry {
  if (!v || typeof v !== 'object') return false
  const e = v as Record<string, unknown>
  return (
    Object.keys(e).length === 3 &&
    Number.isInteger(e['level']) &&
    (e['level'] as number) >= 1 &&
    (e['level'] as number) <= 6 &&
    isText(e['text']) &&
    isAnchorName(e['anchor'])
  )
}

const isEntries = (v: unknown): v is readonly TocEntry[] =>
  Array.isArray(v) && v.length <= MAX_TOC_ENTRIES && v.every(isEntry)

/** Text of an element, spaces collapsed, within the limit. */
function textOf(node: DOMLike): string {
  let out = ''
  const walk = (n: DOMLike, depth: number) => {
    if (depth > 20 || out.length > MAX_TOC_TEXT * 2) return
    if (n.nodeType === 3) out += n.nodeValue ?? ''
    else for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]!, depth + 1)
  }
  walk(node, 0)
  return [...out.replace(/\s+/g, ' ').trim()]
    .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
    .join('')
    .slice(0, MAX_TOC_TEXT)
}

const elements = (el: DOMLike, tag: string): DOMLikeElement[] => {
  const out: DOMLikeElement[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i] as DOMLike & Partial<DOMLikeElement>
    if (child.nodeType === 1 && child.nodeName.toLowerCase() === tag && child.getAttribute)
      out.push(child as DOMLikeElement)
  }
  return out
}

/** The entries of a saved list (nested `<ol>`s give the levels; at most 6 deep). */
function readEntries(list: DOMLikeElement, level = 1, out: TocEntry[] = []): TocEntry[] {
  if (level > 6) return out
  for (const li of elements(list, 'li')) {
    if (out.length >= MAX_TOC_ENTRIES) break
    const link = elements(li, 'a')[0]
    const href = link?.getAttribute('href') ?? ''
    const anchor = href.startsWith(`#${ANCHOR_PREFIX}`) ? href.slice(ANCHOR_PREFIX.length + 1) : ''
    const text = link ? textOf(link) : ''
    if (isAnchorName(anchor) && text) out.push({ level, text, anchor })
    for (const sub of elements(li, 'ol')) readEntries(sub, level + 1, out)
  }
  return out
}

/** Nested lists from the flat entries (a jump of levels nests one list deeper). */
function listSpec(entries: readonly TocEntry[]): HTMLSpec {
  const build = (from: number, level: number): [HTMLSpec[], number] => {
    const items: HTMLSpec[] = []
    let i = from
    while (i < entries.length && entries[i]!.level >= level) {
      const entry = entries[i]!
      const link: HTMLSpec = ['a', { href: `#${ANCHOR_PREFIX}${entry.anchor}` }, entry.text]
      i++
      if (i < entries.length && entries[i]!.level > entry.level) {
        const [children, next] = build(i, entry.level + 1)
        items.push(['li', link, ['ol', ...children]])
        i = next
      } else items.push(['li', link])
    }
    return [items, i]
  }
  const [items] = build(0, Math.min(...entries.map((e) => e.level), 6))
  return ['ol', { class: TOC_CLASS }, ...items] as unknown as HTMLSpec
}

export const tocNodes = {
  table_of_contents: {
    group: 'block',
    atom: true,
    attrs: { entries: { default: [], validate: isEntries } },
    leafText: (node) =>
      (node.attrs['entries'] as readonly TocEntry[])
        .map((e) => `${'  '.repeat(e.level - 1)}${e.text}`)
        .join('\n'),
    parseHTML: [
      {
        tag: 'ol',
        priority: 60,
        getAttrs: (el) =>
          (el.getAttribute('class') ?? '').split(/\s+/).includes(TOC_CLASS)
            ? { entries: Object.freeze(readEntries(el).map((e) => Object.freeze(e))) }
            : false,
      },
    ],
    toHTML: (node) => {
      const entries = node.attrs['entries'] as readonly TocEntry[]
      // an empty index still has its place (it fills up when headings are added)
      return entries.length ? listSpec(entries) : ['ol', { class: TOC_CLASS }]
    },
  },
} satisfies Record<string, NodeSpec>

/**
 * Adds to `tr` what keeps the indexes up to date: headings without an anchor
 * get one (from their text, unique in the document), and every index lists
 * the headings in order. Returns whether anything changed.
 */
export function syncTableOfContents(tr: Transaction, schema: Schema): boolean {
  const toc = schema.nodes['table_of_contents']
  const heading = schema.nodes['heading']
  if (!toc || !heading?.spec.attrs || !('anchor' in heading.spec.attrs)) return false
  const doc = tr.doc
  const indexes: number[] = []
  doc.descendants((node, pos) => {
    if (node.type === toc) indexes.push(pos)
    return !node.isTextblock
  })
  if (!indexes.length) return false

  const used = new Set<string>()
  doc.descendants((node) => {
    const a = node.attrs['anchor']
    if (typeof a === 'string') used.add(a)
    return !node.isTextblock
  })
  const entries: TocEntry[] = []
  let changed = false
  doc.descendants((node, pos) => {
    if (node.type !== heading) return !node.isTextblock
    const text = node.textContent.replace(/\s+/g, ' ').trim().slice(0, MAX_TOC_TEXT)
    if (!text || entries.length >= MAX_TOC_ENTRIES) return false
    let anchor = node.attrs['anchor'] as string | null
    if (!anchor) {
      const base = anchorName(text) || 'titolo'
      anchor = base
      for (let i = 2; used.has(anchor); i++) anchor = `${base.slice(0, 55)}-${i}`
      used.add(anchor)
      tr.setNodeAttrs(pos, { anchor })
      changed = true
    }
    entries.push(Object.freeze({ level: node.attrs['level'] as number, text, anchor }))
    return false
  })
  const frozen = Object.freeze(entries)
  for (const pos of indexes) {
    const current = tr.doc.nodeAt(pos)!.attrs['entries'] as readonly TocEntry[]
    const same =
      current.length === frozen.length &&
      current.every(
        (e, i) =>
          e.level === frozen[i]!.level &&
          e.text === frozen[i]!.text &&
          e.anchor === frozen[i]!.anchor,
      )
    if (!same) {
      tr.setNodeAttrs(pos, { entries: frozen })
      changed = true
    }
  }
  return changed
}

/** Keeps every table of contents up to date with the headings. */
export function tableOfContents(): Plugin {
  return new Plugin({
    appendTransaction(trs, _old, state) {
      if (!trs.some((tr) => tr.docChanged)) return null
      const tr = state.tr
      return syncTableOfContents(tr, state.schema) ? tr : null
    },
  })
}

/** Inserts a table of contents at the cursor (filled right away). */
export function insertTableOfContents(schema: Schema): Command {
  const type = schema.nodes['table_of_contents']
  if (!type) throw new RangeError('The schema has no table of contents (add tocNodes)')
  return (state, dispatch) => {
    const { $from, from, to } = state.selection
    if ($from.parent.type.spec.code) return false
    if (!dispatch) return true
    const tr = state.tr
    const end = insertContent(tr, from, to, Fragment.from(type.create()))
    if (end === null) return false
    syncTableOfContents(tr, schema)
    const paragraph = schema.nodes['paragraph']
    const $end = tr.doc.resolve(Math.min(tr.mapping.map(end), tr.doc.content.size))
    if (!$end.nodeAfter?.isTextblock && paragraph && $end.parent.type.canContain(paragraph))
      tr.insert($end.pos, paragraph.create())
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min($end.pos + 1, tr.doc.content.size)), 1))
    dispatch(tr.scrollIntoView())
    return true
  }
}

/** Insert ▸ Table of contents. */
export function tocToolbarItem(schema: Schema): ToolbarButton {
  return {
    type: 'button',
    id: 'toc',
    icon: 'toc',
    label: (t) => t('toc.insert'),
    command: insertTableOfContents(schema),
  }
}

/** Slash menu entry ("/indice"). */
export function tocSlashItem(schema: Schema): {
  id: string
  label: (t: Translate) => string
  keywords: string[]
  icon: 'toc'
  command: Command
} {
  return {
    id: 'toc',
    label: (t) => t('toc.insert'),
    keywords: ['indice', 'sommario', 'toc', 'contents', 'titoli'],
    icon: 'toc',
    command: insertTableOfContents(schema),
  }
}

/** The headings the index would list (for a side panel, an outline…). */
export function tocEntries(doc: Node): readonly TocEntry[] {
  let found: readonly TocEntry[] = []
  doc.descendants((node) => {
    if (node.type.name === 'table_of_contents') found = node.attrs['entries'] as readonly TocEntry[]
    return found.length === 0 && !node.isTextblock
  })
  return found
}
