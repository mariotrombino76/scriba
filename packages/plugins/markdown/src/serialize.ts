import type { Mark, Node } from '@scriba/core'

/**
 * Document → Markdown (CommonMark + GFM tables and strikethrough).
 * What Markdown cannot express is dropped: underline, colors, fonts,
 * alignment, cell spans and widths (merged cells become empty cells).
 */
export function serializeMarkdown(doc: Node): string {
  return (
    blocks(doc)
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

/** Marks in a fixed nesting order (outermost first). */
const MARK_ORDER = ['link', 'bold', 'italic', 'strike', 'code'] as const
type MdMark = (typeof MARK_ORDER)[number]

const DELIMS: Record<Exclude<MdMark, 'link' | 'code'>, string> = {
  bold: '**',
  italic: '*',
  strike: '~~',
}

/** Characters that would turn into Markdown syntax if left as they are. */
function escapeText(text: string): string {
  return text.replace(/[\\`*_[\]~<>|]/g, '\\$&')
}

/** Line-start characters that would start a block (heading, quote, list). */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)(#{1,6}|>|[-+*])(\s|$)/, '$1\\$2$3')
    .replace(/^(\s*)(\d{1,9})([.)])(\s|$)/, '$1$2\\$3$4')
}

function mdMarks(marks: readonly Mark[]): Map<MdMark, Mark> {
  const out = new Map<MdMark, Mark>()
  for (const m of marks)
    if ((MARK_ORDER as readonly string[]).includes(m.type.name)) out.set(m.type.name as MdMark, m)
  return out
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length))
  const fence = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

function linkTarget(href: string): string {
  // spaces and parentheses would end the link
  return href.replace(/[\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** Inline content of a textblock as Markdown. */
function inline(block: Node): string {
  let out = ''
  let open: MdMark[] = []
  let openLink: Mark | null = null
  const closeFrom = (i: number) => {
    for (let j = open.length - 1; j >= i; j--) {
      const name = open[j]!
      if (name === 'link') out += `](${linkTarget(openLink!.attrs['href'] as string)})`
      else if (name !== 'code') out += DELIMS[name]
    }
    open = open.slice(0, i)
  }
  block.forEach((child) => {
    const marks = mdMarks(child.marks)
    // close what ends here (and everything opened after it)
    let keep = 0
    while (
      keep < open.length &&
      marks.has(open[keep]!) &&
      (open[keep] !== 'link' || marks.get('link')!.eq(openLink!))
    )
      keep++
    closeFrom(keep)
    if (child.isText) {
      const code = marks.has('code')
      let text = child.text
      // spaces at the edges stay outside the delimiters ("**a **" is not bold in Markdown)
      const lead = code ? '' : (/^\s*/.exec(text)?.[0] ?? '')
      const trail = code ? '' : (/\s*$/.exec(text.slice(lead.length))?.[0] ?? '')
      text = text.slice(lead.length, text.length - trail.length)
      out += lead
      for (const name of MARK_ORDER) {
        if (!marks.has(name) || open.includes(name) || name === 'code' || !text) continue
        if (name === 'link') {
          openLink = marks.get('link')!
          out += '['
        } else out += DELIMS[name]
        open.push(name)
      }
      out += code ? codeSpan(text) : escapeText(text)
      if (trail) {
        closeFrom(0)
        out += trail
      }
    } else if (child.type.name === 'hard_break') {
      closeFrom(0)
      out += '\\\n'
    } else if (child.type.name === 'image') {
      const alt = escapeText((child.attrs['alt'] as string) ?? '')
      out += `![${alt}](${linkTarget(child.attrs['src'] as string)})`
    } else {
      // other inline leaves (e.g. mentions): their plain text
      const leafText = child.type.spec.leafText
      if (leafText) out += escapeText(leafText(child))
    }
  })
  closeFrom(0)
  return out
    .split('\n')
    .map((line) => escapeLineStart(line))
    .join('\n')
}

/** Prefixes every line (quotes, list item continuation). */
function indent(text: string, first: string, rest: string): string {
  return text
    .split('\n')
    .map((line, i) => (i === 0 ? first : line ? rest : rest.trimEnd()) + line)
    .join('\n')
}

function blocks(parent: Node): string {
  const parts: string[] = []
  parent.forEach((node) => parts.push(block(node)))
  return parts.join('\n\n')
}

function block(node: Node): string {
  switch (node.type.name) {
    case 'paragraph':
      return inline(node)
    case 'heading':
      return `${'#'.repeat(node.attrs['level'] as number)} ${inline(node)}`
    case 'blockquote':
      return indent(blocks(node), '> ', '> ')
    case 'code_block': {
      const text = node.textContent
      const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((r) => r.length))
      const fence = '`'.repeat(longest + 1)
      const lang = (node.attrs['language'] as string | null) ?? ''
      return `${fence}${lang}\n${text}\n${fence}`
    }
    case 'bullet_list':
    case 'ordered_list':
      return list(node)
    case 'table':
      return table(node)
    case 'horizontal_rule':
    case 'page_break': // Markdown has no page break: a line
      return '---'
    default:
      // unknown blocks: their text content (never lost); atoms: their leafText
      if (node.isAtom && node.type.spec.leafText)
        return escapeLineStart(escapeText(node.type.spec.leafText(node)))
      return node.isTextblock ? inline(node) : blocks(node)
  }
}

function list(node: Node): string {
  const ordered = node.type.name === 'ordered_list'
  const start = ordered ? ((node.attrs['start'] as number) ?? 1) : 0
  // tight (no blank lines) when every item is one paragraph, optionally followed by sub-lists
  let tight = true
  node.forEach((item) =>
    item.forEach((child, _o, i) => {
      if (i > 0 && child.type.name !== 'bullet_list' && child.type.name !== 'ordered_list')
        tight = false
    }),
  )
  const items: string[] = []
  node.forEach((item, _o, i) => {
    const marker = ordered ? `${start + i}. ` : '- '
    const parts: string[] = []
    item.forEach((child) => parts.push(block(child)))
    items.push(indent(parts.join(tight ? '\n' : '\n\n'), marker, ' '.repeat(marker.length)))
  })
  return items.join(tight ? '\n' : '\n\n')
}

/** GFM pipe table: the first row is the header; spans are filled with empty cells. */
function table(node: Node): string {
  const grid: string[][] = []
  const taken = new Set<string>()
  node.forEach((row, _o, r) => {
    grid[r] ??= []
    let c = 0
    row.forEach((cell) => {
      while (taken.has(`${r},${c}`)) c++
      const text = cellText(cell)
      const colspan = (cell.attrs['colspan'] as number) ?? 1
      const rowspan = (cell.attrs['rowspan'] as number) ?? 1
      for (let dr = 0; dr < rowspan; dr++)
        for (let dc = 0; dc < colspan; dc++) {
          taken.add(`${r + dr},${c + dc}`)
          ;(grid[r + dr] ??= [])[c + dc] = dr === 0 && dc === 0 ? text : ''
        }
      c += colspan
    })
  })
  const width = Math.max(1, ...grid.map((row) => row.length))
  const line = (row: string[]) =>
    `| ${Array.from({ length: width }, (_v, i) => row[i] ?? '').join(' | ')} |`
  const out = [line(grid[0] ?? []), `|${' --- |'.repeat(width)}`]
  for (const row of grid.slice(1)) out.push(line(row))
  return out.join('\n')
}

/** A cell on one line: its blocks joined by <br>-like spaces, pipes escaped. */
function cellText(cell: Node): string {
  const parts: string[] = []
  cell.forEach((b) => parts.push(b.isTextblock ? inline(b).replace(/\\\n/g, ' ') : b.textContent))
  return parts.join(' ').replace(/\n/g, ' ')
}
