import { Plugin, type Command, type KeyBindings } from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import type { ToolbarButton } from '@scriba-editor/ui'
import type { EditorView, ViewPluginProps } from '@scriba-editor/view'
import { MEDIA_NODES, selectedMedia } from './commands.js'
import { openMediaDialog, type MediaOptions } from './dialog.js'

export {
  embedNodes,
  embedTitle,
  EMBED_FRAME_SRC,
  EMBED_REFERRER_POLICY,
  EMBED_SANDBOX,
} from './nodes.js'
export {
  mediaKindOf,
  mediaKindOfType,
  mediaNodes,
  MEDIA_TYPES,
  safeMediaUrl,
  type MediaKind,
} from './media.js'
export { embedNodeView, mediaFileNodeView } from './view.js'
export { openMediaDialog, DEFAULT_MEDIA_MAX_SIZE, type MediaOptions } from './dialog.js'
export {
  insertEmbed,
  insertMediaFile,
  selectedMedia,
  MEDIA_NODES,
  type EmbedAttrs,
} from './commands.js'
export {
  EMBED_PROVIDERS,
  embedFromAddress,
  embedFromPlayerUrl,
  isEmbedRef,
  pageUrl,
  playerUrl,
  providerKind,
  providerName,
  type EmbedKind,
  type EmbedProvider,
  type EmbedRef,
} from './providers.js'

/** Opens the media dialog (needs the view). */
function openDialogCommand(t: Translate, options: MediaOptions): Command {
  return (_state, dispatch, view) => {
    if (!view) return false
    if (dispatch) openMediaDialog(view as EditorView, t, options)
    return true
  }
}

/** Enter on a selected video, song or map opens its dialog. */
export function embedKeymap(t: Translate, options: MediaOptions = {}): KeyBindings {
  const open = openDialogCommand(t, options)
  return { Enter: (state, dispatch, view) => !!selectedMedia(state) && open(state, dispatch, view) }
}

/** Double-clicking a video, song or map opens its dialog. */
export function embedPlugins(t: Translate, options: MediaOptions = {}): Plugin[] {
  const props: ViewPluginProps = {
    handleDoubleClickNode(view, _pos, node) {
      if (!MEDIA_NODES.includes(node.type.name) || !view.editable) return false
      openMediaDialog(view, t, options)
      return true
    },
  }
  return [new Plugin({ props: { ...props } })]
}

/** Insert ▸ Media (videos, songs, maps, video and audio files). */
export function embedToolbarItem(t: Translate, options: MediaOptions = {}): ToolbarButton {
  return {
    type: 'button',
    id: 'embed',
    icon: 'video',
    label: (tr) => tr('embed.label.short'),
    command: (state) => !state.selection.$from.parent.type.spec.code,
    run: (view) => openMediaDialog(view, t, options),
  }
}

/** Slash menu entry ("/video", "/mappa", "/spotify"…). */
export function embedSlashItem(
  t: Translate,
  options: MediaOptions = {},
): {
  id: string
  label: (t: Translate) => string
  keywords: string[]
  icon: 'video'
  command: Command
} {
  return {
    id: 'embed',
    label: (tr) => tr('embed.label.short'),
    keywords: [
      'video',
      'media',
      'youtube',
      'vimeo',
      'dailymotion',
      'spotify',
      'musica',
      'audio',
      'mappa',
      'maps',
      'filmato',
      'embed',
      'incorpora',
    ],
    icon: 'video',
    command: openDialogCommand(t, options),
  }
}
