import type { MarkType } from './schema.js'
import { attrsEqual, type Attrs } from './attrs.js'

/** JSON representation of a mark. */
export interface MarkJSON {
  type: string
  attrs?: Record<string, unknown>
}

/**
 * A mark is formatting attached to inline content (bold, italic, link…).
 * Mark sets are plain arrays kept sorted by the mark type rank.
 */
export class Mark {
  /** The empty mark set. */
  static readonly none: readonly Mark[] = []

  constructor(
    readonly type: MarkType,
    readonly attrs: Attrs,
  ) {}

  /** Returns a new set containing this mark, respecting rank order and exclusions. */
  addToSet(set: readonly Mark[]): readonly Mark[] {
    let copy: Mark[] | null = null
    let placed = false
    for (let i = 0; i < set.length; i++) {
      const other = set[i]!
      if (this.eq(other)) return set
      if (this.type.excludes(other.type)) {
        copy ??= set.slice(0, i)
        continue
      }
      if (other.type.excludes(this.type)) return set
      if (!placed && other.type.rank > this.type.rank) {
        copy ??= set.slice(0, i)
        copy.push(this)
        placed = true
      }
      copy?.push(other)
    }
    copy ??= set.slice()
    if (!placed) copy.push(this)
    return copy
  }

  /** Returns the set without this mark (by equality). */
  removeFromSet(set: readonly Mark[]): readonly Mark[] {
    const index = set.findIndex((m) => this.eq(m))
    return index < 0 ? set : [...set.slice(0, index), ...set.slice(index + 1)]
  }

  /** True when an equal mark is contained in the set. */
  isInSet(set: readonly Mark[]): boolean {
    return set.some((m) => this.eq(m))
  }

  eq(other: Mark): boolean {
    return this === other || (this.type === other.type && attrsEqual(this.attrs, other.attrs))
  }

  toJSON(): MarkJSON {
    const json: MarkJSON = { type: this.type.name }
    if (Object.keys(this.attrs).length) json.attrs = { ...this.attrs }
    return json
  }

  /** True when both sets contain the same marks. */
  static sameSet(a: readonly Mark[], b: readonly Mark[]): boolean {
    if (a === b) return true
    if (a.length !== b.length) return false
    return a.every((m, i) => m.eq(b[i]!))
  }

  /** Builds a sorted, normalized set from an arbitrary list of marks. */
  static setFrom(marks: Mark | readonly Mark[] | null | undefined): readonly Mark[] {
    if (!marks) return Mark.none
    if (marks instanceof Mark) return [marks]
    let set: readonly Mark[] = Mark.none
    for (const m of marks) set = m.addToSet(set)
    return set
  }
}
