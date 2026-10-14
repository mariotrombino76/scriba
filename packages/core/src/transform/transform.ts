import { Fragment } from '../model/fragment.js'
import type { Mark } from '../model/mark.js'
import type { Node } from '../model/node.js'
import { MarkType, type NodeType } from '../model/schema.js'
import { Slice } from '../model/slice.js'
import { SetAttrsStep, SetNodeTypeStep } from './attr-step.js'
import { deleteRangeSlice } from './delete-range.js'
import { Mapping } from './map.js'
import { AddMarkStep, RemoveMarkStep } from './mark-step.js'
import { ReplaceStep } from './replace-step.js'
import type { Step } from './step.js'
import { lift as liftRange, wrap as wrapRange, type NodeRange, type Wrapper } from './structure.js'

/** Thrown when a transform helper produces a step that cannot be applied. */
export class TransformError extends Error {
  override name = 'TransformError'
}

/**
 * Builds a list of steps on top of a starting document.
 * Each helper appends steps; `doc` is always the latest document.
 */
export class Transform {
  readonly steps: Step[] = []
  /** Document before each step. */
  readonly docs: Node[] = []
  readonly mapping = new Mapping()
  private current: Node

  constructor(readonly before: Node) {
    this.current = before
  }

  get doc(): Node {
    return this.current
  }

  get docChanged(): boolean {
    return this.steps.length > 0
  }

  /** Applies a step, throwing `TransformError` on failure. */
  step(step: Step): this {
    const failed = this.maybeStep(step)
    if (failed) throw new TransformError(failed)
    return this
  }

  /** Applies a step; returns the failure message instead of throwing. */
  maybeStep(step: Step): string | null {
    const result = step.apply(this.current)
    if (!result.doc) return result.failed
    this.docs.push(this.current)
    this.steps.push(step)
    this.mapping.appendMap(step.getMap())
    this.current = result.doc
    return null
  }

  replace(from: number, to = from, slice = Slice.empty): this {
    if (from === to && !slice.size) return this
    return this.step(new ReplaceStep(from, to, slice))
  }

  replaceWith(from: number, to: number, content: Fragment | Node | readonly Node[]): this {
    return this.replace(from, to, new Slice(Fragment.from(content), 0, 0))
  }

  insert(pos: number, content: Fragment | Node | readonly Node[]): this {
    return this.replaceWith(pos, pos, content)
  }

  /** Deletes [from, to). Works across blocks of different depth, joining the edge textblocks. */
  delete(from: number, to: number): this {
    if (from === to) return this
    const $from = this.current.resolve(from)
    const $to = this.current.resolve(to)
    const plan = deleteRangeSlice($from, $to)
    if (!plan) throw new TransformError(`Cannot delete range ${from}-${to}`)
    return this.replace(from, plan.to, plan.slice)
  }

  /** Adds a mark to [from, to), only where it is missing, removing marks it excludes. */
  addMark(from: number, to: number, mark: Mark): this {
    const removed: { from: number; to: number; mark: Mark }[] = []
    const added: { from: number; to: number }[] = []
    this.current.nodesBetween(from, to, (node, pos, parent) => {
      if (!node.isInline || !parent?.type.allowsMarkType(mark.type)) return
      const start = Math.max(pos, from)
      const end = Math.min(pos + node.nodeSize, to)
      if (mark.isInSet(node.marks)) return
      for (const m of node.marks) {
        if (mark.type.excludes(m.type)) removed.push({ from: start, to: end, mark: m })
      }
      const last = added[added.length - 1]
      if (last && last.to === start) last.to = end
      else added.push({ from: start, to: end })
    })
    for (const r of removed) this.step(new RemoveMarkStep(r.from, r.to, r.mark))
    for (const a of added) this.step(new AddMarkStep(a.from, a.to, mark))
    return this
  }

