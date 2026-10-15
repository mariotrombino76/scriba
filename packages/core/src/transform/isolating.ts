import { Fragment } from '../model/fragment.js'
import type { Node } from '../model/node.js'
import type { ResolvedPos } from '../model/resolvedpos.js'
import { canReplace } from './structure.js'
import type { Transform } from './transform.js'

/**
 * Which ends of [from, to] sit inside an isolating node (e.g. a table cell)
 * that the range leaves. Edits must never join content across that border.
 */
export function isolatingSides(
  doc: Node,
  from: number,
  to: number,
): { from: boolean; to: boolean } {
  const $from = doc.resolve(from)
  const $to = doc.resolve(to)
  const shared = $from.sharedDepth(to)
  const inside = ($pos: ResolvedPos) => {
    for (let d = shared + 1; d <= $pos.depth; d++) if ($pos.node(d).type.spec.isolating) return true
    return false
  }
  return { from: inside($from), to: inside($to) }
}

/** True when [from, to) crosses the border of an isolating node. */
export function crossesIsolating(doc: Node, from: number, to: number): boolean {
  const sides = isolatingSides(doc, from, to)
  return sides.from || sides.to
}

function insideIsolating($pos: ResolvedPos): boolean {
  for (let d = 1; d <= $pos.depth; d++) if ($pos.node(d).type.spec.isolating) return true
  return false
}

/**
 * Deletes [from, to) without ever joining content across an isolating border
 * (simple picture: a table is a box; deleting a selection that starts outside
 * and ends inside it rubs out the selected text on each side, but never moves
 * text into or out of the box). Blocks entirely inside the range and not in an
 * isolating node (a whole table, whole paragraphs) are removed; elsewhere only
 * the selected text is deleted. Always schema-valid.
 */
export function deleteAcrossIsolating(tr: Transform, from: number, to: number): void {
  const doc = tr.doc
  const ranges: [number, number][] = []
  doc.nodesBetween(from, to, (node, pos) => {
    const end = pos + node.nodeSize
    const $pos = doc.resolve(pos)
    if (pos >= from && end <= to && node.isBlock && !insideIsolating($pos)) {
      const index = $pos.index()
      if (canReplace($pos.parent, index, index + 1, Fragment.empty)) {
        ranges.push([pos, end])
        return false
      }
    }
    if (node.isTextblock) {
      const start = Math.max(from, pos + 1)
      const stop = Math.min(to, end - 1)
      if (stop > start) ranges.push([start, stop])
      return false
    }
    return true
  })
  // later ranges first: earlier positions stay valid
  for (let i = ranges.length - 1; i >= 0; i--) tr.delete(ranges[i]![0], ranges[i]![1])
}
