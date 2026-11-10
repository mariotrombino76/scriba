import type { Translate } from '@scriba-editor/i18n'
import type { ToolbarButton } from '@scriba-editor/ui'
import type { EditorView } from '@scriba-editor/view'
import type { RevisionOptions } from './content.js'
import { openRevisionDialog } from './dialog.js'

export {
  MAX_REVISION_LENGTH,
  formatRevisionDate,
  parseRevision,
  type Revision,
  type RevisionOptions,
} from './content.js'
export {
  MAX_COMPARISONS,
  diffDocs,
  diffSequence,
  slideEdits,
  type Change,
  type ChangeKind,
  type DocDiff,
  type Highlight,
} from './diff.js'
export { openRevisionDialog } from './dialog.js'

/**
 * Menu or toolbar entry "Version history…". Also available when read-only:
 * versions can be looked at and compared, only "Restore" is disabled.
 */
export function revisionsToolbarItem(t: Translate, options: RevisionOptions): ToolbarButton {
  return {
    type: 'button',
    id: 'revisions',
    icon: 'history',
    label: (tr) => tr('revisions.label'),
    command: () => true,
    readOnly: true,
    run: (view) => void openRevisionDialog(view as EditorView, t, options),
  }
}
