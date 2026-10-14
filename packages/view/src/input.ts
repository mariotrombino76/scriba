import {
  chainCommands,
  deleteChar,
  deleteSelection,
  insertNode,
  joinBackward,
  joinForward,
  liftEmptyBlock,
  liftEmptyOrFirstBlock,
  newlineInCode,
  redo,
  runKeymaps,
  splitBlock,
  TextSelection,
  toggleMark,
  undo,
  type Command,
} from '@scriba/core'
import { handleCopy, handlePaste } from './clipboard.js'
import type { EditorView } from './view.js'

const deleteBackward = chainCommands(
  deleteSelection,
  liftEmptyOrFirstBlock,
  joinBackward,
  deleteChar(-1),
)
const deleteForward = chainCommands(deleteSelection, joinForward, deleteChar(1))

function lineBreak(view: EditorView): Command {
  const hardBreak = view.state.schema.nodes['hard_break']
  return chainCommands(newlineInCode, ...(hardBreak ? [insertNode(hardBreak)] : []), splitBlock)
}

function markCommand(view: EditorView, name: string): Command | null {
  const type = view.state.schema.marks[name]
  return type ? toggleMark(type) : null
}

/** Model range of the event's first target range, if the browser gave one. */
function targetRange(view: EditorView, event: InputEvent): { from: number; to: number } | null {
  const range = event.getTargetRanges?.()[0]
  if (!range) return null
  const a = view.posAtDOM(range.startContainer, range.startOffset)
  const b = view.posAtDOM(range.endContainer, range.endOffset)
  if (a === null || b === null) return null
  return { from: Math.min(a, b), to: Math.max(a, b) }
}

function run(view: EditorView, cmd: Command | null): void {
  cmd?.(view.state, (tr) => view.dispatch(tr))
}

function insertText(
  view: EditorView,
  text: string,
  range: { from: number; to: number } | null,
): void {
  const tr = view.state.tr
  if (range && (range.from !== view.state.selection.from || range.to !== view.state.selection.to)) {
    tr.insertText(text, range.from, range.to)
    tr.setSelection(TextSelection.create(tr.doc, range.from + text.length))
  } else {
    tr.insertText(text)
  }
  view.dispatch(tr.scrollIntoView())
}

/**
 * `beforeinput`: every edit the browser is about to make is cancelled and
 * performed on the model instead (Input Events Level 2).
 */
function onBeforeInput(view: EditorView, event: InputEvent): void {
  if (!view.editable) {
    event.preventDefault()
    return
  }
  // During IME composition the browser must update the DOM itself;
  // the result is read back at compositionend.
  if (event.inputType === 'insertCompositionText' || (view.composing && !event.cancelable)) return
  if (!event.cancelable) return // e.g. some Android keyboards: picked up by the mutation observer
  event.preventDefault()
  // selectionchange is async: make sure the model has the caret the user sees.
  view.syncSelectionFromDOM()
  const sel = view.state.selection
  switch (event.inputType) {
    case 'insertText':
    case 'insertReplacementText': {
      const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? ''
      if (text) insertText(view, text, targetRange(view, event))
      return
    }
    case 'insertParagraph':
      return run(view, chainCommands(newlineInCode, liftEmptyBlock, splitBlock))
    case 'insertLineBreak':
      return run(view, lineBreak(view))
    case 'deleteContentBackward':
      return run(view, deleteBackward)
    case 'deleteContentForward':
      return run(view, deleteForward)
    case 'deleteWordBackward':
    case 'deleteWordForward':
    case 'deleteSoftLineBackward':
    case 'deleteSoftLineForward':
    case 'deleteHardLineBackward':
    case 'deleteHardLineForward':
    case 'deleteEntireSoftLine':
    case 'deleteContent':
    case 'deleteByCut': {
      if (!sel.empty) return run(view, deleteSelection)
      const range = targetRange(view, event)
      if (range && range.from < range.to) {
        try {
          view.dispatch(view.state.tr.delete(range.from, range.to).scrollIntoView())
          return
        } catch {
          // fall back to a single character
        }
      }
      return run(view, event.inputType.endsWith('Forward') ? deleteForward : deleteBackward)
    }
    case 'historyUndo':
      return run(view, undo)
    case 'historyRedo':
      return run(view, redo)
    case 'formatBold':
      return run(view, markCommand(view, 'bold'))
    case 'formatItalic':
      return run(view, markCommand(view, 'italic'))
    case 'formatUnderline':
      return run(view, markCommand(view, 'underline'))
    case 'formatStrikeThrough':
      return run(view, markCommand(view, 'strike'))
    default:
      // insertFromPaste/Drop are handled by the clipboard events; anything else is ignored.
      return
  }
}

function onKeyDown(view: EditorView, event: KeyboardEvent): void {
  if (view.composing || event.isComposing || event.keyCode === 229) return
  if (!view.editable) return
  view.syncSelectionFromDOM()
  if (runKeymaps(view.state, (tr) => view.dispatch(tr), event)) event.preventDefault()
}

function onCompositionStart(view: EditorView): void {
  const { $from, $to, empty } = view.state.selection
  // A selection across blocks would be mangled by the browser: delete it first.
  if (!empty && !$from.sameParent($to)) run(view, deleteSelection)
  view.composing = true
}

function onCompositionEnd(view: EditorView): void {
  // Some browsers fire the last input after compositionend: read the DOM on the next task.
  setTimeout(() => {
    view.composing = false
    const block = view.textblockDescAtDOMSelection()
    view.readDOMChanges(block ? [block] : [])
  }, 0)
}

/** Wires DOM events to the view. Returns a function that removes them. */
export function attachInputHandlers(view: EditorView): () => void {
  const dom = view.dom
  const doc = view.document
  const listeners: [EventTarget, string, (e: Event) => void][] = [
    [dom, 'beforeinput', (e) => onBeforeInput(view, e as InputEvent)],
    [dom, 'keydown', (e) => onKeyDown(view, e as KeyboardEvent)],
    [dom, 'compositionstart', () => onCompositionStart(view)],
    [dom, 'compositionend', () => onCompositionEnd(view)],
    [dom, 'copy', (e) => handleCopy(view, e as ClipboardEvent, false)],
    [dom, 'cut', (e) => handleCopy(view, e as ClipboardEvent, true)],
    [dom, 'paste', (e) => handlePaste(view, e as ClipboardEvent)],
    // Drag and drop of content arrives in Phase 2 (images); until then the browser must not move DOM.
    [dom, 'dragstart', (e) => e.preventDefault()],
    [dom, 'drop', (e) => e.preventDefault()],
    [dom, 'focus', () => view.syncSelectionToDOM()],
    [doc, 'selectionchange', () => view.syncSelectionFromDOM()],
  ]
  for (const [target, type, fn] of listeners) target.addEventListener(type, fn)
  return () => {
    for (const [target, type, fn] of listeners) target.removeEventListener(type, fn)
  }
}
