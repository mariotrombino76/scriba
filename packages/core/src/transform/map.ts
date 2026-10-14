/** Result of mapping a position, with information about deleted content around it. */
export interface MapResult {
  readonly pos: number
  /** The content on the `assoc` side of the position was deleted. */
  readonly deleted: boolean
  /** The token before the position was deleted. */
  readonly deletedBefore: boolean
  /** The token after the position was deleted. */
  readonly deletedAfter: boolean
}

/** Anything that maps positions through document changes. */
export interface Mappable {
  map(pos: number, assoc?: number): number
  mapResult(pos: number, assoc?: number): MapResult
}

/**
 * How positions move through one step.
 *
 * Simple picture: a list of "here N tokens were replaced by M tokens".
 * Stored as flat triples `[start, oldSize, newSize]` in old-document coordinates.
 * `assoc` decides which side a position sticks to when content is inserted
 * exactly at it: -1 = stay before the insertion, 1 = move after it.
 */
export class StepMap implements Mappable {
  static readonly empty = new StepMap([])

  constructor(
    readonly ranges: readonly number[],
    private readonly inverted = false,
  ) {}

  /** Map for "replace [from, to) with `size` tokens". */
  static replace(from: number, to: number, size: number): StepMap {
    return from === to && size === 0 ? StepMap.empty : new StepMap([from, to - from, size])
  }

  map(pos: number, assoc = 1): number {
    return this.mapResult(pos, assoc).pos
  }

  mapResult(pos: number, assoc = 1): MapResult {
    let diff = 0
    const oldIdx = this.inverted ? 2 : 1
    const newIdx = this.inverted ? 1 : 2
    for (let i = 0; i < this.ranges.length; i += 3) {
      const start = this.ranges[i]! - (this.inverted ? diff : 0)
      if (start > pos) break
      const oldSize = this.ranges[i + oldIdx]!
      const newSize = this.ranges[i + newIdx]!
      const end = start + oldSize
      if (pos <= end) {
        const side = !oldSize ? assoc : pos === start ? -1 : pos === end ? 1 : assoc
        const mapped = start + diff + (side < 0 ? 0 : newSize)
        const deletedBefore = oldSize > 0 && pos > start
        const deletedAfter = oldSize > 0 && pos < end
        return {
          pos: mapped,
          deleted: assoc < 0 ? deletedBefore : deletedAfter,
          deletedBefore,
          deletedAfter,
        }
      }
      diff += newSize - oldSize
    }
    return { pos: pos + diff, deleted: false, deletedBefore: false, deletedAfter: false }
  }

  /** Calls `f` for each changed range, in old and new coordinates. */
  forEach(f: (oldStart: number, oldEnd: number, newStart: number, newEnd: number) => void): void {
    const oldIdx = this.inverted ? 2 : 1
    const newIdx = this.inverted ? 1 : 2
    let diff = 0
    for (let i = 0; i < this.ranges.length; i += 3) {
      const start = this.ranges[i]!
      const oldStart = start - (this.inverted ? diff : 0)
      const newStart = start + (this.inverted ? 0 : diff)
      const oldSize = this.ranges[i + oldIdx]!
      const newSize = this.ranges[i + newIdx]!
      f(oldStart, oldStart + oldSize, newStart, newStart + newSize)
      diff += newSize - oldSize
    }
  }

  invert(): StepMap {
    return new StepMap(this.ranges, !this.inverted)
  }
}

/** A sequence of step maps, applied in order. */
export class Mapping implements Mappable {
  constructor(
    readonly maps: StepMap[] = [],
    public from = 0,
    public to = maps.length,
  ) {}

  appendMap(map: StepMap): void {
    this.maps.push(map)
    this.to = this.maps.length
  }

  appendMapping(mapping: Mapping): void {
    for (let i = mapping.from; i < mapping.to; i++) this.appendMap(mapping.maps[i]!)
  }

  /** Sub-mapping over a range of the maps. */
  slice(from = 0, to = this.maps.length): Mapping {
    return new Mapping(this.maps, from, to)
  }

  /** Mapping that undoes this one (maps in reverse, inverted). */
  invert(): Mapping {
    const maps: StepMap[] = []
    for (let i = this.to - 1; i >= this.from; i--) maps.push(this.maps[i]!.invert())
    return new Mapping(maps)
  }

  map(pos: number, assoc = 1): number {
    for (let i = this.from; i < this.to; i++) pos = this.maps[i]!.map(pos, assoc)
    return pos
  }

  mapResult(pos: number, assoc = 1): MapResult {
    let deleted = false
    let deletedBefore = false
    let deletedAfter = false
    for (let i = this.from; i < this.to; i++) {
      const r = this.maps[i]!.mapResult(pos, assoc)
      pos = r.pos
      deleted ||= r.deleted
      deletedBefore ||= r.deletedBefore
      deletedAfter ||= r.deletedAfter
    }
    return { pos, deleted, deletedBefore, deletedAfter }
  }
}
