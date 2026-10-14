import { Fragment } from '../model/fragment.js'
import type { Node } from '../model/node.js'
import { Slice, type SliceJSON } from '../model/slice.js'
import { StepMap, type Mappable } from './map.js'
import { posField, Step, StepResult, type StepJSON } from './step.js'

/** Inserts `insert` into `content` at position `dist` (which may be nested). */
function insertInto(content: Fragment, dist: number, insert: Fragment): Fragment | null {
  const { index, offset } = content.findIndex(dist)
  const child = content.maybeChild(index)
  if (offset === dist || !child || child.isText) {
    return content.cut(0, dist).append(insert).append(content.cut(dist))
  }
  if (child.isLeaf) return null
  const inner = insertInto(child.content, dist - offset - 1, insert)
  return inner && content.replaceChild(index, child.copy(inner))
}

/** Removes [from, to) from `content`, keeping the nodes around it (which may be nested). */
function removeRange(content: Fragment, from: number, to: number): Fragment {
  const a = content.findIndex(from)
  const child = content.maybeChild(a.index)
  if (child && !child.isText && a.offset !== from) {
    const end = a.offset + child.nodeSize
    if (to <= end - 1) {
      const inner = removeRange(child.content, from - a.offset - 1, to - a.offset - 1)
      return content.replaceChild(a.index, child.copy(inner))
    }
  }
  return content.cut(0, from).append(content.cut(to))
}

/**
 * Replaces [from, to) with `slice`, but keeps the content in [gapFrom, gapTo)
 * and puts it back inside the slice at offset `insert`.
 *
 * Simple picture: put the blocks in a new box (wrap), or take them out of their
 * box (lift), without taking them apart. Positions inside the gap move but are
 * never "deleted", so cursors, undo and collaboration stay precise.
 *
 * Example — wrap p("a") in a blockquote:
 *   ReplaceAroundStep(0, 3, 0, 3, Slice(blockquote(), 0, 0), 1)
 */
export class ReplaceAroundStep extends Step {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly gapFrom: number,
    readonly gapTo: number,
    readonly slice: Slice,
    readonly insert: number,
  ) {
    super()
  }

  apply(doc: Node): StepResult {
    if (this.to > doc.content.size) return StepResult.fail('Replace range outside the document')
    const gap = doc.slice(this.gapFrom, this.gapTo)
    if (gap.openStart || gap.openEnd)
      return StepResult.fail('The gap of a ReplaceAroundStep must be closed')
    // `insert` counts like the slice size, i.e. after the open start tokens.
    const inserted = insertInto(this.slice.content, this.insert + this.slice.openStart, gap.content)
    if (!inserted) return StepResult.fail('Content does not fit in the gap')
    return StepResult.fromReplace(
      doc,
      this.from,
      this.to,
      new Slice(inserted, this.slice.openStart, this.slice.openEnd),
    )
  }

  getMap(): StepMap {
    return new StepMap([
      this.from,
      this.gapFrom - this.from,
      this.insert,
      this.gapTo,
      this.to - this.gapTo,
      this.slice.size - this.insert,
    ])
  }

  invert(doc: Node): Step {
    const gap = this.gapTo - this.gapFrom
    const removed = doc.slice(this.from, this.to)
    const outer = new Slice(
      removeRange(
        removed.content,
        this.gapFrom - this.from + removed.openStart,
        this.gapTo - this.from + removed.openStart,
      ),
      removed.openStart,
      removed.openEnd,
    )
    return new ReplaceAroundStep(
      this.from,
      this.from + this.slice.size + gap,
      this.from + this.insert,
      this.from + this.insert + gap,
      outer,
      this.gapFrom - this.from,
    )
  }

  map(mapping: Mappable): Step | null {
    const from = mapping.mapResult(this.from, 1)
    const to = mapping.mapResult(this.to, -1)
    const gapFrom = this.from === this.gapFrom ? from.pos : mapping.map(this.gapFrom, -1)
    const gapTo = this.to === this.gapTo ? to.pos : mapping.map(this.gapTo, 1)
    if ((from.deletedAfter && to.deletedBefore) || gapFrom < from.pos || gapTo > to.pos) return null
    return new ReplaceAroundStep(from.pos, to.pos, gapFrom, gapTo, this.slice, this.insert)
  }

  toJSON(): StepJSON {
    const json: StepJSON = {
      stepType: 'replaceAround',
      from: this.from,
      to: this.to,
      gapFrom: this.gapFrom,
      gapTo: this.gapTo,
      insert: this.insert,
    }
    const slice = this.slice.toJSON()
    if (slice) json['slice'] = slice
    return json
  }
}

Step.register('replaceAround', (schema, json) => {
  const from = posField(json, 'from')
  const to = posField(json, 'to')
  const gapFrom = posField(json, 'gapFrom')
  const gapTo = posField(json, 'gapTo')
  const insert = posField(json, 'insert')
  if (!(from <= gapFrom && gapFrom <= gapTo && gapTo <= to)) {
    throw new RangeError('Invalid ranges in replaceAround step JSON')
  }
  const slice = Slice.fromJSON(schema, json['slice'] as SliceJSON | undefined)
  if (insert > slice.size)
    throw new RangeError('Invalid insert position in replaceAround step JSON')
  return new ReplaceAroundStep(from, to, gapFrom, gapTo, slice, insert)
})
