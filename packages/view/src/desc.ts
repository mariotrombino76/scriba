import type { Mark, Node } from '@scriba/core'

/** DOM node → its descriptor. */
const descOf = new WeakMap<globalThis.Node, ViewDesc>()

/** CSS class of the `<br>` added so empty textblocks (or a trailing hard break) stay visible. */
export const TRAILING_BREAK_CLASS = 'scriba-trailing-break'

/**
 * A descriptor ties a piece of the model to the DOM that shows it.
 * Together they form a tree parallel to the DOM, used to translate
 * positions in both directions.
 */
export abstract class ViewDesc {
  parent: ViewDesc | null = null
  children: ViewDesc[] = []

  constructor(
    public dom: globalThis.Node,
    public contentDOM: HTMLElement | null,
  ) {
    descOf.set(dom, this)
  }

  /** Size in model positions. */
  abstract get size(): number

  /** Tokens before the content starts (1 for nodes with content, 0 for marks and text). */
  abstract get border(): number

  /** Absolute position before this desc. */
  posBefore(): number {
    const parent = this.parent
    if (!parent) return -1
    let pos = parent.posAtContentStart()
    for (const child of parent.children) {
      if (child === this) return pos
      pos += child.size
    }
    throw new Error('Descriptor not found in its parent')
  }

  /** Absolute position where the content starts. */
  posAtContentStart(): number {
    return this.parent ? this.posBefore() + this.border : 0
  }

  setChildren(children: ViewDesc[]): void {
    this.children = children
    for (const child of children) child.parent = this
  }
}

export class NodeViewDesc extends ViewDesc {
  constructor(
    public node: Node,
    dom: globalThis.Node,
    contentDOM: HTMLElement | null,
  ) {
    super(dom, contentDOM)
  }

  get size(): number {
    return this.parent ? this.node.nodeSize : this.node.content.size
  }

  get border(): number {
    return this.node.isLeaf ? 0 : 1
  }
}

export class MarkViewDesc extends ViewDesc {
  constructor(
    readonly mark: Mark,
    dom: HTMLElement,
    contentDOM: HTMLElement,
  ) {
    super(dom, contentDOM)
  }

  get size(): number {
    let size = 0
    for (const child of this.children) size += child.size
    return size
  }

  get border(): number {
    return 0
  }
}

export class TextViewDesc extends ViewDesc {
  constructor(
    public node: Node,
    dom: Text,
  ) {
    super(dom, null)
  }

  get size(): number {
    return this.node.text.length
  }

  get border(): number {
    return 0
  }
}

/** Descriptor owning a DOM node (the node itself or its nearest ancestor with one). */
export function nearestDesc(dom: globalThis.Node | null, root: ViewDesc): ViewDesc | null {
  for (let cur = dom; cur; cur = cur.parentNode) {
    const desc = descOf.get(cur)
    if (desc) return desc
    if (cur === root.dom) return root
  }
  return null
}

/** The child descriptor of `desc` whose DOM is `dom`, if any. */
function childDescOf(desc: ViewDesc, dom: globalThis.Node): ViewDesc | null {
  const found = descOf.get(dom)
  return found && found.parent === desc ? found : null
}

function domIndex(node: globalThis.Node): number {
  return Array.prototype.indexOf.call(node.parentNode!.childNodes, node) as number
}

/**
 * Model position of a DOM point (container + offset), or null when the point
 * is outside the editor.
 */
export function posFromDOM(root: ViewDesc, dom: globalThis.Node, offset: number): number | null {
  const desc = nearestDesc(dom, root)
  if (!desc) return null
  if (desc instanceof TextViewDesc) {
    if (dom === desc.dom) return desc.posAtContentStart() + Math.min(offset, desc.size)
    return desc.posBefore()
  }
  const content = desc.contentDOM
  if (content && (dom === content || content.contains(dom))) {
    // Point directly in the content element: count the children before it.
    let container: globalThis.Node = dom
    let index = offset
    if (dom !== content) {
      // Some foreign node inside the content (e.g. the trailing <br>): use its top-level child.
      while (container.parentNode !== content) container = container.parentNode!
      index = domIndex(container) + (offset > 0 ? 1 : 0)
    }
    let pos = desc.posAtContentStart()
    const kids = content.childNodes
    for (let i = 0; i < index && i < kids.length; i++) pos += childDescOf(desc, kids[i]!)?.size ?? 0
    return pos
  }
  // Inside the node's own markup (an atom, or wrapper elements around the content).
  if (!desc.parent) return 0
  const before = content ? content.compareDocumentPosition(dom) & 2 /* PRECEDING */ : offset === 0
  return before ? desc.posBefore() : desc.posBefore() + desc.size
}

/** DOM point for a model position, preferring text nodes on the left side of boundaries. */
export function domFromPos(root: ViewDesc, pos: number): { node: globalThis.Node; offset: number } {
  let desc: ViewDesc = root
  let rel = pos
  for (;;) {
    if (desc instanceof TextViewDesc) return { node: desc.dom, offset: rel }
    const content = desc.contentDOM
    if (!content) {
      return { node: desc.dom.parentNode!, offset: domIndex(desc.dom) + (rel > 0 ? 1 : 0) }
    }
    let offset = 0
    let next: ViewDesc | null = null
    for (const child of desc.children) {
      const end = offset + child.size
      const inline = child instanceof TextViewDesc || child instanceof MarkViewDesc
      if (inline ? rel <= end : rel < end && rel > offset) {
        next = child
        break
      }
      if (rel === offset) break
      offset = end
    }
    if (!next) {
      // Boundary between children: point at the child DOM index.
      const at = desc.children.find((_c, i) => sumSizes(desc.children, i) === rel)
      return { node: content, offset: at ? domIndex(at.dom) : countRealChildren(desc) }
    }
    rel -= offset + next.border
    desc = next
  }
}

function sumSizes(children: readonly ViewDesc[], count: number): number {
  let size = 0
  for (let i = 0; i < count; i++) size += children[i]!.size
  return size
}

function countRealChildren(desc: ViewDesc): number {
  const last = desc.children[desc.children.length - 1]
  return last ? domIndex(last.dom) + 1 : 0
}

/** Descriptor of the innermost textblock containing a DOM node. */
export function textblockDescOf(dom: globalThis.Node | null, root: ViewDesc): NodeViewDesc | null {
  for (let desc = nearestDesc(dom, root); desc; desc = desc.parent) {
    if (desc instanceof NodeViewDesc && desc.node.isTextblock) return desc
  }
  return null
}

/** Descriptor of the node starting at `pos` (direct lookup through the tree). */
export function descAt(root: ViewDesc, pos: number): NodeViewDesc | null {
  let desc: ViewDesc = root
  let rel = pos
  for (;;) {
    let offset = 0
    let next: ViewDesc | null = null
    for (const child of desc.children) {
      if (rel === offset && child instanceof NodeViewDesc) return child
      const end = offset + child.size
      if (rel > offset && rel < end) {
        next = child
        break
      }
      offset = end
    }
    if (!next) return null
    rel -= offset + next.border
    desc = next
  }
}
