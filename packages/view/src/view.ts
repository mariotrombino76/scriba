import { Mark, NodeSelection, Selection, type EditorState, type Transaction } from '@scriba/core'
import { renderContent, updateDesc } from './build.js'
import { NodeViewDesc, domFromPos, posFromDOM, textblockDescOf } from './desc.js'
import { charsDiff, domChars, modelChars, LEAF_CHAR } from './dom-text.js'
import { attachInputHandlers } from './input.js'
import { readDOMSelection, writeDOMSelection } from './selection.js'

export interface EditorViewOptions {
  state: EditorState
  /** Receives every transaction. Default: `view.updateState(view.state.apply(tr))`. */
  dispatchTransaction?: (this: EditorView, tr: Transaction) => void
  /** Whether the content can be edited. Default: always. */
  editable?: (state: EditorState) => boolean
  /** Accessible name of the editing area (`aria-label`). */
  label?: string
}

/**
 * Shows an `EditorState` in the page and turns user input into transactions.
 * The browser never edits the DOM on its own: input is intercepted
 * (`beforeinput`), applied to the model, then the DOM is updated from it.
 */
export class EditorView {
  /** The contentEditable element. */
  readonly dom: HTMLElement
  state: EditorState
  /** True while an IME composition is in progress. @internal */
  composing = false
  private rootDesc: NodeViewDesc
  private readonly observer: MutationObserver
  private readonly detach: () => void
  private destroyed = false
  private readonly listeners = new Set<(view: EditorView) => void>()

  constructor(
    place: HTMLElement,
    readonly options: EditorViewOptions,
  ) {
    this.state = options.state
    const doc = place.ownerDocument
    this.dom = doc.createElement('div')
    this.dom.className = 'scriba-editor'
    this.dom.setAttribute('role', 'textbox')
    this.dom.setAttribute('aria-multiline', 'true')
    if (options.label) this.dom.setAttribute('aria-label', options.label)
    this.dom.setAttribute('translate', 'no')
    // CSSOM, not a style attribute: works under a strict CSP (§5.7).
    this.dom.style.whiteSpace = 'pre-wrap'
    this.dom.style.overflowWrap = 'break-word'
    this.updateEditable()
    place.appendChild(this.dom)

    this.rootDesc = new NodeViewDesc(this.state.doc, this.dom, this.dom)
    renderContent(doc, this.rootDesc)

    this.observer = new MutationObserver((records) => this.onDOMMutations(records))
    this.observer.observe(this.dom, { childList: true, characterData: true, subtree: true })
    this.detach = attachInputHandlers(this)
  }

  get document(): Document {
    return this.dom.ownerDocument
  }

  get editable(): boolean {
    return this.options.editable ? this.options.editable(this.state) : true
  }

  /** Applies a transaction through `dispatchTransaction`. */
  dispatch(tr: Transaction): void {
    if (this.destroyed) return
    if (this.options.dispatchTransaction) this.options.dispatchTransaction.call(this, tr)
    else this.updateState(this.state.apply(tr))
  }

  /** Shows a new state, updating only the parts of the DOM that changed. */
  updateState(state: EditorState): void {
    const prev = this.state
    this.state = state
    this.updateEditable()
    if (prev.doc !== state.doc) {
      this.domChange(() => {
        this.rootDesc = updateDesc(this.document, this.rootDesc, state.doc)
      })
    }
    if (!this.composing && this.hasFocus()) this.syncSelectionToDOM()
    for (const listener of this.listeners) listener(this)
  }

