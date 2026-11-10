import { TextSelection, type Command, type EditorState, type NodeType } from '@scriba-editor/core'

function codeType(state: EditorState): NodeType {
  const type = state.schema.nodes['code_block']
  if (!type) throw new RangeError('The schema has no "code_block" node (add codeBlockNodes)')
  return type
}

/** Depth of the code block containing the selection, or -1. */
function codeDepth(state: EditorState): number {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.spec.code) return d
  return -1
}

export function isInCodeBlock(state: EditorState): boolean {
  return codeDepth(state) >= 0
}

/** Turns the selected blocks into a code block, or back into paragraphs. */
export const toggleCodeBlock: Command = (state, dispatch) => {
  const code = codeType(state)
  const paragraph = state.schema.nodes['paragraph']
  const { from, to } = state.selection
  const target = isInCodeBlock(state) ? paragraph : code
  if (!target) return false
  let applicable = false
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (applicable) return false
    if (!node.isTextblock) return true
    applicable = node.type !== target && state.doc.resolve(pos).parent.type.canContain(target)
    return false
  })
  if (!applicable) return false
  dispatch?.(state.tr.setBlockType(from, to, target).scrollIntoView())
  return true
}

/** Sets the language of the code block containing the selection (`null` = plain text). */
export function setCodeLanguage(language: string | null): Command {
  return (state, dispatch) => {
    const depth = codeDepth(state)
    if (depth < 0) return false
    const $from = state.selection.$from
    if ($from.node(depth).attrs['language'] === language) return true
    dispatch?.(state.tr.setNodeAttrs($from.before(depth), { language }))
    return true
  }
}

/** Mod+Enter in a code block: continue with a paragraph after it. */
export const exitCodeBlock: Command = (state, dispatch) => {
  const depth = codeDepth(state)
  const paragraph = state.schema.nodes['paragraph']
  if (depth < 0 || !paragraph) return false
  const $from = state.selection.$from
  const after = $from.after(depth)
  if (!$from.node(depth - 1).type.canContain(paragraph)) return false
  if (dispatch) {
    const tr = state.tr.insert(after, paragraph.create())
    dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView())
  }
  return true
}

/**
 * Enter at the end of a code block that already ends with two empty lines:
 * drop them and leave the block (like pressing Enter three times).
 */
export const exitOnTripleEnter: Command = (state, dispatch) => {
  const sel = state.selection
  if (!(sel instanceof TextSelection) || !sel.$cursor || !sel.$cursor.parent.type.spec.code)
    return false
  const $c = sel.$cursor
  if ($c.parentOffset !== $c.parent.content.size || !$c.parent.textContent.endsWith('\n\n'))
    return false
  const paragraph = state.schema.nodes['paragraph']
  if (!paragraph || !$c.node(-1).type.canContain(paragraph)) return false
  if (dispatch) {
    const tr = state.tr.delete($c.pos - 2, $c.pos)
    const after = tr.mapping.map($c.after())
    tr.insert(after, paragraph.create())
    dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView())
  }
  return true
}

/** Backspace at the start of an empty code block turns it back into a paragraph. */
export const resetEmptyCodeBlock: Command = (state, dispatch) => {
  const sel = state.selection
  if (!(sel instanceof TextSelection) || !sel.$cursor) return false
  const $c = sel.$cursor
  if (!$c.parent.type.spec.code || $c.parent.content.size) return false
  const paragraph = state.schema.nodes['paragraph']
  if (!paragraph) return false
  dispatch?.(state.tr.setBlockType($c.pos, $c.pos, paragraph))
  return true
}
