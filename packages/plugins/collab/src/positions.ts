import * as Y from 'yjs'
import type { Node } from '@scriba-editor/core'

/**
 * Document positions ↔ Yjs relative positions. A relative position sticks to
 * the text around it (simple picture: a bookmark between two letters), so a
 * cursor shared with others stays in place while they type elsewhere.
 * Positions count UTF-16 units in both models (an embed counts one).
 */

function textOf(el: Y.XmlElement): Y.XmlText | undefined {
  return el.toArray().find((c): c is Y.XmlText => c instanceof Y.XmlText)
}

/** Document position → relative position (null when the two trees are out of step). */
export function toRelative(
  doc: Node,
  fragment: Y.XmlFragment,
  pos: number,
): Y.RelativePosition | null {
  let node: Node = doc
  let yParent: Y.XmlFragment | Y.XmlElement = fragment
  let offset = pos // inside `node`'s content
  for (;;) {
    if (node.isTextblock) {
      const text = textOf(yParent as Y.XmlElement)
      return text ? Y.createRelativePositionFromTypeIndex(text, offset) : null
    }
    const children: unknown[] = yParent.toArray()
    if (children.length !== node.childCount) return null
    let index = 0
    let start = 0
    for (; index < node.childCount; index++) {
      const size = node.child(index).nodeSize
      if (offset < start + size) break
      start += size
    }
    // between blocks (or at the end): relative to the parent at that index
    if (index === node.childCount || offset === start)
      return Y.createRelativePositionFromTypeIndex(yParent, index)
    const yChild: unknown = children[index]
    if (!(yChild instanceof Y.XmlElement)) return null
    node = node.child(index)
    yParent = yChild
    offset -= start + 1
  }
}

/** Relative position → document position (null when it no longer points into the document). */
export function fromRelative(
  doc: Node,
  fragment: Y.XmlFragment,
  rel: Y.RelativePosition,
  ydoc: Y.Doc,
): number | null {
  const abs = Y.createAbsolutePositionFromRelativePosition(rel, ydoc)
  if (!abs) return null
  // find the Scriba node matching abs.type by walking both trees
  const walk = (
    node: Node,
    yParent: Y.XmlFragment | Y.XmlElement,
    contentStart: number,
  ): number | null => {
    if (node.isTextblock) {
      const text = textOf(yParent as Y.XmlElement)
      if (text && abs.type === text) return contentStart + Math.min(abs.index, node.content.size)
      return null
    }
    const children = yParent.toArray()
    if (children.length !== node.childCount) return null
    if (abs.type === yParent) {
      let pos = contentStart
      for (let i = 0; i < Math.min(abs.index, node.childCount); i++) pos += node.child(i).nodeSize
      return pos
    }
    let pos = contentStart
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      const yChild = children[i]
      if (yChild instanceof Y.XmlElement) {
        const found = walk(child, yChild, pos + 1)
        if (found !== null) return found
      }
      pos += child.nodeSize
    }
    return null
  }
  return walk(doc, fragment, 0)
}
