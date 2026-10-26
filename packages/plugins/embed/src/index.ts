import { Plugin, type Command, type KeyBindings } from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import type { ToolbarButton } from '@scriba/ui'
import type { EditorView, ViewPluginProps } from '@scriba/view'
import { selectedEmbed } from './commands.js'
import { openEmbedDialog } from './dialog.js'

export { embedNodes, embedTitle, EMBED_REFERRER_POLICY, EMBED_SANDBOX } from './nodes.js'
export { embedNodeView } from './view.js'
export { openEmbedDialog } from './dialog.js'
export { insertEmbed, selectedEmbed, type EmbedAttrs } from './commands.js'
export {
  EMBED_PROVIDERS,
  pageUrl,
  playerUrl,
  videoFromAddress,
  videoFromPlayerUrl,
  type EmbedProvider,
  type VideoRef,
} from './providers.js'

/** Opens the video dialog (needs the view). */
function openDialogCommand(t: Translate): Command {
  return (_state, dispatch, view) => {
    if (!view) return false
    if (dispatch) openEmbedDialog(view as EditorView, t)
    return true
  }
}

/** Enter on a selected video opens its dialog. */
export function embedKeymap(t: Translate): KeyBindings {
  const open = openDialogCommand(t)
  return { Enter: (state, dispatch, view) => !!selectedEmbed(state) && open(state, dispatch, view) }
}

/** Double-clicking a video opens its dialog. */
export function embedPlugins(t: Translate): Plugin[] {
  const props: ViewPluginProps = {
    handleDoubleClickNode(view, _pos, node) {
      if (node.type.name !== 'embed' || !view.editable) return false
      openEmbedDialog(view, t)
      return true
    },
  }
  return [new Plugin({ props: { ...props } })]
}

/** Insert ▸ Video. */
export function embedToolbarItem(t: Translate): ToolbarButton {
  return {
    type: 'button',
    id: 'embed',
    icon: 'video',
    label: (tr) => tr('embed.label.short'),
    command: (state) => !state.selection.$from.parent.type.spec.code,
    run: (view) => openEmbedDialog(view, t),
  }
}

/** Slash menu entry ("/video"). */
export function embedSlashItem(t: Translate): {
  id: string
  label: (t: Translate) => string
  keywords: string[]
  icon: 'video'
  command: Command
} {
  return {
    id: 'embed',
    label: (tr) => tr('embed.label.short'),
    keywords: ['video', 'youtube', 'vimeo', 'filmato', 'embed', 'incorpora'],
    icon: 'video',
    command: openDialogCommand(t),
  }
}
