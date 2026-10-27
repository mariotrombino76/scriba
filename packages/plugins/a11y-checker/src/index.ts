import type { Translate } from '@scriba/i18n'
import type { ToolbarButton } from '@scriba/ui'
import type { EditorView } from '@scriba/view'
import { openA11yDialog } from './dialog.js'
import { a11yCheckerKey } from './state.js'

export { openA11yDialog, understandingUrl } from './dialog.js'
export { checkAccessibility } from './check.js'
export { contrastRatio, luminance, suggestColor } from './contrast.js'
export { GENERIC_LINK_TEXTS, isUnhelpfulAlt } from './rules-content.js'
export {
  A11Y_CURRENT_CLASS,
  a11yChecker,
  a11yCheckerKey,
  a11yIssues,
  clearIgnoredIssues,
  ignoreIssue,
  setCurrentIssue,
} from './state.js'
export {
  A11Y_RULES,
  type A11yAction,
  type A11yActionId,
  type A11yField,
  type A11yIssue,
  type A11yLevel,
  type A11yOptions,
  type A11yRepair,
  type A11yRuleId,
  type A11ySeverity,
  type A11yTarget,
  type WcagCriterion,
} from './types.js'

/**
 * Tools ▸ "Accessibility checker…" (TinyMCE's `a11ycheck`): opens the dialog.
 * Available in read-only mode too (the repairs are then hidden).
 */
export function a11yCheckerItem(t: Translate): ToolbarButton {
  return {
    type: 'button',
    id: 'a11y-check',
    icon: 'accessibility',
    label: (tr) => tr('a11y.check'),
    command: (state) => !!a11yCheckerKey.getState(state),
    readOnly: true,
    run: (view) => void openA11yDialog(view as EditorView, t),
  }
}
