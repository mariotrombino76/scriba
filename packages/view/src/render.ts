import {
  isVoidTag,
  outputStyle,
  safeOutputAttrs,
  safeTagName,
  type HTMLAttrs,
  type HTMLSpec,
} from '@scriba/core'

export interface RenderedSpec {
  dom: HTMLElement
  /** Element where content goes (the `0` hole), or null for leaves. */
  contentDOM: HTMLElement | null
}

/**
 * Builds DOM from a `toHTML` spec with `createElement` / `createTextNode` only
 * (never `innerHTML`, CLAUDE.md §5.2) and the same attribute checks as the serializer.
 */
export function renderSpec(doc: Document, spec: HTMLSpec): RenderedSpec {
  if (typeof spec === 'string') throw new RangeError('A toHTML spec must start with an element')
  let contentDOM: HTMLElement | null = null

  const build = (s: HTMLSpec): globalThis.Node => {
    if (typeof s === 'string') return doc.createTextNode(s)
    const [rawTag, ...rest] = s
    const tag = safeTagName(rawTag)
    const el = doc.createElement(tag)
    let start = 0
    const first = rest[0]
    if (first !== undefined && first !== 0 && typeof first === 'object' && !Array.isArray(first)) {
      for (const [name, value] of safeOutputAttrs(tag, first as HTMLAttrs))
        el.setAttribute(name, value)
      // Typed styles go through CSSOM, never a style attribute: works under a strict CSP (§5.7).
      for (const [property, value] of outputStyle(first as HTMLAttrs))
        el.style.setProperty(property, value)
      start = 1
    }
    if (isVoidTag(tag) && rest.length > start)
      throw new RangeError(`Void element <${tag}> cannot have content`)
    for (let i = start; i < rest.length; i++) {
      const child = rest[i]!
      if (child === 0) {
        if (contentDOM) throw new RangeError('A toHTML spec can have only one content hole')
        contentDOM = el
      } else {
        el.appendChild(build(child as HTMLSpec))
      }
    }
    return el
  }

  const dom = build(spec) as HTMLElement
  return { dom, contentDOM }
}
