import { escapeAttr, escapeText, serializeHTML, type Node } from '@scriba/core'
import { serializeMarkdown } from '@scriba/plugin-markdown'
import { documentToDocx } from './docx-write.js'

/** Formats the editor saves. */
export type SaveFormat = 'html' | 'markdown' | 'text' | 'docx'

export const EXTENSIONS: Record<SaveFormat, string> = {
  html: 'html',
  markdown: 'md',
  text: 'txt',
  docx: 'docx',
}
const TYPES: Record<Exclude<SaveFormat, 'docx'>, string> = {
  html: 'text/html;charset=utf-8',
  markdown: 'text/markdown;charset=utf-8',
  text: 'text/plain;charset=utf-8',
}

/** The document's title: its first heading, else its first line (at most 80 characters). */
export function documentTitle(doc: Node, fallback: string): string {
  let title = ''
  doc.descendants((node) => {
    if (title) return false
    if (node.type.name === 'heading' || (node.isTextblock && node.textContent.trim()))
      title = node.textContent.replace(/\s+/g, ' ').trim()
    return !title
  })
  return title.slice(0, 80) || fallback
}

/** A safe file name from a title ("Verbale 3/10" → "Verbale 3-10"). */
export function fileName(title: string, format: SaveFormat): string {
  const base = [...title]
    .map((ch) => (ch.charCodeAt(0) < 0x20 ? '-' : ch)) // control characters
    .join('')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${base || 'documento'}.${EXTENSIONS[format]}`
}

/** A complete HTML page with the document (from the serializer, never from the DOM). */
export function documentToHTMLFile(doc: Node, title: string, lang: string): string {
  return (
    `<!doctype html>\n<html lang="${escapeAttr(lang)}">\n<head>\n<meta charset="utf-8">\n` +
    `<title>${escapeText(title)}</title>\n</head>\n<body>\n${serializeHTML(doc)}\n</body>\n</html>\n`
  )
}

/** Plain text: one paragraph per text block (blank line between), atoms by their text (e.g. "@Anna"). */
export function documentToText(doc: Node): string {
  const blocks: string[] = []
  doc.descendants((node) => {
    if (node.isTextblock) blocks.push(node.textBetween(0, node.content.size, '\n'))
    else if (node.isBlock && node.isAtom) blocks.push(node.type.spec.leafText?.(node) ?? '')
    else return true
    return false
  })
  return `${blocks.join('\n\n')}\n`
}

/** The document in `format`, as a file to save. */
export async function documentBlob(
  doc: Node,
  format: SaveFormat,
  title: string,
  lang = 'it',
): Promise<Blob> {
  switch (format) {
    case 'html':
      return new Blob([documentToHTMLFile(doc, title, lang)], { type: TYPES.html })
    case 'markdown':
      return new Blob([serializeMarkdown(doc)], { type: TYPES.markdown })
    case 'text':
      return new Blob([documentToText(doc)], { type: TYPES.text })
    case 'docx':
      return documentToDocx(doc, title)
  }
}

/** Starts the download of `blob` as `name` (a temporary link; nothing leaves the browser). */
export function download(doc: Document, blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = doc.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  a.hidden = true
  doc.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
