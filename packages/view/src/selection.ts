import { NodeSelection, TextSelection, type Selection, type Node } from '@scriba/core'
import { descAt, domFromPos, posFromDOM, type ViewDesc } from './desc.js'

/** Reads the DOM selection as a model selection, or null when it is outside the editor. */
export function readDOMSelection(
  root: ViewDesc,
  doc: Node,
  domSel: globalThis.Selection | null,
): Selection | null {
  if (!domSel || !domSel.anchorNode || !domSel.focusNode) return null
  const anchor = posFromDOM(root, domSel.anchorNode, domSel.anchorOffset)
  const head = posFromDOM(root, domSel.focusNode, domSel.focusOffset)
  if (anchor === null || head === null) return null
  const size = doc.content.size
  const clamp = (pos: number) => Math.max(0, Math.min(pos, size))
  return TextSelection.between(doc.resolve(clamp(anchor)), doc.resolve(clamp(head)))
}

/** Puts the DOM selection where the model selection is. Returns false if nothing changed. */
export function writeDOMSelection(
  root: ViewDesc,
  selection: Selection,
  domSel: globalThis.Selection | null,
): boolean {
  if (!domSel) return false
  let anchor: { node: globalThis.Node; offset: number }
  let head: { node: globalThis.Node; offset: number }
  if (selection instanceof NodeSelection) {
    const desc = descAt(root, selection.from)
    const dom = desc?.dom
    if (!dom?.parentNode) return false
    const index = Array.prototype.indexOf.call(dom.parentNode.childNodes, dom) as number
    anchor = { node: dom.parentNode, offset: index }
    head = { node: dom.parentNode, offset: index + 1 }
  } else {
    const range = selection.domRange()
    anchor = domFromPos(root, range.anchor)
    head = range.anchor === range.head ? anchor : domFromPos(root, range.head)
  }
  if (
    domSel.anchorNode === anchor.node &&
    domSel.anchorOffset === anchor.offset &&
    domSel.focusNode === head.node &&
    domSel.focusOffset === head.offset
  ) {
    return false
  }
  domSel.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset)
  return true
}
