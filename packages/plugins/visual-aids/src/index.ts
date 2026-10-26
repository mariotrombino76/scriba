import { Plugin, PluginKey, type Command, type EditorState, type Node } from '@scriba/core'
import type { ToolbarButton } from '@scriba/ui'
import type { EditorView, InlineDecoration, ViewPluginProps } from '@scriba/view'

/** Which editing aids are shown. They live in the editor only: never in the HTML. */
export interface VisualAids {
  /** Outlines and tag names of the blocks (TinyMCE's "visual blocks"). */
  readonly blocks: boolean
  /** Non-breaking spaces and soft hyphens, highlighted (TinyMCE's "visual chars"). */
  readonly chars: boolean
}

const OFF: VisualAids = { blocks: false, chars: false }
export const visualAidsKey = new PluginKey<VisualAids>('visualAids')

/** Class on the editor while blocks are shown (the theme draws them). */
export const SHOW_BLOCKS_CLASS = 'scriba-show-blocks'
/** Invisible characters worth seeing: no-break space, narrow no-break space, soft hyphen. */
const INVISIBLE = /[\u00a0\u202f\u00ad]/g

export function getVisualAids(state: EditorState): VisualAids {
  return visualAidsKey.getState(state) ?? OFF
}

/** The invisible characters of a document, as decorations (cached per document). */
const charsCache = new WeakMap<Node, InlineDecoration[]>()
function invisibleChars(doc: Node): InlineDecoration[] {
  let found = charsCache.get(doc)
  if (found) return found
  found = []
  const list = found
  doc.descendants((node, pos) => {
    if (!node.isText) return true
    for (const m of node.text.matchAll(INVISIBLE)) {
      const from = pos + m.index
      list.push({
        from,
        to: from + 1,
        class: m[0] === '\u00ad' ? 'scriba-char-shy' : 'scriba-char-nbsp',
      })
    }
    return false
  })
  charsCache.set(doc, found)
  return found
}

/** Plugin: keeps which aids are on, marks the editor and highlights the characters. */
export function visualAids(initial: Partial<VisualAids> = {}): Plugin<VisualAids> {
  const view: ViewPluginProps = {
    pluginView(editor: EditorView) {
      const sync = () =>
        editor.dom.classList.toggle(SHOW_BLOCKS_CLASS, getVisualAids(editor.state).blocks)
      sync()
      return { update: sync, destroy: () => editor.dom.classList.remove(SHOW_BLOCKS_CLASS) }
    },
  }
  return new Plugin<VisualAids>({
    key: visualAidsKey,
    state: {
      init: () => ({ ...OFF, ...initial }),
      apply: (tr, value) => tr.getMeta<VisualAids>(visualAidsKey) ?? value,
    },
    props: {
      decorations(state: EditorState): readonly InlineDecoration[] {
        return getVisualAids(state).chars ? invisibleChars(state.doc) : []
      },
      ...view,
    },
  })
}

function toggle(which: keyof VisualAids): Command {
  return (state, dispatch) => {
    if (!visualAidsKey.get(state)) return false
    const current = getVisualAids(state)
    dispatch?.(state.tr.setMeta(visualAidsKey, { ...current, [which]: !current[which] }))
    return true
  }
}

/** Shows or hides the outlines of the blocks. */
export const toggleVisualBlocks: Command = toggle('blocks')
/** Shows or hides non-breaking spaces and soft hyphens. */
export const toggleVisualChars: Command = toggle('chars')

/** View menu entries: show blocks, show invisible characters (checked when on). */
export function visualAidsItems(): ToolbarButton[] {
  return [
    {
      type: 'button',
      id: 'visual-blocks',
      icon: 'blocks',
      label: (t) => t('visual.blocks'),
      command: toggleVisualBlocks,
      readOnly: true,
      isActive: (state) => getVisualAids(state).blocks,
    },
    {
      type: 'button',
      id: 'visual-chars',
      icon: 'pilcrow',
      label: (t) => t('visual.chars'),
      command: toggleVisualChars,
      readOnly: true,
      isActive: (state) => getVisualAids(state).chars,
    },
  ]
}
