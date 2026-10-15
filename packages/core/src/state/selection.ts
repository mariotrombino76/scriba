import type { Node } from '../model/node.js'
import type { ResolvedPos } from '../model/resolvedpos.js'
import { Slice } from '../model/slice.js'
import type { Mappable } from '../transform/map.js'
import type { Transform } from '../transform/transform.js'
import { crossesIsolating, deleteAcrossIsolating } from '../transform/isolating.js'

/** JSON form of a selection. */
export type SelectionJSON =
  | { type: 'text'; anchor: number; head: number }
  | { type: 'node'; anchor: number }
  | { type: 'all' }

/**
 * The user's selection. `anchor` is where it started, `head` where it ends
 * (they are swapped when selecting backwards); `from`/`to` are always ordered.
 */
export abstract class Selection {
  constructor(
    readonly $anchor: ResolvedPos,
    readonly $head: ResolvedPos,
  ) {}

  get anchor(): number {
    return this.$anchor.pos
  }
  get head(): number {
    return this.$head.pos
  }
  get from(): number {
    return Math.min(this.anchor, this.head)
  }
  get to(): number {
    return Math.max(this.anchor, this.head)
  }
  get $from(): ResolvedPos {
    return this.anchor <= this.head ? this.$anchor : this.$head
  }
  get $to(): ResolvedPos {
    return this.anchor <= this.head ? this.$head : this.$anchor
  }
  get empty(): boolean {
    return this.anchor === this.head
  }

  /** The selection after a document change. */
  abstract map(doc: Node, mapping: Mappable): Selection
  abstract eq(other: Selection): boolean
  abstract toJSON(): SelectionJSON

  /**
   * The DOM cannot show every kind of selection (a selected node, a block of
   * table cells…). When the view reads the DOM selection back, it keeps this
   * selection if this returns true for what it read.
   */
  preserves(_read: Selection): boolean {
    return false
  }

  /** The positions the DOM selection shows (a cell selection shows a text range from cell to cell). */
  domRange(): { anchor: number; head: number } {
    return { anchor: this.anchor, head: this.head }
  }

  /** The selected content. */
  content(): Slice {
    return this.$from.doc.slice(this.from, this.to)
  }

  /** Replaces the selection with a slice (deletes when empty) and puts the cursor after it. */
  replace(tr: Transform & { setSelection(sel: Selection): unknown }, slice = Slice.empty): void {
    const start = tr.steps.length
    if (crossesIsolating(tr.doc, this.from, this.to)) {
      // never join across a table border: delete the selected text on each side
      deleteAcrossIsolating(tr, this.from, this.to)
      // (this.from is never moved by those deletions: they all come after it)
      if (slice.size) tr.replace(this.from, this.from, slice)
      const end = tr.mapping.slice(start).map(this.from, 1)
      tr.setSelection(Selection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size)), -1))
      return
    }
    tr.delete(this.from, this.to)
    if (slice.size) tr.replace(tr.mapping.slice(start).map(this.from), undefined, slice)
    const end = tr.mapping.slice(start).map(this.to, 1)
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size)), -1))
  }

  /**
   * Nearest valid selection to a position, searching in `bias` direction first.
   * Falls back to selecting everything when the document has no cursor position.
   */
  static near($pos: ResolvedPos, bias = 1): Selection {
    return (
      Selection.findFrom($pos, bias) ??
      Selection.findFrom($pos, -bias) ??
      new AllSelection($pos.doc)
    )
  }

  /** First valid selection from `$pos` in direction `dir` (cursor in a textblock, or a selectable atom). */
  static findFrom($pos: ResolvedPos, dir: number, textOnly = false): Selection | null {
    if ($pos.parent.inlineContent) return new TextSelection($pos, $pos)
    const step = dir > 0 ? 1 : -1
    for (let d = $pos.depth; d >= 0; d--) {
      const parent = $pos.node(d)
      const index = $pos.index(d)
      // At the innermost depth `index` is the child after $pos; above it, the child containing $pos.
      const first = step > 0 ? (d === $pos.depth ? index : index + 1) : index - 1
      const starts = childStarts(parent, $pos.start(d))
      for (let i = first; i >= 0 && i < parent.childCount; i += step) {
        const found = selectionIn($pos.doc, parent.child(i), starts[i]!, step, textOnly)
        if (found) return found
      }
    }
    return null
  }

  static atStart(doc: Node): Selection {
    return Selection.findFrom(doc.resolve(0), 1) ?? new AllSelection(doc)
  }

  static atEnd(doc: Node): Selection {
    return Selection.findFrom(doc.resolve(doc.content.size), -1) ?? new AllSelection(doc)
  }

  /** Recreates a selection from JSON (untrusted: invalid positions throw). */
  static fromJSON(doc: Node, json: SelectionJSON): Selection {
    if (!json || typeof json !== 'object') throw new RangeError('Invalid selection JSON')
    switch (json.type) {
      case 'text':
        return TextSelection.create(doc, json.anchor, json.head)
      case 'node':
        return NodeSelection.create(doc, json.anchor)
      case 'all':
        return new AllSelection(doc)
      default:
        throw new RangeError('Invalid selection JSON')
    }
  }
}

