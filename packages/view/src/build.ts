import type { Mark, Node } from '@scriba/core'
import { DecorationIndex } from './decorations.js'
import {
  DecoViewDesc,
  MarkViewDesc,
  NodeViewDesc,
  TextViewDesc,
  TRAILING_BREAK_CLASS,
  type ViewDesc,
} from './desc.js'
import { renderSpec } from './render.js'

/** What rendering needs besides the node: the decorations to show. */
export interface RenderContext {
  readonly decorations: DecorationIndex
}

export const emptyContext: RenderContext = { decorations: DecorationIndex.empty }

/** Creates the DOM and descriptor tree for a node starting at `pos`. */
export function renderNode(
  doc: Document,
  node: Node,
  pos: number,
  ctx: RenderContext,
): NodeViewDesc {
  const toHTML = node.type.spec.toHTML
  if (!toHTML) throw new RangeError(`Node type "${node.type.name}" has no toHTML spec`)
  const { dom, contentDOM } = renderSpec(doc, toHTML(node))
  if (node.isLeaf && !node.isText && node.type.name !== 'hard_break')
    dom.setAttribute('contenteditable', 'false')
  const desc = new NodeViewDesc(node, dom, contentDOM)
  if (contentDOM) renderContent(doc, desc, pos + 1, ctx)
  return desc
}

/** (Re)renders the whole content of a node desc, whose content starts at `contentStart`. */
export function renderContent(
  doc: Document,
  desc: NodeViewDesc,
  contentStart: number,
  ctx: RenderContext,
): void {
  const content = desc.contentDOM!
  while (content.firstChild) content.removeChild(content.firstChild)
  if (desc.node.inlineContent) {
    renderInline(doc, desc, contentStart, ctx)
    return
  }
  const children: ViewDesc[] = []
  desc.node.forEach((child, offset) => {
    const childDesc = renderNode(doc, child, contentStart + offset, ctx)
    content.appendChild(childDesc.dom)
    children.push(childDesc)
  })
  desc.setChildren(children)
}

/**
 * Renders inline content: text inside as few mark wrappers as possible, and
 * decoration `<span>`s (innermost) where decorations apply.
 */
function renderInline(
  doc: Document,
  desc: NodeViewDesc,
  contentStart: number,
  ctx: RenderContext,
): void {
  const root = desc.contentDOM!
  const decos = ctx.decorations.forBlock(contentStart)
  desc.decoKey = ctx.decorations.key(contentStart)
  const open: MarkViewDesc[] = []
  const top: ViewDesc[] = []
  const container = () => (open.length ? open[open.length - 1]!.contentDOM! : root)
  const siblings = () => (open.length ? open[open.length - 1]!.children : top)
  const parentDesc = () => open[open.length - 1] ?? desc

  desc.node.forEach((child, offset) => {
    const marks = child.marks
    let keep = 0
    while (keep < open.length && keep < marks.length && open[keep]!.mark.eq(marks[keep]!)) keep++
    open.length = keep
    for (let i = keep; i < marks.length; i++) {
      const markDesc = renderMark(doc, marks[i]!)
      container().appendChild(markDesc.dom)
      siblings().push(markDesc)
      markDesc.parent = parentDesc()
      open.push(markDesc)
    }
    if (!child.isText) {
      const childDesc = renderNode(doc, child, contentStart + offset, ctx)
      container().appendChild(childDesc.dom)
      siblings().push(childDesc)
      childDesc.parent = parentDesc()
      return
    }
    for (const piece of splitByDecorations(child.text.length, offset, decos)) {
      const textNode = child.cut(piece.from, piece.to)
      const textDesc = new TextViewDesc(textNode, doc.createTextNode(textNode.text))
      if (!piece.cls) {
        container().appendChild(textDesc.dom)
        siblings().push(textDesc)
        textDesc.parent = parentDesc()
        continue
      }
      const span = doc.createElement('span')
      span.className = piece.cls
      const decoDesc = new DecoViewDesc(span)
      span.appendChild(textDesc.dom)
      decoDesc.setChildren([textDesc])
      container().appendChild(span)
      siblings().push(decoDesc)
      decoDesc.parent = parentDesc()
    }
  })
  desc.children = top
  for (const child of top) child.parent = desc

  // Empty blocks, blocks ending in a hard break and text ending in a newline (code)
  // need a <br>: otherwise the last line is not shown and the caret cannot reach it.
  const last = desc.node.lastChild
  if (
    !last ||
    (last.isLeaf && last.type.name === 'hard_break') ||
    (last.isText && last.text.endsWith('\n'))
  ) {
    const br = doc.createElement('br')
    br.className = TRAILING_BREAK_CLASS
    root.appendChild(br)
  }
}

/** Pieces of a text node (relative [from, to)) with the decoration classes covering them. */
function splitByDecorations(
  length: number,
  offset: number,
  decos: readonly { from: number; to: number; cls: string }[],
): { from: number; to: number; cls: string }[] {
  const relevant = decos.filter((d) => d.from < offset + length && d.to > offset)
  if (!relevant.length) return [{ from: 0, to: length, cls: '' }]
  const cuts = new Set([0, length])
  for (const d of relevant) {
    cuts.add(Math.max(0, d.from - offset))
    cuts.add(Math.min(length, d.to - offset))
  }
  const points = [...cuts].sort((a, b) => a - b)
  const pieces: { from: number; to: number; cls: string }[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!
    const to = points[i + 1]!
    const classes = relevant
      .filter((d) => d.from - offset <= from && d.to - offset >= to)
      .map((d) => d.cls)
    pieces.push({
      from,
      to,
      cls: [...new Set(classes.join(' ').split(' ').filter(Boolean))].join(' '),
    })
  }
  return pieces
}

function renderMark(doc: Document, mark: Mark): MarkViewDesc {
  const toHTML = mark.type.spec.toHTML
  if (!toHTML) throw new RangeError(`Mark type "${mark.type.name}" has no toHTML spec`)
  const { dom, contentDOM } = renderSpec(doc, toHTML(mark))
  if (!contentDOM) throw new RangeError(`toHTML of mark "${mark.type.name}" needs a 0 hole`)
  return new MarkViewDesc(mark, dom, contentDOM)
}

/**
 * Updates a node desc to show `node` (whose content starts at `contentStart`),
 * reusing DOM wherever possible. Nodes are immutable: an identical object means
 * an identical subtree, so only changed nodes are touched (decoration-only
 * changes are handled by the view). Returns the desc to use (may be new).
 */
export function updateDesc(
  doc: Document,
  desc: NodeViewDesc,
  node: Node,
  contentStart: number,
  ctx: RenderContext,
): NodeViewDesc {
  if (desc.node === node) return desc
  if (!desc.node.sameMarkup(node) || node.isLeaf || !desc.contentDOM) {
    return renderNode(doc, node, contentStart - 1, ctx)
  }
  desc.node = node
  if (node.inlineContent) {
    renderContent(doc, desc, contentStart, ctx)
    return desc
  }
  const old = desc.children as NodeViewDesc[]
  const used = new Set<NodeViewDesc>()
  const upcoming = new Set<Node>()
  node.forEach((child) => upcoming.add(child))
  const next: NodeViewDesc[] = []
  let cursor = 0
  node.forEach((child, offset) => {
    upcoming.delete(child)
    const childStart = contentStart + offset + 1
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
      next.push(updateDesc(doc, candidate, child, childStart, ctx))
      cursor++
      return
    }
    // 3. Otherwise render it fresh.
    next.push(renderNode(doc, child, childStart - 1, ctx))
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
