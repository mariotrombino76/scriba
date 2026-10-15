import type { Command } from './commands/base.js'
import { Plugin, PluginKey } from './state/plugin.js'
import { TextSelection } from './state/selection.js'
import type { EditorState } from './state/state.js'
import type { Transaction } from './state/transaction.js'
import { Mapping } from './transform/map.js'
import { ReplaceStep } from './transform/replace-step.js'
import type { Step } from './transform/step.js'

/*
 * History in simple words: every change is written in a notebook as the
 * "opposite move" (inverted steps). Undo reads the last page and plays it;
 * what undo did is written in a second notebook, used by redo.
 * Changes typed close together in time end up on the same page (one undo).
 */

/** One undoable event: steps to apply in order, and where the selection goes after. */
interface HistoryEvent {
  readonly steps: readonly Step[]
  readonly anchor: number
  readonly head: number
}

export interface HistoryState {
  readonly done: readonly HistoryEvent[]
  readonly undone: readonly HistoryEvent[]
  readonly prevTime: number
  /** The last recorded change was plain typing/deleting (can be grouped with more typing). */
  readonly prevTyping?: boolean
}

export interface HistoryOptions {
  /** Max number of undo events kept. Default 100. */
  depth?: number
  /** Changes further apart than this (ms) start a new undo event. Default 500. */
  newGroupDelay?: number
}

interface HistoryMeta {
  redo: boolean
  state: HistoryState
}

export const historyKey = new PluginKey<HistoryState>('history')
/** Set to false on a transaction to keep it out of the history (e.g. remote changes). */
export const ADD_TO_HISTORY = 'addToHistory'
/** Set to true to force the next change into a new undo event. */
export const CLOSE_HISTORY = 'closeHistory'

function invertSteps(tr: Transaction): Step[] {
  const inverted: Step[] = []
  for (let i = tr.steps.length - 1; i >= 0; i--) {
    const step = tr.steps[i]!.invert(tr.docs[i]!)
    const last = inverted[inverted.length - 1]
    const merged = last?.merge(step)
    if (merged) inverted[inverted.length - 1] = merged
    else inverted.push(step)
  }
  return inverted
}

/** Rebases an event over a change it did not know about (e.g. a remote edit). */
function rebaseEvent(event: HistoryEvent, mapping: Mapping): HistoryEvent | null {
  let current = mapping
  const steps: Step[] = []
  for (const step of event.steps) {
    const mapped = step.map(current)
    // Positions now live in the document after `step`; follow them through the change.
    const next = new Mapping([
      step.getMap().invert(),
      ...current.maps.slice(current.from, current.to),
    ])
    if (mapped) {
      steps.push(mapped)
      next.appendMap(mapped.getMap())
    }
    current = next
  }
  if (!steps.length) return null
  return { steps, anchor: current.map(event.anchor), head: current.map(event.head) }
}

function applyTransaction(
  history: HistoryState,
  tr: Transaction,
  oldState: EditorState,
  options: Required<HistoryOptions>,
): HistoryState {
  const meta = tr.getMeta<HistoryMeta>(historyKey)
  if (meta) return meta.state
  if (!tr.docChanged) return history

  if (tr.getMeta(ADD_TO_HISTORY) === false) {
    const rebase = (events: readonly HistoryEvent[]) =>
      events.map((e) => rebaseEvent(e, tr.mapping)).filter((e): e is HistoryEvent => !!e)
    return {
      done: rebase(history.done),
      undone: rebase(history.undone),
      prevTime: history.prevTime,
    }
  }

  const steps = invertSteps(tr)
  const sel = oldState.selection
  const last = history.done[history.done.length - 1]
  const typing = isTyping(tr)
  // Only typing is grouped: formatting, block changes etc. are always their own undo step.
  // a transaction appended by a plugin (normalization, suggestions…) belongs to its root's step
  const root = tr.getMeta<Transaction>('appendedTransaction')
  const appended = !!root && !!last && root.docChanged && root.getMeta(ADD_TO_HISTORY) !== false
  const newGroup =
    !appended &&
    (!last ||
      !typing ||
      !history.prevTyping ||
      tr.time - history.prevTime > options.newGroupDelay ||
      tr.getMeta(CLOSE_HISTORY) === true)
  let done: HistoryEvent[]
  if (newGroup) {
    done = [...history.done, { steps, anchor: sel.anchor, head: sel.head }]
  } else {
    const combined = [...steps]
    for (const s of last.steps) {
      const merged = combined[combined.length - 1]!.merge(s)
      if (merged) combined[combined.length - 1] = merged
      else combined.push(s)
    }
    done = [...history.done.slice(0, -1), { steps: combined, anchor: last.anchor, head: last.head }]
  }
  if (done.length > options.depth) done = done.slice(done.length - options.depth)
  return { done, undone: [], prevTime: tr.time, prevTyping: appended ? history.prevTyping : typing }
}

/**
 * Plain text edits: replace steps inserting nothing or only inline content
 * (typing, Backspace, Delete). Replacing blocks (a rebuilt table, a document
 * loaded from the source view) is never typing: it gets its own undo step.
 */
function isTyping(tr: Transaction): boolean {
  return tr.steps.every((s) => {
    if (!(s instanceof ReplaceStep) || s.slice.openStart || s.slice.openEnd) return false
    let inline = true
    s.slice.content.forEach((node) => (inline &&= node.isInline))
    return inline
  })
}

/** Undo/redo plugin with time-based grouping of changes. */
export function history(options: HistoryOptions = {}): Plugin<HistoryState> {
  const opts: Required<HistoryOptions> = {
    depth: options.depth ?? 100,
    newGroupDelay: options.newGroupDelay ?? 500,
  }
  return new Plugin<HistoryState>({
    key: historyKey,
    state: {
      init: () => ({ done: [], undone: [], prevTime: 0 }),
      apply: (tr, value, oldState) => applyTransaction(value, tr, oldState, opts),
    },
  })
}

function histCommand(redo: boolean): Command {
  return (state, dispatch) => {
    const hist = historyKey.getState(state)
    const source = hist && (redo ? hist.undone : hist.done)
    const event = source?.[source.length - 1]
    if (!hist || !event) return false
    if (!dispatch) return true

    const tr = state.tr
    for (const step of event.steps) {
      if (tr.maybeStep(step)) return false
    }
    const size = tr.doc.content.size
    const clamp = (pos: number) => Math.max(0, Math.min(pos, size))
    tr.setSelection(
      TextSelection.between(tr.doc.resolve(clamp(event.anchor)), tr.doc.resolve(clamp(event.head))),
    )
    const sel = state.selection
    const reverse: HistoryEvent = { steps: invertSteps(tr), anchor: sel.anchor, head: sel.head }
    const rest = source.slice(0, -1)
    const target = redo ? hist.done : hist.undone
    const next: HistoryState = redo
      ? { done: [...target, reverse], undone: rest, prevTime: 0 }
      : { done: rest, undone: [...target, reverse], prevTime: 0 }
    dispatch(tr.setMeta(historyKey, { redo, state: next } satisfies HistoryMeta).scrollIntoView())
    return true
  }
}

/** Undoes the last change. */
export const undo: Command = histCommand(false)
/** Redoes the last undone change. */
export const redo: Command = histCommand(true)

export const undoDepth = (state: EditorState): number =>
  historyKey.getState(state)?.done.length ?? 0
export const redoDepth = (state: EditorState): number =>
  historyKey.getState(state)?.undone.length ?? 0