  /**
   * Calls `listener` after every state update (toolbars, counters…).
   * Returns a function that removes it.
   */
  subscribe(listener: (view: EditorView) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  focus(): void {
    this.dom.focus()
    this.syncSelectionToDOM()
  }

  hasFocus(): boolean {
    return this.document.activeElement === this.dom
  }

  /** Model position of a DOM point inside the editor. */
  posAtDOM(node: globalThis.Node, offset: number): number | null {
    return posFromDOM(this.rootDesc, node, offset)
  }

  /** DOM point of a model position. */
  domAtPos(pos: number): { node: globalThis.Node; offset: number } {
    return domFromPos(this.rootDesc, pos)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.listeners.clear()
    this.detach()
    this.observer.disconnect()
    this.dom.remove()
  }

  /** @internal Writes the model selection to the DOM. */
  syncSelectionToDOM(): void {
    const domSel = this.document.getSelection()
    const sel = this.state.selection
    this.dom
      .querySelectorAll('.scriba-selected-node')
      .forEach((el) => el.classList.remove('scriba-selected-node'))
    if (sel instanceof NodeSelection) {
      const { node, offset } = domFromPos(this.rootDesc, sel.from)
      const el = node.childNodes[offset]
      if (el && el.nodeType === 1) (el as HTMLElement).classList.add('scriba-selected-node')
    }
    writeDOMSelection(this.rootDesc, sel, domSel)
  }

  /** @internal Reads the DOM selection into the model (after clicks, arrow keys…). */
  syncSelectionFromDOM(): void {
    if (this.composing || !this.hasFocus()) return
    const sel = readDOMSelection(this.rootDesc, this.state.doc, this.document.getSelection())
    if (
      sel &&
      !sel.eq(this.state.selection) &&
      !(this.state.selection instanceof NodeSelection && sel.empty)
    ) {
      this.dispatch(this.state.tr.setSelection(sel))
    }
  }

  /** @internal Runs our own DOM changes and drops the mutation records they cause. */
  domChange(f: () => void): void {
    f()
    this.observer.takeRecords()
  }

  /**
   * @internal The browser changed the DOM itself (IME, spellcheck, extensions).
   * Read the text of the touched textblocks, turn the difference into a
   * transaction, then redraw them from the model.
   */
  onDOMMutations(records: readonly MutationRecord[]): void {
    if (this.composing || this.destroyed || !records.length) return
    const blocks = new Set<NodeViewDesc>()
    let structural = false
    for (const record of records) {
      const block = textblockDescOf(record.target, this.rootDesc)
      if (block) blocks.add(block)
      else structural = true
    }
    this.readDOMChanges([...blocks])
    if (structural) this.redrawAll()
  }

  /** @internal */
  readDOMChanges(blocks: NodeViewDesc[]): void {
    const tr = this.state.tr
    const schema = this.state.schema
    const stored = this.state.storedMarks
    const sorted = blocks
      .filter((b) => b.parent && this.dom.contains(b.dom))
      .map((b) => ({ desc: b, start: b.posAtContentStart() }))
      .sort((a, b) => b.start - a.start)
    let caret: number | null = null
    for (const { desc, start } of sorted) {
      const before = modelChars(desc.node)
      const after = domChars(desc, this.rootDesc)
      const diff = charsDiff(before, after)
      if (!diff) continue
      const inserted = after.text.slice(diff.start, diff.endB)
      if (inserted.includes(LEAF_CHAR)) continue // inline nodes cannot be recreated from text
      // Group the new chars into text nodes by marks (stored marks win: e.g. bold toggled before an IME session).
      const nodes = []
      for (let i = diff.start; i < diff.endB;) {
        const marks = stored ?? after.marks[i]!
        let j = i + 1
        while (j < diff.endB && (stored || Mark.sameSet(after.marks[j]!, marks))) j++
        const allowed = marks.filter((m) => desc.node.type.allowsMarkType(m.type))
        nodes.push(schema.text(after.text.slice(i, j), allowed))
        i = j
      }
      const from = start + diff.start
      tr.replaceWith(from, start + diff.endA, nodes)
      caret = from + inserted.length
    }
    if (tr.docChanged) {
      const sel = readDOMSelection(this.rootDesc, this.state.doc, this.document.getSelection())
      if (caret !== null && (!sel || sel.empty)) tr.setSelection(selectionNear(tr, caret))
      this.dispatch(tr)
    }
    // Redraw the touched blocks from the model: removes whatever markup the browser added.
    this.domChange(() => {
      for (const { desc } of sorted) {
        if (desc.parent && this.dom.contains(desc.dom)) renderContent(this.document, desc)
      }
    })
    if (this.hasFocus()) this.syncSelectionToDOM()
  }

  /** @internal Textblock containing the DOM selection anchor (e.g. the one being composed). */
  textblockDescAtDOMSelection(): NodeViewDesc | null {
    return textblockDescOf(this.document.getSelection()?.anchorNode ?? null, this.rootDesc)
  }

  /** @internal Re-renders everything from the model (after unexpected structural DOM edits). */
  redrawAll(): void {
    this.domChange(() => {
      this.rootDesc = new NodeViewDesc(this.state.doc, this.dom, this.dom)
      renderContent(this.document, this.rootDesc)
    })
    if (this.hasFocus()) this.syncSelectionToDOM()
  }

  private updateEditable(): void {
    const editable = this.editable
    this.dom.setAttribute('contenteditable', editable ? 'true' : 'false')
    this.dom.setAttribute('aria-readonly', editable ? 'false' : 'true')
  }
}

function selectionNear(tr: Transaction, pos: number): Selection {
  const size = tr.doc.content.size
  return Selection.near(tr.doc.resolve(Math.max(0, Math.min(pos, size))))
}
