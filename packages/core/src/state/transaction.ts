import { Fragment } from '../model/fragment.js'
import type { Mark } from '../model/mark.js'
import type { Node } from '../model/node.js'
import type { MarkType } from '../model/schema.js'
import { Slice } from '../model/slice.js'
import type { Step } from '../transform/step.js'
import { crossesIsolating, deleteAcrossIsolating } from '../transform/isolating.js'
import { Transform } from '../transform/transform.js'
import { Selection, TextSelection } from './selection.js'
import type { EditorState } from './state.js'

/**
 * A transform that also tracks selection, stored marks and metadata.
 * Created with `state.tr`, applied with `state.apply(tr)`.
 */
export class Transaction extends Transform {
  /** Timestamp, used e.g. by history to group changes. */
  time = Date.now()
  private curSelection: Selection
  private curSelectionFor = 0
  private updated = 0
  private meta = new Map<string, unknown>()
  /** Marks to apply to the next typed text (null = take them from the cursor). */
  storedMarks: readonly Mark[] | null

  private static readonly SELECTION = 1
  private static readonly MARKS = 2
  private static readonly SCROLL = 4

  constructor(state: EditorState) {
    super(state.doc)
    this.curSelection = state.selection
    this.storedMarks = state.storedMarks
  }

  /** Current selection, mapped through the steps added since it was set. */
  get selection(): Selection {
    if (this.curSelectionFor < this.steps.length) {
      this.curSelection = this.curSelection.map(this.doc, this.mapping.slice(this.curSelectionFor))
      this.curSelectionFor = this.steps.length
    }
    return this.curSelection
  }

  setSelection(selection: Selection): this {
    if (selection.$from.doc !== this.doc) {
      throw new RangeError('Selection passed to setSelection must point at the current document')
    }
    this.curSelection = selection
    this.curSelectionFor = this.steps.length
    this.updated = (this.updated | Transaction.SELECTION) & ~Transaction.MARKS
    this.storedMarks = null
    return this
  }

  get selectionSet(): boolean {
    return (this.updated & Transaction.SELECTION) > 0
  }

  setStoredMarks(marks: readonly Mark[] | null): this {
    this.storedMarks = marks
    this.updated |= Transaction.MARKS
    return this
  }

  get storedMarksSet(): boolean {
    return (this.updated & Transaction.MARKS) > 0
  }

  addStoredMark(mark: Mark): this {
    return this.setStoredMarks(mark.addToSet(this.storedMarks ?? this.selection.$head.marks()))
  }

  removeStoredMark(mark: Mark | MarkType): this {
    const current = this.storedMarks ?? this.selection.$head.marks()
    return this.setStoredMarks(mark.removeFromSet(current))
  }

  override maybeStep(step: Step): string | null {
    const failed = super.maybeStep(step)
    if (!failed && !this.storedMarksSet) this.storedMarks = null
    return failed
  }

  /** Replaces the selection with a slice. */
  replaceSelection(slice: Slice): this {
    this.selection.replace(this, slice)
    return this
  }

  /** Replaces the selection with a node; inline nodes inherit the marks at the cursor. */
  replaceSelectionWith(node: Node, inheritMarks = true): this {
    const selection = this.selection
    if (inheritMarks && node.isInline) {
      node = node.mark(this.storedMarks ?? selection.$from.marks())
    }
    selection.replace(this, new Slice(Fragment.from(node), 0, 0))
    return this
  }

  deleteSelection(): this {
    this.selection.replace(this)
    return this
  }

  /**
   * Inserts text, replacing [from, to) (default: the selection).
   * Marks come from stored marks, or from the text being replaced / the cursor.
   */
  insertText(text: string, from?: number, to = from): this {
    const useSelection = from === undefined
    const sel = this.selection
    const start = useSelection ? sel.from : from
    const end = useSelection ? sel.to : (to ?? start)
    const $start = this.doc.resolve(start)
    let marks = this.storedMarks
    if (!marks) marks = start === end ? $start.marks() : ($start.nodeAfter?.marks ?? $start.marks())
    if (crossesIsolating(this.doc, start, end)) deleteAcrossIsolating(this, start, end)
    else this.delete(start, end)
    if (text) {
      const $pos = this.doc.resolve(start)
      const parent = $pos.parent
      const allowed = marks.filter((m) => parent.type.allowsMarkType(m.type))
      this.insert(start, this.doc.type.schema.text(text, allowed))
    }
    if (useSelection) this.setSelection(TextSelection.create(this.doc, start + text.length))
    return this
  }

  setMeta(key: string | { readonly key: string }, value: unknown): this {
    this.meta.set(typeof key === 'string' ? key : key.key, value)
    return this
  }

  getMeta<T = unknown>(key: string | { readonly key: string }): T | undefined {
    return this.meta.get(typeof key === 'string' ? key : key.key) as T | undefined
  }

  /** Asks the view to scroll the selection into view after this transaction. */
  scrollIntoView(): this {
    this.updated |= Transaction.SCROLL
    return this
  }

  get scrolledIntoView(): boolean {
    return (this.updated & Transaction.SCROLL) > 0
  }

  /**
   * Takes the metadata, time and scroll request of `tr`, which this
   * transaction replaces (see `rewriteTransaction`). @internal
   */
  inherit(tr: Transaction): this {
    for (const [key, value] of tr.meta) if (!this.meta.has(key)) this.meta.set(key, value)
    this.time = tr.time
    if (tr.scrolledIntoView) this.scrollIntoView()
    return this
  }

  /** True when the transaction only carries metadata (no steps, no selection change). */
  get isGeneric(): boolean {
    return this.meta.size > 0 && !this.docChanged && !this.selectionSet
  }
}
