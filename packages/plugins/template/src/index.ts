import type { Translate } from '@scriba-editor/i18n'
import type { ToolbarButton } from '@scriba-editor/ui'
import type { EditorView } from '@scriba-editor/view'
import type { TemplateOptions } from './content.js'
import { openTemplateDialog } from './dialog.js'

export {
  MAX_TEMPLATE_LENGTH,
  defaultTemplateValues,
  fillPlaceholders,
  insertTemplate,
  parseTemplate,
  type Template,
  type TemplateOptions,
  type TemplateValue,
} from './content.js'
export { openTemplateDialog } from './dialog.js'

/** Toolbar or menu entry "Template…": opens the template dialog. Disabled when read-only. */
export function templateToolbarItem(t: Translate, options: TemplateOptions): ToolbarButton {
  return {
    type: 'button',
    id: 'template',
    icon: 'template',
    label: (tr) => tr('template.insert'),
    command: () => true,
    run: (view) => void openTemplateDialog(view as EditorView, t, options),
  }
}
