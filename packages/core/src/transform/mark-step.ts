import { Fragment } from '../model/fragment.js'
import type { Mark, MarkJSON } from '../model/mark.js'
import type { Node } from '../model/node.js'
import { Slice } from '../model/slice.js'
import { StepMap, type Mappable } from './map.js'
import { posField, Step, StepResult, type StepJSON } from './step.js'

/** Applies `f` to every inline node in a fragment, recursing into blocks. */
function mapInline(frag: Fragment, parent: Node, f: (node: Node, parent: Node) => Node): Fragment {
  const out: Node[] = []
  frag.forEach((child) => {
    let node = child
    if (child.content.size) node = child.copy(mapInline(child.content, child, f))
    if (node.isInline) node = f(node, parent)
    out.push(node)
  })
  return Fragment.fromArray(out)
}

function mapRange(
  doc: Node,
  from: number,
  to: number,
  f: (node: Node, parent: Node) => Node,
): StepResult {
  if (from >= to || to > doc.content.size) return StepResult.fail('Invalid mark range')
  const old = doc.slice(from, to)
  const $from = doc.resolve(from)
  const parent = $from.node($from.sharedDepth(to))
  const slice = new Slice(mapInline(old.content, parent, f), old.openStart, old.openEnd)
  return StepResult.fromReplace(doc, from, to, slice)
}

function mapMarkRange(mapping: Mappable, from: number, to: number): [number, number] | null {
  const $from = mapping.mapResult(from, 1)
  const $to = mapping.mapResult(to, -1)
  if (($from.deletedAfter && $to.deletedBefore) || $from.pos >= $to.pos) return null
  return [$from.pos, $to.pos]
}

/** Adds a mark to all inline content in [from, to) where the parent allows it. */
export class AddMarkStep extends Step {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly mark: Mark,
  ) {
    super()
  }

  apply(doc: Node): StepResult {
    return mapRange(doc, this.from, this.to, (node, parent) =>
      parent.type.allowsMarkType(this.mark.type) ? node.mark(this.mark.addToSet(node.marks)) : node,
    )
  }

  getMap(): StepMap {
    return StepMap.empty
  }

  invert(): Step {
    return new RemoveMarkStep(this.from, this.to, this.mark)
  }

  map(mapping: Mappable): Step | null {
    const range = mapMarkRange(mapping, this.from, this.to)
    return range && new AddMarkStep(range[0], range[1], this.mark)
  }

  override merge(other: Step): Step | null {
    if (
      other instanceof AddMarkStep &&
      other.mark.eq(this.mark) &&
      this.from <= other.to &&
      this.to >= other.from
    ) {
      return new AddMarkStep(
        Math.min(this.from, other.from),
        Math.max(this.to, other.to),
        this.mark,
      )
    }
    return null
  }

  toJSON(): StepJSON {
    return { stepType: 'addMark', from: this.from, to: this.to, mark: this.mark.toJSON() }
  }
}

/** Removes a mark from all inline content in [from, to). */
export class RemoveMarkStep extends Step {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly mark: Mark,
  ) {
    super()
  }

  apply(doc: Node): StepResult {
    return mapRange(doc, this.from, this.to, (node) =>
      node.mark(this.mark.removeFromSet(node.marks)),
    )
  }

  getMap(): StepMap {
    return StepMap.empty
  }

  invert(): Step {
    return new AddMarkStep(this.from, this.to, this.mark)
  }

  map(mapping: Mappable): Step | null {
    const range = mapMarkRange(mapping, this.from, this.to)
    return range && new RemoveMarkStep(range[0], range[1], this.mark)
  }

  override merge(other: Step): Step | null {
    if (
      other instanceof RemoveMarkStep &&
      other.mark.eq(this.mark) &&
      this.from <= other.to &&
      this.to >= other.from
    ) {
      return new RemoveMarkStep(
        Math.min(this.from, other.from),
        Math.max(this.to, other.to),
        this.mark,
      )
    }
    return null
  }

  toJSON(): StepJSON {
    return { stepType: 'removeMark', from: this.from, to: this.to, mark: this.mark.toJSON() }
  }
}

function readMarkStep(json: StepJSON): { from: number; to: number; mark: MarkJSON } {
  const from = posField(json, 'from')
  const to = posField(json, 'to')
  if (to <= from) throw new RangeError('Invalid mark range in step JSON')
  return { from, to, mark: json['mark'] as MarkJSON }
}

Step.register('addMark', (schema, json) => {
  const { from, to, mark } = readMarkStep(json)
  return new AddMarkStep(from, to, schema.markFromJSON(mark))
})

Step.register('removeMark', (schema, json) => {
  const { from, to, mark } = readMarkStep(json)
  return new RemoveMarkStep(from, to, schema.markFromJSON(mark))
})
