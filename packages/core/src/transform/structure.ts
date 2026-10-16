import { Fragment } from '../model/fragment.js'
import type { Attrs } from '../model/attrs.js'
import type { Node } from '../model/node.js'
import type { ResolvedPos } from '../model/resolvedpos.js'
import type { NodeType } from '../model/schema.js'
import { Slice } from '../model/slice.js'
import { ReplaceAroundStep } from './replace-around-step.js'
import type { Transform } from './transform.js'

/**
 * A run of whole sibling blocks: the children [startIndex, endIndex) of the
 * node at `depth`. Built with `blockRange`.
 */
export class NodeRange {
  constructor(
    readonly $from: ResolvedPos,
    readonly $to: ResolvedPos,
    readonly depth: number,
  ) {}

  /** Position before the first block of the range. */
  get start(): number {
    return this.$from.depth > this.depth ? this.$from.before(this.depth + 1) : this.$from.pos
  }
  /** Position after the last block of the range. */
  get end(): number {
    return this.$to.depth > this.depth ? this.$to.after(this.depth + 1) : this.$to.pos
  }
  get parent(): Node {
    return this.$from.node(this.depth)
  }
  get startIndex(): number {
    return this.$from.index(this.depth)
  }
  get endIndex(): number {
    return this.$to.indexAfter(this.depth)
  }
}

/**
 * The range of whole blocks between two positions, at the deepest depth where
 * both are in the same parent (and `pred` accepts that parent).
 */
export function blockRange(
  $from: ResolvedPos,
  $to: ResolvedPos = $from,
  pred?: (node: Node) => boolean,
): NodeRange | null {
  if ($to.pos < $from.pos) return blockRange($to, $from, pred)
  const startDepth = $from.depth - ($from.parent.inlineContent || $from.pos === $to.pos ? 1 : 0)
  for (let d = startDepth; d >= 0; d--) {
    if ($to.pos <= $from.end(d) && (!pred || pred($from.node(d))))
      return new NodeRange($from, $to, d)
  }
  return null
}

/** True when `node`'s children [from, to) can be replaced by `content`. */
export function canReplace(
  node: Node,
  from: number,
  to: number,
  content: Fragment = Fragment.empty,
): boolean {
  const expr = node.type.contentExpr
  let state = expr.matchFragment(node.content, undefined, 0, from)
  if (state) state = expr.matchFragment(content, state)
  if (state) state = expr.matchFragment(node.content, state, to)
  if (!state || !expr.validEnd(state)) return false
  for (let i = 0; i < content.childCount; i++) {
    if (!node.type.allowsMarks(content.child(i).marks)) return false
  }
  return true
}

export interface Wrapper {
  type: NodeType
  attrs?: Record<string, unknown> | null
}

/**
 * Which nodes to wrap the range in to end up inside `type`, e.g. for a bullet
 * list around paragraphs: `[bullet_list, list_item]`. Null when not possible.
 */
export function findWrapping(
  range: NodeRange,
  type: NodeType,
  attrs?: Record<string, unknown> | null,
): Wrapper[] | null {
  const content = range.parent.content.cut(
    range.start - range.$from.start(range.depth),
    range.end - range.$from.start(range.depth),
  )
  let wrapper: NodeType | null = null
  let filled: Node | null
  try {
    filled = type.createAndFill(attrs)
  } catch {
    return null // invalid attributes
  }
  if (
    !filled ||
    !canReplace(range.parent, range.startIndex, range.endIndex, Fragment.from(filled))
  ) {
    return null
  }
  if (!type.validContent(content)) {
    // One level of inner wrapping, e.g. list_item inside a list.
    for (const inner of type.contentExpr.allowedTypes()) {
      if (inner.isText || inner.hasRequiredAttrs() || !inner.validContent(content)) continue
      if (type.validContent(Fragment.from(inner.create()))) {
        wrapper = inner
        break
      }
    }
    if (!wrapper) return null
  }
  return wrapper
    ? [{ type, attrs: attrs ?? null }, { type: wrapper }]
    : [{ type, attrs: attrs ?? null }]
}

/** Wraps the range in the given nodes (outermost first). */
export function wrap(tr: Transform, range: NodeRange, wrappers: readonly Wrapper[]): void {
  let content = Fragment.empty
  for (let i = wrappers.length - 1; i >= 0; i--) {
    const w = wrappers[i]!
    content = Fragment.from(w.type.create(w.attrs as Attrs | null, content))
  }
  const { start, end } = range
  tr.step(new ReplaceAroundStep(start, end, start, end, new Slice(content, 0, 0), wrappers.length))
}

/** True when splitting `node` around children [from, to) leaves valid parts. */
function canCut(node: Node, from: number, to: number): boolean {
  return (
    (from === 0 || canReplace(node, from, node.childCount)) &&
    (to === node.childCount || canReplace(node, 0, to))
  )
}

/**
 * Depth the range can be lifted to (out of its parent, possibly further),
 * or null. Isolating nodes (e.g. table cells) are never crossed.
 */
export function liftTarget(range: NodeRange): number | null {
  const content = range.parent.content.cut(
    range.start - range.$from.start(range.depth),
    range.end - range.$from.start(range.depth),
  )
  for (let depth = range.depth; ; depth--) {
    const node = range.$from.node(depth)
    const index = range.$from.index(depth)
    const endIndex = range.$to.indexAfter(depth)
    if (depth < range.depth && canReplace(node, index, endIndex, content)) return depth
    if (depth === 0 || node.type.spec.isolating || !canCut(node, index, endIndex)) return null
  }
}

/**
 * Moves the range's blocks out of their ancestors up to `target` depth,
 * splitting those ancestors when blocks remain before or after the range.
 */
export function lift(tr: Transform, range: NodeRange, target: number): void {
  const { $from, $to, depth } = range
  // range.start/end also work when $from/$to sit between blocks at `depth`
  const gapStart = range.start
  const gapEnd = range.end
  let start = gapStart
  let end = gapEnd

  let before = Fragment.empty
  let openStart = 0
  for (let d = depth, splitting = false; d > target; d--) {
    if (splitting || $from.index(d) > 0) {
      splitting = true
      before = Fragment.from($from.node(d).copy(before))
      openStart++
    } else {
      start-- // the ancestor starts with the range: drop its opening token
    }
  }
  let after = Fragment.empty
  let openEnd = 0
  for (let d = depth, splitting = false; d > target; d--) {
    if (splitting || (d === depth ? gapEnd : $to.after(d + 1)) < $to.end(d)) {
      splitting = true
      after = Fragment.from($to.node(d).copy(after))
      openEnd++
    } else {
      end++ // the ancestor ends with the range: drop its closing token
    }
  }
  tr.step(
    new ReplaceAroundStep(
      start,
      end,
      gapStart,
      gapEnd,
      new Slice(before.append(after), openStart, openEnd),
      before.size - openStart,
    ),
  )
}
