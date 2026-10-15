import type { Command, KeyBindings } from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import type { ToolbarButton } from '@scriba/ui'
import type { EditorView } from '@scriba/view'
import { openCommentDialog } from './panel.js'
import type { CommentStore } from './store.js'

export {
  createMemoryCommentStore,
  cleanCommentText,
  MAX_COMMENT_LENGTH,
  type CommentStore,
  type CommentThread,
  type CommentEntry,
  type CommentAuthor,
  type ThreadKind,
} from './store.js'
export {
  commentMarks,
  commentsPlugin,
  commentsKey,
  getComments,
  threadRange,
  commentsAt,
  addComment,
  deleteThread,
  removeAnchor,
  focusThread,
  type CommentsState,
} from './comments.js'
export { commentsPanel, openCommentDialog, type CommentsPanelOptions } from './panel.js'

/** Ctrl/Cmd+Alt+M: comment on the selection. */
export function commentsKeymap(store: CommentStore, t: Translate): KeyBindings {
  const add: Command = (state, dispatch, view) => {
    if (!view || state.selection.empty) return false
    if (dispatch) openCommentDialog(view as EditorView, store, t)
    return true
  }
  return { 'Mod-Alt-m': add }
}

export function commentToolbarItem(store: CommentStore, t: Translate): ToolbarButton {
  return {
    type: 'button',
    id: 'comment',
    icon: 'comment',
    label: (tr) => tr('comments.new'),
    shortcut: 'Mod-Alt-m',
    command: (state) => !state.selection.empty && !!state.schema.marks['comment'],
    run: (view) => openCommentDialog(view, store, t),
  }
}
