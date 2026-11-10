import type { Translate } from '@scriba-editor/i18n'
import type { ToolbarButton } from '@scriba-editor/ui'
import { openCharmapDialog, type CharmapOptions } from './picker.js'

export { CHARACTERS, EMOJI_CATEGORIES, type CharEntry, type CategoryId } from './data.js'
export {
  openCharmapDialog,
  insertCharacter,
  searchCharacters,
  recentCharacters,
  codePoints,
  type CharmapOptions,
} from './picker.js'

/** Toolbar button opening the special characters and emoji dialog. */
export function charmapToolbarItem(t: Translate, options: CharmapOptions = {}): ToolbarButton {
  return {
    type: 'button',
    id: 'charmap',
    icon: 'smile',
    label: (tr) => tr('charmap.button'),
    command: (state) => state.selection.$from.parent.inlineContent,
    run: (view) => openCharmapDialog(view, t, options),
  }
}
