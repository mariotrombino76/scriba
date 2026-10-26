import {
  Fragment,
  NodeSelection,
  Selection,
  insertContent,
  type Command,
  type EditorState,
  type Node,
} from '@scriba/core'
import type { MediaKind } from './media.js'
import type { EmbedProvider } from './providers.js'

export interface EmbedAttrs {
  provider: EmbedProvider
  /** See `EmbedRef.ref`. */
  ref: string
  title?: string
  width?: number
  height?: number
}

/**
 * Inserts a block atom at the cursor (the paragraph is split there; an empty
 * one is replaced); the cursor goes to the text after it.
 */
function insertBlockAtom(node: Node): Command {
  return (state, dispatch) => {
    const { $from, from, to } = state.selection
    if ($from.parent.type.spec.code) return false
    if (!dispatch) return true
    const tr = state.tr
    const end = insertContent(tr, from, to, Fragment.from(node))
    if (end === null) return false
    const paragraph = state.schema.nodes['paragraph']
    let after = end
    const $end = tr.doc.resolve(Math.min(after, tr.doc.content.size))
    if (!$end.nodeAfter?.isTextblock && paragraph && $end.parent.type.canContain(paragraph))
      tr.insert(after, paragraph.create())
    else if ($end.nodeAfter?.isTextblock) after = $end.pos
    tr.setSelection(Selection.near(tr.doc.resolve(after + 1), 1))
    dispatch(tr.scrollIntoView())
    return true
  }
}

/** Creates a node, or null when the attributes are refused. */
function create(state: EditorState, name: string, attrs: Record<string, unknown>): Node | null {
  try {
    return state.schema.nodes[name]?.create(attrs) ?? null
  } catch {
    return null // invalid attributes
  }
}

/** Puts `node` in place of the selected media (any kind), or inserts it at the cursor. */
function placeMedia(node: Node): Command {
  return (state, dispatch, view) => {
    const sel = state.selection
    if (sel instanceof NodeSelection && MEDIA_NODES.includes(sel.node.type.name)) {
      if (sel.node.type === node.type) dispatch?.(state.tr.setNodeAttrs(sel.from, node.attrs))
      else dispatch?.(state.tr.replaceWith(sel.from, sel.to, node))
      return true
    }
    return insertBlockAtom(node)(state, dispatch, view)
  }
}

/** The node types the media dialog edits. */
export const MEDIA_NODES = ['embed', 'video_file', 'audio_file']

/** The selected media (embed, video or audio file), with its position. */
export function selectedMedia(state: EditorState): { node: Node; pos: number } | null {
  const sel = state.selection
  return sel instanceof NodeSelection && MEDIA_NODES.includes(sel.node.type.name)
    ? { node: sel.node, pos: sel.from }
    : null
}

/**
 * Inserts an embedded player at the cursor, or changes the selected media.
 * Refused (false) when the attributes are not valid.
 */
export function insertEmbed(attrs: EmbedAttrs): Command {
  return (state, dispatch, view) => {
    const node = create(state, 'embed', { ...attrs })
    return !!node && placeMedia(node)(state, dispatch, view)
  }
}

/** Inserts a video or audio file at the cursor, or changes the selected media. */
export function insertMediaFile(kind: MediaKind, src: string): Command {
  return (state, dispatch, view) => {
    const node = create(state, kind === 'video' ? 'video_file' : 'audio_file', { src })
    return !!node && placeMedia(node)(state, dispatch, view)
  }
}
