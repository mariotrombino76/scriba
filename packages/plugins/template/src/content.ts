import {
  AllSelection,
  Selection,
  TransformError,
  insertContent,
  parseHTML,
  type Command,
  type Fragment,
  type Node,
  type Schema,
  type Transaction,
} from '@scriba/core'
import { parseInertHTML } from '@scriba/view'

/** A ready-made content the user can insert (TinyMCE's `templates`). */
export interface Template {
  title: string
  /** Shown under the list, with the preview. */
  description?: string
  /**
   * The template's HTML, or a function loading it (e.g. from the server) when
   * it is first previewed. Untrusted: it goes through the schema parser.
   */
  content: string | (() => Promise<string>)
}

/** A placeholder's value: plain text, or a function called at each use (e.g. today's date). */
export type TemplateValue = string | (() => string)

export interface TemplateOptions {
  /** The templates, or a function loading them when the dialog opens. */
  templates: readonly Template[] | (() => Promise<readonly Template[]>)
  /**
   * Values for `{{name}}` placeholders in the templates' text. Added to the
   * built-in `date` and `time`. Always inserted as text, never as markup.
   */
  values?: Readonly<Record<string, TemplateValue>>
  /** Locale of the built-in `date` and `time` (default: the browser's). */
  locale?: string
}

/** Longest template HTML accepted (characters): bigger ones are refused, not cut. */
export const MAX_TEMPLATE_LENGTH = 1_000_000

const PLACEHOLDER = /\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}/g
const SHOW_TEXT = 4 // NodeFilter.SHOW_TEXT

/** The built-in placeholders: `{{date}}` and `{{time}}`, now, in `locale`. */
export function defaultTemplateValues(locale?: string): Record<string, TemplateValue> {
  return {
    date: () => new Date().toLocaleDateString(locale, { dateStyle: 'long' }),
    time: () => new Date().toLocaleTimeString(locale, { timeStyle: 'short' }),
  }
}

/** Replaces the `{{name}}` placeholders of `values` in `text`; unknown ones stay as they are. */
export function fillPlaceholders(
  text: string,
  values: Readonly<Record<string, TemplateValue>>,
): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    if (!Object.hasOwn(values, name)) return whole
    const value = values[name]!
    return typeof value === 'function' ? value() : value
  })
}

/**
 * Turns a template's HTML into a document of `schema`: parsed in an inert
 * document, placeholders filled in its text nodes only (a value can never add
 * markup), then passed through the schema parser like any untrusted input.
 * Throws a `RangeError` when the HTML is longer than `MAX_TEMPLATE_LENGTH`.
 */
export function parseTemplate(
  schema: Schema,
  html: string,
  values: Readonly<Record<string, TemplateValue>> = {},
): Node {
  if (html.length > MAX_TEMPLATE_LENGTH)
    throw new RangeError(`Template longer than ${MAX_TEMPLATE_LENGTH} characters`)
  const body = parseInertHTML(html).body
  const walker = body.ownerDocument.createTreeWalker(body, SHOW_TEXT)
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const data = (text as Text).data
    if (data.includes('{{')) (text as Text).data = fillPlaceholders(data, values)
  }
  return parseHTML(schema, body)
}

/** Whether the document is just one empty paragraph (a new document). */
function isBlank(doc: Node): boolean {
  const first = doc.firstChild
  return doc.childCount === 1 && !!first && first.isTextblock && first.content.size === 0
}

/** Runs one transform helper; a schema refusal returns false. */
function attempt(f: () => void): boolean {
  try {
    f()
    return true
  } catch (e) {
    if (e instanceof TransformError) return false
    throw e
  }
}

/**
 * Inserts whole blocks at the cursor, keeping their type (a template's
 * heading stays a heading): an empty paragraph is replaced, otherwise the
 * paragraph is split at the cursor and the blocks go in between. Returns the
 * end of the inserted content, or null where the blocks are not allowed.
 */
function insertBlocks(tr: Transaction, content: Fragment): number | null {
  const { $from } = tr.selection
  const parent = $from.parent
  if (!tr.selection.empty || !parent.isTextblock || parent.type.spec.code) return null
  if (!content.firstChild?.isBlock) return null
  if ($from.depth === 0) return null
  if (!parent.content.size) {
    const from = $from.before()
    return attempt(() => tr.replaceWith(from, $from.after(), content)) ? from + content.size : null
  }
  let at: number
  if ($from.parentOffset === 0) at = $from.before()
  else if ($from.parentOffset === parent.content.size) at = $from.after()
  else {
    if (!attempt(() => tr.split($from.pos))) return null
    at = $from.pos + 1
  }
  return attempt(() => tr.insert(at, content)) ? at + content.size : null
}

/**
 * Inserts a template's content at the selection. Its blocks keep their type
 * (the paragraph at the cursor is split); where they do not fit (e.g. in a
 * table cell or a code block) the content is fitted to the place like a
 * paste (see `insertContent`). In a blank document, or with everything
 * selected, it becomes the whole document. One undo step.
 */
export function insertTemplate(content: Fragment): Command {
  return (state, dispatch) => {
    if (!content.size) return false
    let tr = state.tr
    const sel = state.selection
    if (sel instanceof AllSelection || isBlank(state.doc)) {
      tr.replaceWith(0, tr.doc.content.size, content)
      tr.setSelection(Selection.atEnd(tr.doc))
    } else {
      if (!sel.empty) tr.deleteSelection() // a cell selection keeps its table
      const afterDelete = tr.steps.length
      let end = insertBlocks(tr, content)
      if (end === null) {
        if (tr.steps.length > afterDelete) {
          // a split happened before the refusal: start again from the deletion
          tr = state.tr
          if (!sel.empty) tr.deleteSelection()
        }
        const { from, to } = tr.selection
        end = insertContent(tr, from, to, content)
        if (end === null) return false
      }
      tr.setSelection(Selection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size)), -1))
    }
    dispatch?.(tr.scrollIntoView())
    return true
  }
}
