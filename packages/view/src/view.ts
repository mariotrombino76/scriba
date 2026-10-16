import {
  Mark,
  NodeSelection,
  Selection,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@scriba/core'
import { renderContent, updateDesc, type RenderContext } from './build.js'
import { DecorationIndex, stateDecorations } from './decorations.js'
import { NodeViewDesc, descAt, domFromPos, posFromDOM, textblockDescOf } from './desc.js'
import { charsDiff, domChars, modelChars, LEAF_CHAR } from './dom-text.js'
import { attachInputHandlers } from './input.js'
import {
  NODE_VIEW_ATTR,
  defaultStopEvent,
  inNodeViewChrome,
  type NodeViewFactory,
} from './node-view.js'
import { someProp, type PluginView, type ViewPluginProps } from './plugin-hooks.js'
import { readDOMSelection, writeDOMSelection } from './selection.js'

export interface EditorViewOptions {
  state: EditorState
  /** Receives every transaction. Default: `view.updateState(view.state.apply(tr))`. */
  dispatchTransaction?: (this: EditorView, tr: Transaction) => void
  /** Whether the content can be edited. Default: always. */
  editable?: (state: EditorState) => boolean
  /**
   * When not editable: whether the user may still comment (add or remove
   * annotation marks, see `isAnnotationOnly`). The caret then moves through
   * the text so selections can be made with the keyboard. Default: never.
   */
  canAnnotate?: (state: EditorState) => boolean
  /** Accessible name of the editing area (`aria-label`). */
  label?: string
  /**
   * Custom views of atomic node types, by type name (e.g. a Vue component,
   * see `vueNodeView` in `@scriba/vue`). Other node types use `toHTML`.
   */
  nodeViews?: Readonly<Record<string, NodeViewFactory>>
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
  /** Counts compositions, so a late compositionend does not end a newer one. @internal */
  compositionId = 0
  private rootDesc: NodeViewDesc
  private readonly observer: MutationObserver
  private readonly detach: () => void
  private destroyed = false
  private readonly listeners = new Set<(view: EditorView) => void>()
  private decorations: DecorationIndex = DecorationIndex.empty
  private plainPasteUntil = 0
  private readonly pluginViews: PluginView[] = []
  private readonly customViews = new Set<NodeViewDesc>()
  private selectedCustom: NodeViewDesc | null = null

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

    this.decorations = stateDecorations(this.state)
    this.rootDesc = new NodeViewDesc(this.state.doc, this.dom, this.dom)
    renderContent(doc, this.rootDesc, 0, this.context)

    this.observer = new MutationObserver((records) => this.onDOMMutations(records))
    this.observer.observe(this.dom, { childList: true, characterData: true, subtree: true })
    this.detach = attachInputHandlers(this)
    for (const plugin of this.state.plugins) {
      const create = plugin.props['pluginView'] as ViewPluginProps['pluginView']
      if (typeof create === 'function') this.pluginViews.push(create(this))
    }
  }

  get document(): Document {
    return this.dom.ownerDocument
  }

  get editable(): boolean {
    return this.options.editable ? this.options.editable(this.state) : true
  }

  /** Editable, or read-only but allowed to comment. */
  get canAnnotate(): boolean {
    return this.editable || (this.options.canAnnotate?.(this.state) ?? false)
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
    const prevDecorations = this.decorations
    this.decorations = stateDecorations(state)
    if (prev.doc !== state.doc) {
      this.domChange(() => {
        this.rootDesc = updateDesc(this.document, this.rootDesc, state.doc, 0, this.context)
      })
    }
    // Blocks whose decorations changed while their node did not (e.g. search highlights).
    if (!this.composing)
      this.redrawDecorated(DecorationIndex.changedBlocks(prevDecorations, this.decorations))
    if (!this.composing && this.hasFocus()) this.syncSelectionToDOM()
    this.updateSelectedCustom()
    for (const pluginView of this.pluginViews) pluginView.update?.(this, prev)
    for (const listener of this.listeners) listener(this)
  }

  /**
   * Document position at viewport coordinates (e.g. a drop point), or null
   * when the point is not over the content.
   */
  posAtCoords(x: number, y: number): number | null {
    const doc = this.document as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: globalThis.Node; offset: number } | null
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    let node: globalThis.Node | null = null
    let offset = 0
    const position = doc.caretPositionFromPoint?.(x, y)
    if (position) {
      node = position.offsetNode
      offset = position.offset
    } else {
      const range = doc.caretRangeFromPoint?.(x, y)
      if (range) {
        node = range.startContainer
        offset = range.startOffset
      }
    }
    if (!node || !this.dom.contains(node)) return null
    return this.posAtDOM(node, offset)
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

  /**
   * Viewport rectangle of the position (a caret-sized box), e.g. to place a
   * popup next to the cursor. Uses the character after the position when there
   * is one (collapsed ranges have no box in some browsers).
   */
  coordsAtPos(pos: number): { left: number; right: number; top: number; bottom: number } {
    const range = this.document.createRange()
    const { node, offset } = this.domAtPos(pos)
    let rect: DOMRect | null = null
    if (node.nodeType === 3) {
      const text = node.nodeValue ?? ''
      if (offset < text.length) {
        range.setStart(node, offset)
        range.setEnd(node, offset + 1)
        rect = range.getClientRects?.()[0] ?? null
        if (rect) return { left: rect.left, right: rect.left, top: rect.top, bottom: rect.bottom }
      }
      if (offset > 0) {
        range.setStart(node, offset - 1)
        range.setEnd(node, offset)
        rect = range.getClientRects?.()[0] ?? null
        if (rect) return { left: rect.right, right: rect.right, top: rect.top, bottom: rect.bottom }
      }
    }
    // empty block or element position: the block's own box
    const el = (node.nodeType === 1 ? node : node.parentNode) as Element | null
    const box = (el?.nodeType === 1 ? el : this.dom).getBoundingClientRect()
    return {
      left: box.left,
      right: box.left,
      top: box.top,
      bottom: box.top + Math.min(box.height, 24),
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const pluginView of this.pluginViews) pluginView.destroy?.()
    this.pluginViews.length = 0
    this.listeners.clear()
    this.detach()
    this.observer.disconnect()
    for (const desc of this.customViews) this.dropCustom(desc)
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
      const dom = descAt(this.rootDesc, sel.from)?.dom
      if (dom && dom.nodeType === 1) (dom as HTMLElement).classList.add('scriba-selected-node')
    }
    writeDOMSelection(this.rootDesc, sel, domSel)
  }

  /** @internal Reads the DOM selection into the model (after clicks, arrow keys…). */
  syncSelectionFromDOM(): void {
    if (this.composing || !this.hasFocus()) return
    const sel = readDOMSelection(this.rootDesc, this.state.doc, this.document.getSelection())
    if (sel && !sel.eq(this.state.selection) && !this.state.selection.preserves(sel)) {
      this.dispatch(this.state.tr.setSelection(sel))
    }
  }

  /** @internal Runs our own DOM changes and drops the mutation records they cause. */
  domChange(f: () => void): void {
    f()
    this.observer.takeRecords()
    // node views no longer in the document are destroyed
    for (const desc of this.customViews) if (!this.dom.contains(desc.dom)) this.dropCustom(desc)
  }

  private dropCustom(desc: NodeViewDesc): void {
    this.customViews.delete(desc)
    if (this.selectedCustom === desc) this.selectedCustom = null
    desc.gone = true
    desc.custom?.destroy?.()
  }

  /** Tells node views when they become (or stop being) the selected node. */
  private updateSelectedCustom(): void {
    const sel = this.state.selection
    const desc = sel instanceof NodeSelection ? descAt(this.rootDesc, sel.from) : null
    const next = desc?.custom ? desc : null
    if (next === this.selectedCustom) return
    this.selectedCustom?.custom?.deselectNode?.()
    this.selectedCustom = next
    next?.custom?.selectNode?.()
  }

  /** The DOM element of the node at `pos` (a block, an atom…), or null. */
  nodeDOM(pos: number): HTMLElement | null {
    const dom = descAt(this.rootDesc, pos)?.dom
    return dom && dom.nodeType === 1 ? (dom as HTMLElement) : null
  }

  /** @internal Whether an event comes from inside a node view and must be left alone. */
  eventInNodeView(event: Event): boolean {
    const target = event.target
    if (!(target instanceof Element) || !inNodeViewChrome(target, this.dom)) return false
    const el = target.closest(`[${NODE_VIEW_ATTR}]`)
    if (!el) return false
    for (const desc of this.customViews) {
      if (desc.dom !== el) continue
      const custom = desc.custom!
      return custom.stopEvent ? custom.stopEvent(event) : defaultStopEvent(event, el as HTMLElement)
    }
    return false
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
      // what happens inside a node view is its own business (except in its content element)
      const target =
        record.target.nodeType === 1 ? (record.target as Element) : record.target.parentElement
      if (inNodeViewChrome(target, this.dom)) continue
      const block = textblockDescOf(record.target, this.rootDesc)
      if (block) blocks.add(block)
      else structural = true
    }
    if (!blocks.size && !structural) return
    this.readDOMChanges([...blocks])
    if (structural) this.redrawAll()
  }

  /** @internal */
  readDOMChanges(blocks: NodeViewDesc[]): void {
    if (!this.editable) {
      // read-only (e.g. a commenter's IME or spellchecker): never a change, just redraw
      this.redrawBlocks(blocks.filter((b) => b.parent).map((desc) => ({ desc })))
      return
    }
    const tr = this.state.tr
    const schema = this.state.schema
    const stored = this.state.storedMarks
    const sorted = blocks
      .filter((b) => b.parent && this.dom.contains(b.dom))
      .map((b) => ({ desc: b, start: b.posAtContentStart() }))
      .sort((a, b) => b.start - a.start)
    if (sorted.length === 1 && this.textInputFromDOM(sorted[0]!.desc, sorted[0]!.start)) {
      this.redrawBlocks(sorted)
      return
    }
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
    this.redrawBlocks(sorted)
  }

  /** Redraws touched blocks from the model: removes whatever markup the browser added. */
  private redrawBlocks(blocks: readonly { desc: NodeViewDesc }[]): void {
    this.domChange(() => {
      for (const { desc } of blocks) {
        if (desc.parent && this.dom.contains(desc.dom)) {
          renderContent(this.document, desc, desc.posAtContentStart(), this.context)
        }
      }
    })
    if (this.hasFocus()) this.syncSelectionToDOM()
  }

  /**
   * Text the browser wrote itself (IME composition, Android keyboards whose
   * input events cannot be cancelled) goes through `handleTextInput` like
   * typed text, so input rules, "/" and "@" work there too. Only a plain
   * insertion with the caret right after it; returns true when a plugin
   * handled it.
   */
  private textInputFromDOM(desc: NodeViewDesc, start: number): boolean {
    const after = domChars(desc, this.rootDesc)
    const diff = charsDiff(modelChars(desc.node), after)
    if (!diff || diff.endA !== diff.start || diff.endB === diff.start) return false
    const text = after.text.slice(diff.start, diff.endB)
    if (text.includes(LEAF_CHAR) || /[\r\n]/.test(text)) return false
    const from = start + diff.start
    // The text must have gone where the caret is (else the diff guessed wrong, e.g.
    // "aa" + "a"): the model caret was there, or the DOM caret is right after it
    // (counting the DOM text from the block start; browsers may update it late).
    const sel = this.state.selection
    if (!(sel.empty && sel.from === from) && !this.domCaretAfter(desc, after.text, diff.endB))
      return false
    const chars = [...text]
    if (chars.length === 1)
      return someProp(this.state, 'handleTextInput', (handle) => handle(this, from, from, text))
    // Several characters at once (compositions read together, e.g. " " then "@" on a
    // fast keyboard): one at a time, as if typed, so each can trigger its rule or menu.
    this.dispatch(this.state.tr.setSelection(TextSelection.create(this.state.doc, from)))
    const stored = this.state.storedMarks
    let offset = diff.start
    for (const ch of chars) {
      const pos = this.state.selection.from
      if (!someProp(this.state, 'handleTextInput', (handle) => handle(this, pos, pos, ch))) {
        const parent = this.state.doc.resolve(pos).parent
        const marks = (stored ?? after.marks[offset]!).filter((m) =>
          parent.type.allowsMarkType(m.type),
        )
        this.dispatch(this.state.tr.replaceWith(pos, pos, this.state.schema.text(ch, marks)))
      }
      offset += ch.length
    }
    return true
  }

  /** The DOM caret sits right after the first `end` chars of the block's DOM text. */
  private domCaretAfter(desc: NodeViewDesc, text: string, end: number): boolean {
    const domSel = this.document.getSelection()
    const content = desc.contentDOM
    if (!domSel?.isCollapsed || !domSel.focusNode || !content?.contains(domSel.focusNode))
      return false
    const range = this.document.createRange()
    range.setStart(content, 0)
    range.setEnd(domSel.focusNode, domSel.focusOffset)
    return range.toString() === text.slice(0, end).split(LEAF_CHAR).join('')
  }

  /** @internal Textblock containing the DOM selection anchor (e.g. the one being composed). */
  textblockDescAtDOMSelection(): NodeViewDesc | null {
    return textblockDescOf(this.document.getSelection()?.anchorNode ?? null, this.rootDesc)
  }

  /** @internal Ctrl/Cmd+Shift+V was pressed: the next paste (within 1s) is plain text. */
  requestPlainPaste(): void {
    this.plainPasteUntil = Date.now() + 1000
  }

  /** @internal */
  consumePlainPaste(): boolean {
    const plain = Date.now() < this.plainPasteUntil
    this.plainPasteUntil = 0
    return plain
  }

  /** @internal */
  get context(): RenderContext {
    const factories = this.options.nodeViews
    if (!factories) return { decorations: this.decorations }
    return {
      decorations: this.decorations,
      nodeView: (node, getPos) => factories[node.type.name]?.(node, this, getPos) ?? null,
      register: (desc) => this.customViews.add(desc),
    }
  }

  private redrawDecorated(starts: number[]): void {
    if (!starts.length) return
    this.domChange(() => {
      for (const start of starts) {
        const desc = descAt(this.rootDesc, start - 1)
        if (desc?.node.isTextblock && desc.decoKey !== this.decorations.key(start)) {
          renderContent(this.document, desc, start, this.context)
        }
      }
    })
  }

  /** @internal Re-renders everything from the model (after unexpected structural DOM edits). */
  redrawAll(): void {
    this.domChange(() => {
      this.rootDesc = new NodeViewDesc(this.state.doc, this.dom, this.dom)
      renderContent(this.document, this.rootDesc, 0, this.context)
    })
    if (this.hasFocus()) this.syncSelectionToDOM()
  }

  private updateEditable(): void {
    const editable = this.editable
    // commenters get a caret (keyboard selections) but every edit is refused
    this.dom.setAttribute('contenteditable', editable || this.canAnnotate ? 'true' : 'false')
    this.dom.setAttribute('aria-readonly', editable ? 'false' : 'true')
    // read-only content stays reachable with Tab (find, reading, selecting to copy)
    if (!this.dom.hasAttribute('tabindex')) this.dom.tabIndex = 0
  }
}

function selectionNear(tr: Transaction, pos: number): Selection {
  const size = tr.doc.content.size
  return Selection.near(tr.doc.resolve(Math.max(0, Math.min(pos, size))))
}
