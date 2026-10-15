import MarkdownIt from 'markdown-it'
import {
  HTMLLimitError,
  parseHTML,
  type HTMLParseOptions,
  type Node,
  type Schema,
} from '@scriba/core'
import { parseInertHTML } from '@scriba/view'

export interface MarkdownParseOptions {
  /** Longest Markdown accepted (characters, default 2 000 000; §5.10). */
  maxLength?: number
  /** Parser limits (nesting depth, number of nodes). */
  parse?: HTMLParseOptions
}

export const DEFAULT_MAX_MARKDOWN_LENGTH = 2_000_000

// Raw HTML in Markdown is not allowed (shown as text); no auto-linking or typography.
const md = new MarkdownIt('default', { html: false, linkify: false, typographer: false })
// markdown-it keeps the newline before a closing fence: the code block content does not end with it
md.core.ruler.push('scriba_trim_code', (state) => {
  for (const token of state.tokens)
    if (token.type === 'fence' || token.type === 'code_block')
      token.content = token.content.replace(/\n$/, '')
})

/**
 * Markdown → HTML string (CommonMark + GFM tables and strikethrough). The
 * result is NOT safe to show as is: always pass it through the schema parser
 * (as `parseMarkdown` does) or `@scriba/sanitize-server`.
 */
export function markdownToHTML(markdown: string, maxLength = DEFAULT_MAX_MARKDOWN_LENGTH): string {
  if (markdown.length > maxLength)
    throw new HTMLLimitError(`Markdown longer than ${maxLength} characters`)
  return md.render(markdown)
}

/**
 * Markdown → document, like any untrusted input (§5.2): rendered by
 * markdown-it, parsed in an inert document, rebuilt by the schema parser
 * (what the schema does not know is dropped). Browser only (DOMParser).
 */
export function parseMarkdown(
  schema: Schema,
  markdown: string,
  options: MarkdownParseOptions = {},
): Node {
  const html = markdownToHTML(markdown, options.maxLength)
  return parseHTML(schema, parseInertHTML(html).body, options.parse)
}
