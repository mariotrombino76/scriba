import type { Mark, Node } from '@scriba/core'
import {
  MarkViewDesc,
  NodeViewDesc,
  TextViewDesc,
  TRAILING_BREAK_CLASS,
  type ViewDesc,
} from './desc.js'
import { renderSpec } from './render.js'

/** Creates the DOM and descriptor tree for a node. */
export function renderNode(doc: Document, node: Node): NodeViewDesc {
  const toHTML = node.type.spec.toHTML
  if (!toHTML) throw new RangeError(`Node type "${node.type.name}" has no toHTML spec`)
  const { dom, contentDOM } = renderSpec(doc, toHTML(node))
  if (node.isLeaf && !node.isText && node.type.name !== 'hard_break')
    dom.setAttribute('contenteditable', 'false')
  const desc = new NodeViewDesc(node, dom, contentDOM)
  if (contentDOM) renderContent(doc, desc)
  return desc
}

/** (Re)renders the whole content of a node desc into its contentDOM. */
export function renderContent(doc: Document, desc: NodeViewDesc): void {
  const content = desc.contentDOM!
  while (content.firstChild) content.removeChild(content.firstChild)
  if (desc.node.inlineContent) {
    renderInline(doc, desc)
    return
  }
  const children: ViewDesc[] = []
  desc.node.forEach((child) => {
    const childDesc = renderNode(doc, child)
    content.appendChild(childDesc.dom)
    children.push(childDesc)
  })
  desc.setChildren(children)
}

/** Renders inline content, nesting text inside as few mark wrappers as possible. */
function renderInline(doc: Document, desc: NodeViewDesc): void {
  const root = desc.contentDOM!
  const open: MarkViewDesc[] = []
  const top: ViewDesc[] = []
  const container = () => (open.length ? open[open.length - 1]!.contentDOM! : root)
  const siblings = () => (open.length ? open[open.length - 1]!.children : top)

  desc.node.forEach((child) => {
    const marks = child.marks
    let keep = 0
    while (keep < open.length && keep < marks.length && open[keep]!.mark.eq(marks[keep]!)) keep++
    open.length = keep
    for (let i = keep; i < marks.length; i++) {
      const markDesc = renderMark(doc, marks[i]!)
      container().appendChild(markDesc.dom)
      siblings().push(markDesc)
      markDesc.parent = open[open.length - 1] ?? desc
      open.push(markDesc)
    }
    const childDesc = child.isText
      ? new TextViewDesc(child, doc.createTextNode(child.text))
      : renderNode(doc, child)
    container().appendChild(childDesc.dom)
    siblings().push(childDesc)
    childDesc.parent = open[open.length - 1] ?? desc
  })
  desc.children = top
  for (const child of top) child.parent = desc

  // Empty blocks and blocks ending in a hard break need a <br> to be visible and focusable.
  const last = desc.node.lastChild
  if (!last || (last.isLeaf && last.type.name === 'hard_break')) {
    const br = doc.createElement('br')
    br.className = TRAILING_BREAK_CLASS
    root.appendChild(br)
  }
}

function renderMark(doc: Document, mark: Mark): MarkViewDesc {
  const toHTML = mark.type.spec.toHTML
  if (!toHTML) throw new RangeError(`Mark type "${mark.type.name}" has no toHTML spec`)
  const { dom, contentDOM } = renderSpec(doc, toHTML(mark))
  if (!contentDOM) throw new RangeError(`toHTML of mark "${mark.type.name}" needs a 0 hole`)
  return new MarkViewDesc(mark, dom, contentDOM)
}

/**
 * Updates a node desc to show `node`, reusing DOM wherever possible.
 * Nodes are immutable: an identical object means an identical subtree,
 * so only changed nodes are touched. Returns the desc to use (may be new).
 */
export function updateDesc(doc: Document, desc: NodeViewDesc, node: Node): NodeViewDesc {
  if (desc.node === node) return desc
  if (!desc.node.sameMarkup(node) || node.isLeaf || !desc.contentDOM) return renderNode(doc, node)
  desc.node = node
  if (node.inlineContent) {
    renderContent(doc, desc)
    return desc
  }
  const old = desc.children as NodeViewDesc[]
  const used = new Set<NodeViewDesc>()
  const upcoming = new Set<Node>()
  node.forEach((child) => upcoming.add(child))
  const next: NodeViewDesc[] = []
  let cursor = 0
  node.forEach((child) => {
    upcoming.delete(child)
    // 1. The very same node further ahead: reuse it untouched.
    let found = -1
    for (let j = cursor; j < old.length; j++) {
      if (old[j]!.node === child && !used.has(old[j]!)) {
        found = j
        break
      }
    }
    if (found >= 0) {
      next.push(old[found]!)
      used.add(old[found]!)
      cursor = found + 1
      return
    }
    // 2. A node with the same markup in this slot, not needed later: update it in place.
    const candidate = old[cursor]
    if (
      candidate &&
      !used.has(candidate) &&
      !upcoming.has(candidate.node) &&
      candidate.node.sameMarkup(child)
    ) {
      used.add(candidate)
      next.push(updateDesc(doc, candidate, child))
      cursor++
      return
    }
    // 3. Otherwise render it fresh.
    next.push(renderNode(doc, child))
  })
  syncChildren(desc, next)
  return desc
}

/** Makes the content DOM match the given children, in order, removing stale nodes. */
function syncChildren(desc: NodeViewDesc, next: NodeViewDesc[]): void {
  const content = desc.contentDOM!
  const keep = new Set(next.map((d) => d.dom))
  for (const child of Array.from(content.childNodes))
    if (!keep.has(child)) content.removeChild(child)
  next.forEach((child, i) => {
    const at = content.childNodes[i] ?? null
    if (at !== child.dom) content.insertBefore(child.dom, at)
  })
  desc.setChildren(next)
}
