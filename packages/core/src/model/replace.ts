import { Fragment } from './fragment.js'
import type { Node } from './node.js'
import type { ResolvedPos } from './resolvedpos.js'
import type { Slice } from './slice.js'

/** Thrown when a replacement would produce a document that breaks the schema. */
export class ReplaceError extends Error {
  override name = 'ReplaceError'
}

/*
 * How the replace works ("three ropes" picture):
 *
 * At every depth there are up to three pieces to stitch together:
 *  - LEFT:  what stays of the document before `$from`
 *  - SLICE: the inserted content
 *  - RIGHT: what stays of the document after `$to`
 *
 * The slice's open start is glued onto the node containing `$from` and its
 * open end onto the node containing `$to`. To make depths line up, the slice is
 * first wrapped in copies of `$from`'s ancestors, so that it is "open" all the
 * way down to `$from.depth` on the left and `$to.depth` on the right.
 *
 * Walking down from the root, while both open edges of the slice go through
 * the same (single) child we build one shared node (`buildShared`). Once they
 * split, the left edge is built by `buildLeft` and the right one by
 * `buildRight`. Every rebuilt node is checked against the schema.
 */
export function replace($from: ResolvedPos, $to: ResolvedPos, slice: Slice): Node {
  const base = $from.depth - slice.openStart
  if (base < 0 || $to.depth - slice.openEnd !== base) {
    throw new ReplaceError('Slice does not fit the depth of the replaced range')
  }
  let root = $from.node(base).copy(slice.content)
  for (let d = base - 1; d >= 0; d--) root = $from.node(d).copy(Fragment.from(root))
  return buildShared($from, $to, 0, root)
}

function leftOf($from: ResolvedPos, depth: number): Fragment {
  const node = $from.node(depth)
  const offset =
    depth === $from.depth ? $from.parentOffset : $from.before(depth + 1) - $from.start(depth)
  return node.content.cut(0, offset)
}

function rightOf($to: ResolvedPos, depth: number): Fragment {
  const node = $to.node(depth)
  const offset = depth === $to.depth ? $to.parentOffset : $to.after(depth + 1) - $to.start(depth)
  return node.content.cut(offset)
}

function close(node: Node, content: Fragment): Node {
  if (!node.type.validContent(content)) {
    throw new ReplaceError(`Invalid content for node ${node.type.name}`)
  }
  return node.copy(content)
}

/**
 * Slice children inserted whole (not merged at an open edge) must be fully valid:
 * slices can come from untrusted JSON with incomplete nodes.
 */
function wholeChild(slice: Node, index: number): Node {
  const child = slice.child(index)
  try {
    child.check()
  } catch (e) {
    throw new ReplaceError(e instanceof Error ? e.message : String(e))
  }
  return child
}

function edgeChild(node: Node, first: boolean): Node {
  const child = first ? node.firstChild : node.lastChild
  if (!child || child.isText || child.isLeaf) {
    throw new ReplaceError('Slice is open deeper than its content')
  }
  return child
}

function buildShared($from: ResolvedPos, $to: ResolvedPos, depth: number, slice: Node): Node {
  const fromOpen = depth < $from.depth
  const toOpen = depth < $to.depth
  const parts: Node[] = []
  if (fromOpen && toOpen && slice.childCount === 1) {
    parts.push(buildShared($from, $to, depth + 1, edgeChild(slice, true)))
  } else {
    if (fromOpen) parts.push(buildLeft($from, depth + 1, edgeChild(slice, true)))
    const end = toOpen ? slice.childCount - 1 : slice.childCount
    for (let i = fromOpen ? 1 : 0; i < end; i++) parts.push(wholeChild(slice, i))
    if (toOpen) parts.push(buildRight($to, depth + 1, edgeChild(slice, false)))
  }
  const content = leftOf($from, depth).append(Fragment.fromArray(parts)).append(rightOf($to, depth))
  return close($from.node(depth), content)
}

function buildLeft($from: ResolvedPos, depth: number, slice: Node): Node {
  const open = depth < $from.depth
  const parts: Node[] = []
  if (open) parts.push(buildLeft($from, depth + 1, edgeChild(slice, true)))
  for (let i = open ? 1 : 0; i < slice.childCount; i++) parts.push(wholeChild(slice, i))
  return close($from.node(depth), leftOf($from, depth).append(Fragment.fromArray(parts)))
}

function buildRight($to: ResolvedPos, depth: number, slice: Node): Node {
  const open = depth < $to.depth
  const parts: Node[] = []
  const end = open ? slice.childCount - 1 : slice.childCount
  for (let i = 0; i < end; i++) parts.push(wholeChild(slice, i))
  if (open) parts.push(buildRight($to, depth + 1, edgeChild(slice, false)))
  return close(slice, Fragment.fromArray(parts).append(rightOf($to, depth)))
}
