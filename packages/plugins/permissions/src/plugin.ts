import { Plugin, keymap, type EditorState, type Node, type Transaction } from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import type {
  EditorView,
  PluginView,
  TransformPastedDOM,
  ViewPluginProps,
} from '@scriba-editor/view'
import { transactionAllowed, type BlockRules } from './check.js'
import {
  deleteSelectionKeepingLocked,
  marksAroundLocked,
  pasteKeepingLocked,
  typeKeepingLocked,
} from './edit.js'
import { BLOCK_ID, blockIdOf, isBlockId } from './ids.js'

export interface BlockPermissionOptions extends BlockRules {
  t: Translate
  /**
   * Changes that are applied anyway (default: remote collaboration changes,
   * which the collaboration server checks with the same rule).
   */
  trusted?: (tr: Transaction) => boolean
  /** Called when an edit of a protected block is refused. */
  onRefused?: (tr: Transaction) => void
}

export const LOCKED_CLASS = 'scriba-locked'
const REMOTE_META = 'collabRemote' // set by @scriba-editor/plugin-collab on remote changes

/**
 * Marks protected blocks in the DOM (a CSS class) and says why an edit was
 * refused in a live region. The DOM of a block with an id is re-marked after
 * every update; attributes are not observed by the view.
 */
function lockView(view: EditorView, rules: BlockRules, t: Translate, refused: Set<() => void>) {
  const doc = view.document
  const live = doc.createElement('div')
  live.className = 'scriba-visually-hidden'
  live.setAttribute('role', 'status')
  view.dom.parentNode?.insertBefore(live, view.dom.nextSibling)
  let clear: ReturnType<typeof setTimeout> | undefined
  const announce = () => {
    live.textContent = t('permissions.locked')
    clearTimeout(clear)
    clear = setTimeout(() => (live.textContent = ''), 3000)
  }
  refused.add(announce)

  const update = () => {
    for (const el of view.dom.querySelectorAll<HTMLElement>('[data-block-id]')) {
      const id = el.getAttribute('data-block-id')
      const locked = isBlockId(id) && !rules.canEdit(id)
      // only a visual mark: the caret may enter (read, select, copy, comment),
      // every change is refused by filterTransaction
      el.classList.toggle(LOCKED_CLASS, locked)
    }
  }
  update()
  const view_: PluginView = {
    update,
    destroy() {
      refused.delete(announce)
      clearTimeout(clear)
      live.remove()
    },
  }
  return view_
}

/**
 * Protected blocks: a block whose id (see `withBlockIds`) fails `canEdit`
 * cannot be changed, deleted or duplicated from this editor. Comments stay
 * possible (`allowMarks`). This is a convenience for honest users: check the
 * same rule on the server with `checkBlockEdits` (CLAUDE.md §5.1).
 *
 * When the rule changes (e.g. new permissions arrive), call
 * `view.updateState(view.state)` to refresh the marked blocks.
 */
/** Whether a transaction created nodes carrying a block id (split, paste, insert). */
function addsBlockIds(tr: Transaction): boolean {
  let found = false
  tr.steps.forEach((step, i) => {
    const doc = tr.docs[i + 1] ?? tr.doc
    step.getMap().forEach((_a, _b, from, to) => {
      if (found || from === to) return
      doc.nodesBetween(from, to, (node) => {
        if (blockIdOf(node) !== null) found = true
        return !found
      })
    })
  })
  return found
}

/**
 * Ids stay unique: when a block with an id is split (Enter) or copied, the
 * id stays with the copy holding the most text (the first one on a tie).
 */
function dedupeIds(transactions: readonly Transaction[], state: EditorState) {
  if (!transactions.some((tr) => tr.docChanged && addsBlockIds(tr))) return null
  const seen = new Map<string, { pos: number; node: Node }[]>()
  state.doc.descendants((node, pos) => {
    const id = blockIdOf(node)
    if (id !== null) seen.set(id, [...(seen.get(id) ?? []), { pos, node }])
  })
  const tr = state.tr
  for (const copies of seen.values()) {
    if (copies.length < 2) continue
    const keep = copies.reduce((a, b) =>
      b.node.textContent.length > a.node.textContent.length ? b : a,
    )
    for (const c of copies) if (c !== keep) tr.setNodeAttrs(c.pos, { [BLOCK_ID]: null })
  }
  return tr.docChanged ? tr : null
}

export function blockPermissions(options: BlockPermissionOptions): Plugin[] {
  const trusted = options.trusted ?? ((tr) => tr.getMeta(REMOTE_META) === true)
  const refused = new Set<() => void>()
  // a selection with protected blocks in it: typing, deleting, cutting or pasting
  // changes what may be changed around them instead of being refused as a whole
  const deleteAround = deleteSelectionKeepingLocked(options)
  const run = (view: EditorView, tr: Transaction | null) => {
    if (tr) view.dispatch(tr)
    return !!tr
  }
  const props: ViewPluginProps = {
    pluginView: (view) => lockView(view, options, options.t, refused),
    handleTextInput: (view, from, to, text) =>
      run(view, typeKeepingLocked(view.state, from, to, text, options)),
    handleDeleteSelection: (view) => deleteAround(view.state, (tr) => view.dispatch(tr), view),
    handlePasteContent: (view, content) =>
      run(view, pasteKeepingLocked(view.state, content, options)),
  }
  // pasted content is new content: it never brings ids (protected or not) along
  const transformPastedDOM: TransformPastedDOM = (body) => {
    for (const el of body.querySelectorAll('[data-block-id]')) el.removeAttribute('data-block-id')
  }
  return [
    new Plugin({
      // formatting a selection that contains protected blocks formats the rest
      rewriteTransaction(tr, state) {
        if (!tr.docChanged || trusted(tr) || transactionAllowed(tr, options)) return null
        return marksAroundLocked(tr, state, options)
      },
      filterTransaction(tr) {
        if (!tr.docChanged || trusted(tr) || transactionAllowed(tr, options)) return true
        for (const announce of refused) announce()
        options.onRefused?.(tr)
        return false
      },
      appendTransaction: (transactions, _old, state) => dedupeIds(transactions, state),
      props: { ...props, transformPastedDOM },
    }),
    // before the base keymap, which would delete the whole selection (and be refused)
    keymap(
      {
        Backspace: deleteAround,
        Delete: deleteAround,
        'Mod-Backspace': deleteAround,
        'Mod-Delete': deleteAround,
        'Alt-Backspace': deleteAround,
        'Alt-Delete': deleteAround,
      },
      { priority: 100 },
    ),
  ]
}
