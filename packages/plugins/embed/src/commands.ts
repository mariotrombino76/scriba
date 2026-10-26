import {
  Fragment,
  NodeSelection,
  Selection,
  insertContent,
  type Command,
  type EditorState,
  type Node,
} from '@scriba/core'

export interface EmbedAttrs {
  provider: 'youtube' | 'vimeo'
  videoId: string
  title?: string
  width?: number
  height?: number
}

/** The selected video, with its position. */
export function selectedEmbed(state: EditorState): { node: Node; pos: number } | null {
  const sel = state.selection
  return sel instanceof NodeSelection && sel.node.type.name === 'embed'
    ? { node: sel.node, pos: sel.from }
    : null
}

/**
 * Inserts a video at the cursor (the paragraph is split there; an empty one is
 * replaced), or changes the selected one. The cursor goes to the text after it.
 */
export function insertEmbed(attrs: EmbedAttrs): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes['embed']
    if (!type) return false
    let node: Node
    try {
      node = type.create({ ...attrs })
    } catch {
      return false // invalid attributes
    }
    const editing = selectedEmbed(state)
    if (editing) {
      dispatch?.(state.tr.setNodeAttrs(editing.pos, node.attrs))
      return true
    }
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
