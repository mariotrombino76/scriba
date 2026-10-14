import { Fragment } from '../model/fragment.js'
import type { Mark } from '../model/mark.js'
import type { Node } from '../model/node.js'
import type { Schema } from '../model/schema.js'
import type { HTMLAttrs, HTMLSpec, MarkToHTML, NodeToHTML } from './types.js'
import { safeStyleDecls } from './css.js'
import { sanitizeUrl } from './url.js'

const VOID_TAGS = new Set(['area', 'br', 'col', 'hr', 'img', 'wbr'])
const TAG_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const ATTR_NAME = /^[a-z][a-z0-9-]*$/
const LINK_ATTRS = new Set(['href', 'cite'])
const IMAGE_ATTRS = new Set(['src'])
/** Never written, whatever a spec returns (CLAUDE.md §5.4: styles are typed attributes, set via CSSOM). */
const FORBIDDEN_ATTRS = new Set([
  'style',
  'srcset',
  'action',
  'formaction',
  'xlink:href',
  'background',
  'poster',
])

export function escapeText(text: string): string {
  return text.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

export function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/**
 * Turns a document into HTML using each type's `toHTML`.
 * Output is built from the model only (never copied from the DOM), with every
 * text and attribute escaped and URL attributes re-checked.
 */
export class HTMLSerializer {
  private readonly nodes = new Map<string, NodeToHTML>()
  private readonly marks = new Map<string, MarkToHTML>()

  constructor(readonly schema: Schema) {
    for (const type of Object.values(schema.nodes)) {
      const toHTML = type.spec.toHTML
      if (toHTML) this.nodes.set(type.name, toHTML)
    }
    for (const type of Object.values(schema.marks)) {
      const toHTML = type.spec.toHTML
      if (toHTML) this.marks.set(type.name, toHTML)
    }
  }

  serializeNode(node: Node): string {
    if (node.isText) return this.serializeFragment(Fragment.from(node))
    const toHTML = this.nodes.get(node.type.name)
    if (!toHTML) throw new RangeError(`No toHTML for node type "${node.type.name}"`)
    return render(toHTML(node), () => this.serializeFragment(node.content))
  }

  /** Serializes a fragment; text marks are opened and closed as few times as possible. */
  serializeFragment(fragment: Fragment): string {
    let out = ''
    const open: { mark: Mark; close: string }[] = []
    fragment.forEach((child) => {
      const marks = child.isInline ? child.marks : []
      let keep = 0
      while (keep < open.length && keep < marks.length && open[keep]!.mark.eq(marks[keep]!)) keep++
      while (open.length > keep) out += open.pop()!.close
      for (let i = keep; i < marks.length; i++) {
        const mark = marks[i]!
        const toHTML = this.marks.get(mark.type.name)
        if (!toHTML) throw new RangeError(`No toHTML for mark type "${mark.type.name}"`)
        const [before, after] = render(toHTML(mark), () => '\u0000').split('\u0000')
        if (after === undefined)
          throw new RangeError(`toHTML of mark "${mark.type.name}" needs a 0 hole`)
        out += before
        open.push({ mark, close: after })
      }
      out += child.isText ? escapeText(child.text) : this.serializeNode(child)
    })
    while (open.length) out += open.pop()!.close
    return out
  }
}

/**
 * Checks and normalizes output attributes of a `toHTML` spec. Shared by the
 * string serializer and the DOM renderer of the view, so both apply the same rules:
 * no event handlers, no inline styles, URLs re-checked against the whitelist.
 * Returns `[name, value]` pairs (value `''` for boolean attributes).
 */
export function safeOutputAttrs(tag: string, attrs: HTMLAttrs): [string, string][] {
  const out: [string, string][] = []
  for (const [name, raw] of Object.entries(attrs)) {
    if (raw === null || raw === undefined || raw === false) continue
    const lower = name.toLowerCase()
    if (lower === 'style') {
      // Only typed declarations (an object); free style strings are never written.
      if (typeof raw !== 'object')
        throw new RangeError('A style must be an object of typed declarations')
      continue // see outputStyle()
    }
    if (typeof raw === 'object') throw new RangeError(`Attribute "${name}" must be a scalar`)
    if (!ATTR_NAME.test(lower) || lower.startsWith('on') || FORBIDDEN_ATTRS.has(lower)) {
      throw new RangeError(`Attribute "${name}" is not allowed in HTML output`)
    }
    let value = raw === true ? '' : String(raw)
    if (LINK_ATTRS.has(lower) || IMAGE_ATTRS.has(lower)) {
      const kind = IMAGE_ATTRS.has(lower) || tag === 'img' ? 'image' : 'link'
      const safe = sanitizeUrl(value, { kind })
      if (safe === null) continue
      value = safe
    }
    out.push([lower, value])
  }
  return out
}

/** Validated typed style declarations of an attributes object (`[]` when none). */
export function outputStyle(attrs: HTMLAttrs): [string, string][] {
  const style = attrs['style']
  return style && typeof style === 'object' ? safeStyleDecls(style) : []
}

/** Validates and lowercases a tag name from a `toHTML` spec. */
export function safeTagName(tag: string): string {
  const lower = tag.toLowerCase()
  if (!TAG_NAME.test(lower)) throw new RangeError(`Invalid tag name "${tag}"`)
  return lower
}

export function isVoidTag(tag: string): boolean {
  return VOID_TAGS.has(tag)
}

function renderAttrs(tag: string, attrs: HTMLAttrs): string {
  const style = outputStyle(attrs)
    .map(([p, v]) => `${p}: ${v}`)
    .join('; ')
  return (
    (style ? ` style="${escapeAttr(style)}"` : '') +
    safeOutputAttrs(tag, attrs)
      .map(([name, value]) =>
        value === '' && attrs[name] === true ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`,
      )
      .join('')
  )
}

function render(spec: HTMLSpec, content: () => string): string {
  if (typeof spec === 'string') return escapeText(spec)
  const [rawTag, ...rest] = spec
  const tag = safeTagName(rawTag)
  let attrs = ''
  let start = 0
  const first = rest[0]
  if (first !== undefined && first !== 0 && typeof first === 'object' && !Array.isArray(first)) {
    attrs = renderAttrs(tag, first as HTMLAttrs)
    start = 1
  }
  if (VOID_TAGS.has(tag)) {
    if (rest.length > start) throw new RangeError(`Void element <${tag}> cannot have content`)
    return `<${tag}${attrs}>`
  }
  let inner = ''
  for (let i = start; i < rest.length; i++) {
    const child = rest[i]!
    inner += child === 0 ? content() : render(child as HTMLSpec, content)
  }
  return `<${tag}${attrs}>${inner}</${tag}>`
}
