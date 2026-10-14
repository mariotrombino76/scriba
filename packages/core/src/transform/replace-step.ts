import type { Node } from '../model/node.js'
import { Slice, type SliceJSON } from '../model/slice.js'
import { StepMap, type Mappable } from './map.js'
import { posField, Step, StepResult, type StepJSON } from './step.js'

/** Replaces the range [from, to) with a slice. Covers insertion, deletion and splitting. */
export class ReplaceStep extends Step {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly slice: Slice,
  ) {
    super()
  }

  apply(doc: Node): StepResult {
    if (this.to > doc.content.size) return StepResult.fail('Replace range outside the document')
    return StepResult.fromReplace(doc, this.from, this.to, this.slice)
  }

  getMap(): StepMap {
    return StepMap.replace(this.from, this.to, this.slice.size)
  }

  invert(doc: Node): Step {
    return new ReplaceStep(this.from, this.from + this.slice.size, doc.slice(this.from, this.to))
  }

  map(mapping: Mappable): Step | null {
    const from = mapping.mapResult(this.from, 1)
    const to = mapping.mapResult(this.to, -1)
    if (from.deletedAfter && to.deletedBefore && this.from !== this.to) return null
    return new ReplaceStep(from.pos, Math.max(from.pos, to.pos), this.slice)
  }

  /** Merges consecutive flat edits: typing forward, or deleting backwards/forwards. */
  override merge(other: Step): Step | null {
    if (!(other instanceof ReplaceStep)) return null
    const flat = (s: Slice) => !s.openStart && !s.openEnd
    if (!flat(this.slice) || !flat(other.slice)) return null
    // typing: "a" then "b" right after it
    if (this.from + this.slice.size === other.from) {
      const content = this.slice.content.append(other.slice.content)
      return new ReplaceStep(this.from, this.to + (other.to - other.from), new Slice(content, 0, 0))
    }
    // backspace: deleting the range right before this one
    if (other.to === this.from && !this.slice.size) {
      const content = other.slice.content.append(this.slice.content)
      return new ReplaceStep(other.from, this.to, new Slice(content, 0, 0))
    }
    return null
  }

  toJSON(): StepJSON {
    const json: StepJSON = { stepType: 'replace', from: this.from, to: this.to }
    const slice = this.slice.toJSON()
    if (slice) json['slice'] = slice
    return json
  }
}

Step.register('replace', (schema, json) => {
  const from = posField(json, 'from')
  const to = posField(json, 'to')
  if (to < from) throw new RangeError('Invalid replace range in step JSON')
  return new ReplaceStep(from, to, Slice.fromJSON(schema, json['slice'] as SliceJSON | undefined))
})