  /** Removes a mark (or all marks of a type, or all marks) from [from, to). */
  removeMark(from: number, to: number, mark?: Mark | MarkType | null): this {
    const ranges: { from: number; to: number; mark: Mark }[] = []
    this.current.nodesBetween(from, to, (node, pos) => {
      if (!node.isInline) return
      const toRemove = !mark
        ? node.marks
        : mark instanceof MarkType
          ? node.marks.filter((m) => m.type === mark)
          : node.marks.filter((m) => m.eq(mark))
      const start = Math.max(pos, from)
      const end = Math.min(pos + node.nodeSize, to)
      for (const m of toRemove) {
        const prev = ranges.find((r) => r.mark.eq(m) && r.to === start)
        if (prev) prev.to = end
        else ranges.push({ from: start, to: end, mark: m })
      }
    })
    for (const r of ranges) this.step(new RemoveMarkStep(r.from, r.to, r.mark))
    return this
  }

  /** Sets attributes of the node at `pos`, merged with the current ones. */
  setNodeAttrs(pos: number, attrs: Record<string, unknown>): this {
    const node = this.current.nodeAt(pos)
    if (!node) throw new TransformError(`No node at position ${pos}`)
    return this.step(new SetAttrsStep(pos, { ...node.attrs, ...attrs }))
  }

  /** Changes every textblock in [from, to) to `type`, dropping content the new type forbids. */
  setBlockType(
    from: number,
    to: number,
    type: NodeType,
    attrs?: Record<string, unknown> | null,
  ): this {
    if (!type.isTextblock) throw new TransformError('setBlockType needs a textblock type')
    const targets: number[] = []
    this.current.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true
      if (!node.hasMarkup(type, type.computeAttrs(attrs))) targets.push(pos)
      return false
    })
    // Back to front, so earlier positions stay valid.
    for (let i = targets.length - 1; i >= 0; i--) {
      const pos = targets[i]!
      this.clearIncompatible(pos, type)
      this.step(new SetNodeTypeStep(pos, type, attrs ?? null))
    }
    return this
  }

  /** Removes marks and inline nodes that `type` would not accept from the block at `pos`. */
  clearIncompatible(pos: number, type: NodeType): this {
    const node = this.current.nodeAt(pos)!
    const start = pos + 1
    const deletions: [number, number][] = []
    node.forEach((child, offset) => {
      const at = start + offset
      if (!type.canContain(child.type)) {
        deletions.push([at, at + child.nodeSize])
        return
      }
      for (const m of child.marks) {
        if (!type.allowsMarkType(m.type)) this.step(new RemoveMarkStep(at, at + child.nodeSize, m))
      }
    })
    for (let i = deletions.length - 1; i >= 0; i--) this.replace(deletions[i]![0], deletions[i]![1])
    return this
  }

  /**
   * Splits the node(s) at `pos`, `depth` levels deep.
   * `typesAfter` optionally gives the type of each new node, innermost first.
   */
  split(
    pos: number,
    depth = 1,
    typesAfter?: readonly ({ type: NodeType; attrs?: Record<string, unknown> | null } | null)[],
  ): this {
    const $pos = this.current.resolve(pos)
    let before = Fragment.empty
    let after = Fragment.empty
    for (let d = $pos.depth, i = 0; d > $pos.depth - depth; d--, i++) {
      const node = $pos.node(d)
      before = Fragment.from(node.copy(before))
      const t = typesAfter?.[i]
      after = Fragment.from(t ? t.type.create(t.attrs, after) : node.copy(after))
    }
    return this.step(new ReplaceStep(pos, pos, new Slice(before.append(after), depth, depth)))
  }

  /** Wraps a range of blocks in the given nodes (outermost first). */
  wrap(range: NodeRange, wrappers: readonly Wrapper[]): this {
    wrapRange(this, range, wrappers)
    return this
  }

  /** Lifts a range of blocks out of its ancestors, up to `target` depth. */
  lift(range: NodeRange, target: number): this {
    liftRange(this, range, target)
    return this
  }

  /** Joins the blocks on either side of `pos` (`depth` levels deep). */
  join(pos: number, depth = 1): this {
    return this.step(new ReplaceStep(pos - depth, pos + depth, Slice.empty))
  }
}
