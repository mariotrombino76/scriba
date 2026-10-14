import { Mark, type Node } from '@scriba/core'
import {
  MarkViewDesc,
  NodeViewDesc,
  TRAILING_BREAK_CLASS,
  nearestDesc,
  type ViewDesc,
} from './desc.js'

/** Placeholder char for inline leaves, so every model position is one char. */
export const LEAF_CHAR = '\ufffc'

/** Inline content as one entry per model position: a char and its marks. */
export interface Chars {
  text: string
  marks: (readonly Mark[])[]
}

/** Chars of a textblock in the model. */
export function modelChars(block: Node): Chars {
  const out: Chars = { text: '', marks: [] }
  block.forEach((child) => {
    const text = child.isText ? child.text : LEAF_CHAR
    out.text += text
    for (let i = 0; i < text.length; i++) out.marks.push(child.marks)
  })
  return out
}

/**
 * Chars currently shown in a textblock's DOM, with the marks of the mark
 * elements around them. Used after IME composition or foreign DOM edits
 * (spellcheck, extensions), when the browser changed the DOM itself.
 */
export function domChars(desc: NodeViewDesc, root: ViewDesc): Chars {
  const out: Chars = { text: '', marks: [] }
  const push = (text: string, marks: readonly Mark[]) => {
    out.text += text
    for (let i = 0; i < text.length; i++) out.marks.push(marks)
  }
  const walk = (dom: globalThis.Node, marks: readonly Mark[]): void => {
    for (let child = dom.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) {
        push(child.nodeValue ?? '', marks)
        continue
      }
      if (child.nodeType !== 1) continue
      const el = child as HTMLElement
      if (el.nodeName === 'BR' && el.classList.contains(TRAILING_BREAK_CLASS)) continue
      const owner = nearestDesc(el, root)
      if (
        owner instanceof NodeViewDesc &&
        owner !== desc &&
        owner.dom === el &&
        owner.node.isLeaf
      ) {
        push(LEAF_CHAR, owner.node.marks)
        continue
      }
      if (el.nodeName === 'BR') continue // a <br> the browser inserted on its own
      const inner =
        owner instanceof MarkViewDesc && owner.dom === el ? owner.mark.addToSet(marks) : marks
      walk(el, inner)
    }
  }
  walk(desc.contentDOM!, Mark.none)
  return out
}

/** Smallest change turning `a` into `b` (chars and marks): replace [start, endA) of `a` with b[start, endB). */
export function charsDiff(
  a: Chars,
  b: Chars,
): { start: number; endA: number; endB: number } | null {
  const same = (i: number, j: number) =>
    a.text.charCodeAt(i) === b.text.charCodeAt(j) && Mark.sameSet(a.marks[i]!, b.marks[j]!)
  let start = 0
  const min = Math.min(a.text.length, b.text.length)
  while (start < min && same(start, start)) start++
  let endA = a.text.length
  let endB = b.text.length
  while (endA > start && endB > start && same(endA - 1, endB - 1)) {
    endA--
    endB--
  }
  if (start === endA && start === endB) return null
  return { start, endA, endB }
}