/** Absolute start position of each child of `node`, whose content starts at `start`. */
function childStarts(node: Node, start: number): number[] {
  const starts: number[] = []
  node.forEach((_child, offset) => starts.push(start + offset))
  return starts
}

/** First valid selection inside `node` (which starts at `pos`), scanning in direction `step`. */
function selectionIn(
  doc: Node,
  node: Node,
  pos: number,
  step: number,
  textOnly: boolean,
): Selection | null {
  if (node.isTextblock)
    return TextSelection.create(doc, step > 0 ? pos + 1 : pos + node.nodeSize - 1)
  if (node.isAtom)
    return !textOnly && NodeSelection.isSelectable(node) ? NodeSelection.create(doc, pos) : null
  const starts = childStarts(node, pos + 1)
  for (let i = step > 0 ? 0 : node.childCount - 1; i >= 0 && i < node.childCount; i += step) {
    const found = selectionIn(doc, node.child(i), starts[i]!, step, textOnly)
    if (found) return found
  }
  return null
}

/** A cursor or a text range. Both ends must be inside inline content. */
export class TextSelection extends Selection {
  /** Cursor position when the selection is empty, else null. */
  get $cursor(): ResolvedPos | null {
    return this.empty ? this.$head : null
  }

  static create(doc: Node, anchor: number, head = anchor): TextSelection {
    const $anchor = doc.resolve(anchor)
    return new TextSelection($anchor, head === anchor ? $anchor : doc.resolve(head))
  }

  /** A text selection between two positions, moved to the nearest valid spots if needed. */
  static between($anchor: ResolvedPos, $head: ResolvedPos, bias?: number): Selection {
    const dir = bias ?? ($anchor.pos <= $head.pos ? 1 : -1)
    let $h = $head
    if (!$h.parent.inlineContent) {
      const found = Selection.findFrom($h, -dir, true) ?? Selection.findFrom($h, dir, true)
      if (!found) return Selection.near($h, dir)
      $h = found.$head
    }
    let $a = $anchor
    if (!$a.parent.inlineContent) {
      const found = Selection.findFrom($a, dir, true) ?? Selection.findFrom($a, -dir, true)
      if (!found) return Selection.near($a, dir)
      $a = found.$anchor
    }
    return new TextSelection($a, $h)
  }

  map(doc: Node, mapping: Mappable): Selection {
    const $head = doc.resolve(mapping.map(this.head))
    if (!$head.parent.inlineContent) return Selection.near($head)
    const $anchor = doc.resolve(mapping.map(this.anchor))
    return new TextSelection($anchor.parent.inlineContent ? $anchor : $head, $head)
  }

  eq(other: Selection): boolean {
    return (
      other instanceof TextSelection && other.anchor === this.anchor && other.head === this.head
    )
  }

  toJSON(): SelectionJSON {
    return { type: 'text', anchor: this.anchor, head: this.head }
  }
}

/** Selects a single node (e.g. an image or a horizontal rule). */
export class NodeSelection extends Selection {
  readonly node: Node

  constructor($pos: ResolvedPos) {
    const node = $pos.nodeAfter
    if (!node) throw new RangeError(`No node after position ${$pos.pos}`)
    super($pos, $pos.doc.resolve($pos.pos + node.nodeSize))
    this.node = node
  }

  static create(doc: Node, pos: number): NodeSelection {
    return new NodeSelection(doc.resolve(pos))
  }

  /** The DOM shows a node selection as a range around the node (or a caret next to it). */
  override preserves(read: Selection): boolean {
    if (read.empty) return true
    if (
      read.from <= this.from &&
      read.to >= this.to &&
      read.to - read.from <= this.to - this.from + 2
    )
      return true
    // A block node (e.g. a table) read back as the text range just inside it.
    const inner = TextSelection.between(this.$from, this.$to)
    return read.from === inner.from && read.to === inner.to
  }

  static isSelectable(node: Node): boolean {
    return !node.isText && node.type.spec['selectable'] !== false
  }

  map(doc: Node, mapping: Mappable): Selection {
    const r = mapping.mapResult(this.anchor, 1)
    const $pos = doc.resolve(r.pos)
    if (r.deleted || !$pos.nodeAfter) return Selection.near($pos)
    return new NodeSelection($pos)
  }

  eq(other: Selection): boolean {
    return other instanceof NodeSelection && other.anchor === this.anchor
  }

  toJSON(): SelectionJSON {
    return { type: 'node', anchor: this.anchor }
  }
}

/** Selects the whole document. */
export class AllSelection extends Selection {
  constructor(doc: Node) {
    super(doc.resolve(0), doc.resolve(doc.content.size))
  }

  override replace(
    tr: Transform & { setSelection(sel: Selection): unknown },
    slice = Slice.empty,
  ): void {
    const doc = tr.doc
    if (slice.size) {
      tr.replace(0, doc.content.size, slice)
    } else {
      const empty = doc.type.createAndFill()
      if (!empty) throw new RangeError('Cannot create an empty document')
      tr.replace(0, doc.content.size, new Slice(empty.content, 0, 0))
    }
    tr.setSelection(Selection.atStart(tr.doc))
  }

  map(doc: Node): Selection {
    return new AllSelection(doc)
  }

  eq(other: Selection): boolean {
    return other instanceof AllSelection
  }

  toJSON(): SelectionJSON {
    return { type: 'all' }
  }
}
