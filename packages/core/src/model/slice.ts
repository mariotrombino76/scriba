import { Fragment } from './fragment.js'
import type { NodeJSON } from './node.js'
import type { Schema } from './schema.js'

/** JSON representation of a slice. */
export interface SliceJSON {
  content?: NodeJSON[]
  openStart?: number
  openEnd?: number
}

/**
 * A piece of document: a fragment plus how many levels are "open" on each side.
 *
 * Example: selecting from the middle of paragraph A to the middle of paragraph B
 * gives two paragraphs with openStart = openEnd = 1, because the first paragraph
 * has no real start and the second no real end.
 */
export class Slice {
  static readonly empty = new Slice(Fragment.empty, 0, 0)

  constructor(
    readonly content: Fragment,
    readonly openStart: number,
    readonly openEnd: number,
  ) {}

  /** Size this slice adds to a document when inserted. */
  get size(): number {
    return this.content.size - this.openStart - this.openEnd
  }

  eq(other: Slice): boolean {
    return (
      this.content.eq(other.content) &&
      this.openStart === other.openStart &&
      this.openEnd === other.openEnd
    )
  }

  /** Slice with both sides open as far as possible (useful for pasting inline-ish content). */
  static maxOpen(fragment: Fragment): Slice {
    let openStart = 0
    let openEnd = 0
    for (let n = fragment.firstChild; n && !n.isLeaf; n = n.firstChild) openStart++
    for (let n = fragment.lastChild; n && !n.isLeaf; n = n.lastChild) openEnd++
    return new Slice(fragment, openStart, openEnd)
  }

  toJSON(): SliceJSON | null {
    if (!this.content.size) return null
    const json: SliceJSON = { content: this.content.toJSON() ?? [] }
    if (this.openStart) json.openStart = this.openStart
    if (this.openEnd) json.openEnd = this.openEnd
    return json
  }

  static fromJSON(schema: Schema, json: SliceJSON | null | undefined): Slice {
    if (!json) return Slice.empty
    const openStart = json.openStart ?? 0
    const openEnd = json.openEnd ?? 0
    if (
      !Number.isInteger(openStart) ||
      !Number.isInteger(openEnd) ||
      openStart < 0 ||
      openEnd < 0
    ) {
      throw new RangeError('Invalid slice JSON')
    }
    // Slices may hold incomplete nodes (e.g. an empty wrapper); `replace` validates on insertion.
    return new Slice(Fragment.fromJSON(schema, json.content, { partial: true }), openStart, openEnd)
  }
}
