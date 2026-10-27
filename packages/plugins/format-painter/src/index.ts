import {
  CLOSE_HISTORY,
  Plugin,
  PluginKey,
  type Command,
  type EditorState,
  type KeyBindings,
  type Mark,
  type MarkType,
  type Node,
  type NodeType,
  type Transaction,
} from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import { isFormattingMark, type ToolbarButton } from '@scriba/ui'
import type { EditorView, ViewPluginProps } from '@scriba/view'

/** The formatting taken from some text: its marks and the look of its block. */
export interface CopiedFormat {
  readonly marks: readonly Mark[]
  /** Block type and copied attributes, or null when the text is in no textblock. */
  readonly block: { readonly type: NodeType; readonly attrs: Record<string, unknown> } | null
}

interface Config {
  readonly marks: (type: MarkType) => boolean
  readonly blockAttrs: readonly string[]
  readonly blockTypes: readonly string[]
}

interface PainterState {
  readonly format: CopiedFormat | null
  /** The next click or selection in the editor receives the format. */
  readonly armed: boolean
  readonly config: Config
}

export interface FormatPainterOptions {
  /** Marks that are copied (default: formatting, not links or comments: see `isFormattingMark`). */
  marks?: (type: MarkType) => boolean
  /**
   * Block attributes that are copied, when both blocks have them (default:
   * alignment, indentation, line height, direction, class). Never `id`.
   */
  blockAttrs?: readonly string[]
  /** Block types that become one another, e.g. a paragraph becomes a heading (default: paragraph, heading). */
  blockTypes?: readonly string[]
}

const DEFAULT_BLOCK_ATTRS = ['align', 'indent', 'lineHeight', 'dir', 'className']
const DEFAULT_BLOCK_TYPES = ['paragraph', 'heading']
/** Attributes that identify a block: copying them would make duplicates. */
const NEVER_COPIED = new Set(['id', 'blockId'])
/** Class on the editor while the painter waits for its target (the theme sets the cursor). */
export const PAINTING_CLASS = 'scriba-format-painting'

export const formatPainterKey = new PluginKey<PainterState>('formatPainter')

/** True while the painter waits for the text to format. */
export function isFormatPainterArmed(state: EditorState): boolean {
  return !!formatPainterKey.getState(state)?.armed
}

/** The format copied last, or null. */
export function copiedFormat(state: EditorState): CopiedFormat | null {
  return formatPainterKey.getState(state)?.format ?? null
}

/** Marks on every piece of text of the selection (the cursor's marks when empty). */
function commonMarks(state: EditorState, keep: (type: MarkType) => boolean): readonly Mark[] {
  const { empty, from, to, $from } = state.selection
  if (empty) return (state.storedMarks ?? $from.marks()).filter((m) => keep(m.type))
  let common: readonly Mark[] | null = null
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return true
    common = common ? common.filter((m) => m.isInSet(node.marks)) : node.marks
    return false
  })
  return (common ?? $from.marks()).filter((m) => keep(m.type))
}

function readFormat(state: EditorState, cfg: Config): CopiedFormat | null {
  const { $from } = state.selection
  const parent = $from.parent
  if (!parent.isTextblock) return null
  const attrs: Record<string, unknown> = {}
  for (const name of cfg.blockAttrs)
    if (!NEVER_COPIED.has(name) && name in parent.attrs) attrs[name] = parent.attrs[name]
  if (cfg.blockTypes.includes(parent.type.name) && 'level' in parent.attrs)
    attrs['level'] = parent.attrs['level']
  return { marks: commonMarks(state, cfg.marks), block: { type: parent.type, attrs } }
}

const WORD_CHAR = /[\p{L}\p{N}\p{M}_'’-]/u

/** The word around the cursor, inside its block (null between words). */
function wordAt(state: EditorState): { from: number; to: number } | null {
  const { $from } = state.selection
  const parent = $from.parent
  if (!parent.inlineContent) return null
  const text = parent.textBetween(0, parent.content.size, undefined, '\ufffc')
  let start = $from.parentOffset
  let end = start
  while (start > 0 && WORD_CHAR.test(text[start - 1]!)) start--
  while (end < text.length && WORD_CHAR.test(text[end]!)) end++
  if (start === end) return null
  const base = $from.start()
  return { from: base + start, to: base + end }
}

/** Textblocks entirely inside [from, to) (an empty block counts when the cursor is in it). */
function wholeBlocks(state: EditorState, from: number, to: number): { node: Node; pos: number }[] {
  const blocks: { node: Node; pos: number }[] = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    if (pos + 1 >= from && pos + 1 + node.content.size <= to) blocks.push({ node, pos })
    return false
  })
  return blocks
}

/**
 * Gives the selection `format`: its text gets exactly the copied formatting
 * marks (links and comments stay), and the blocks it covers entirely get the
 * copied block look. With a cursor it formats the word around it (or the next
 * typed text). One undo step; the painter stops waiting.
 */
function applyFormat(state: EditorState, format: CopiedFormat, cfg: Config): Transaction | null {
  const sel = state.selection
  if (sel.empty && !sel.$from.parent.inlineContent) return null
  const { from, to } = sel.empty ? (wordAt(state) ?? { from: sel.from, to: sel.from }) : sel
  const tr = state.tr
  if (from < to) {
    for (const type of Object.values(state.schema.marks).filter(cfg.marks))
      tr.removeMark(from, to, type)
    for (const mark of format.marks) tr.addMark(from, to, mark)
  } else {
    // the next typed text: only marks its block allows (none in a code block)
    const parent = sel.$from.parent.type
    const others = (state.storedMarks ?? sel.$from.marks()).filter((m) => !cfg.marks(m.type))
    tr.setStoredMarks([...others, ...format.marks.filter((m) => parent.allowsMarkType(m.type))])
  }
  const source = format.block
  if (source) {
    for (const { node, pos } of wholeBlocks(state, from, to)) {
      const changeType =
        node.type !== source.type &&
        cfg.blockTypes.includes(node.type.name) &&
        cfg.blockTypes.includes(source.type.name) &&
        state.doc.resolve(pos).parent.type.canContain(source.type)
      const type = changeType ? source.type : node.type
      const has = (name: string) => !!type.spec.attrs && name in type.spec.attrs
      const attrs: Record<string, unknown> = {}
      for (const [name, value] of Object.entries(node.attrs)) if (has(name)) attrs[name] = value
      for (const [name, value] of Object.entries(source.attrs))
        // a heading level only goes to a heading
        if (has(name) && (name !== 'level' || type === source.type)) attrs[name] = value
      if (changeType) tr.setBlockType(pos, pos + node.nodeSize, type, attrs)
      else if (Object.keys(attrs).some((k) => attrs[k] !== node.attrs[k]))
        tr.setNodeAttrs(pos, attrs)
    }
  }
  // its own undo step, even right after typing
  return tr.setMeta(formatPainterKey, DISARM).setMeta(CLOSE_HISTORY, true).scrollIntoView()
}

/** Meta value: stop waiting, keep the copied format. */
const DISARM = 'disarm'

/** Live region that tells screen readers what the painter is doing. */
function painterView(editor: EditorView, t: Translate) {
  const doc = editor.document
  const live = doc.createElement('div')
  live.className = 'scriba-visually-hidden'
  live.setAttribute('role', 'status')
  editor.dom.parentNode?.insertBefore(live, editor.dom.nextSibling)
  let wasArmed = false
  let pressed = false
  let clear: ReturnType<typeof setTimeout> | undefined
  const say = (text: string) => {
    live.textContent = text
    clearTimeout(clear)
    clear = setTimeout(() => (live.textContent = ''), 4000)
  }
  const sync = () => {
    const armed = isFormatPainterArmed(editor.state)
    editor.dom.classList.toggle(PAINTING_CLASS, armed)
    if (armed !== wasArmed) say(t(armed ? 'formatPainter.armed' : 'formatPainter.off'))
    wasArmed = armed
  }
  // a click or a mouse selection in the editor, while armed, receives the format
  const down = (e: Event) => {
    pressed = (e as MouseEvent).button === 0 && isFormatPainterArmed(editor.state)
  }
  const up = () => {
    if (!pressed) return
    pressed = false
    editor.syncSelectionFromDOM()
    pasteFormat(editor.state, (tr) => editor.dispatch(tr))
  }
  editor.dom.addEventListener('mousedown', down)
  doc.addEventListener('mouseup', up)
  sync()
  return {
    update: sync,
    destroy() {
      editor.dom.removeEventListener('mousedown', down)
      doc.removeEventListener('mouseup', up)
      editor.dom.classList.remove(PAINTING_CLASS)
      clearTimeout(clear)
      live.remove()
    },
  }
}

/**
 * The format painter (TinyMCE's / Word's): copy the formatting of the text at
 * the cursor, then click a word or select text to give it the same look.
 */
export function formatPainter(
  t: Translate,
  options: FormatPainterOptions = {},
): Plugin<PainterState> {
  const config: Config = {
    marks: options.marks ?? isFormattingMark,
    blockAttrs: (options.blockAttrs ?? DEFAULT_BLOCK_ATTRS).filter((a) => !NEVER_COPIED.has(a)),
    blockTypes: options.blockTypes ?? DEFAULT_BLOCK_TYPES,
  }
  const view: ViewPluginProps = { pluginView: (editor: EditorView) => painterView(editor, t) }
  return new Plugin<PainterState>({
    key: formatPainterKey,
    state: {
      init: () => ({ format: null, armed: false, config }),
      apply: (tr, value) => {
        const meta = tr.getMeta<Partial<PainterState> | typeof DISARM>(formatPainterKey)
        if (!meta) return value
        if (meta === DISARM) return value.armed ? { ...value, armed: false } : value
        return { ...value, ...meta }
      },
    },
    props: { ...view },
  })
}

/** Copies the formatting at the cursor / of the selection (Ctrl+Alt+C), without waiting for a click. */
export const copyFormat: Command = (state, dispatch) => {
  const painter = formatPainterKey.getState(state)
  const format = painter && readFormat(state, painter.config)
  if (!format) return false
  dispatch?.(state.tr.setMeta(formatPainterKey, { format, armed: false }))
  return true
}

/** Gives the selection the copied format (Ctrl+Alt+V). */
export const pasteFormat: Command = (state, dispatch) => {
  const painter = formatPainterKey.getState(state)
  if (!painter?.format) return false
  const tr = applyFormat(state, painter.format, painter.config)
  if (!tr) return false
  dispatch?.(tr)
  return true
}

/**
 * The toolbar button: copies the formatting at the cursor and waits for a click
 * or a selection to apply it once; pressed again (or Esc), it stops waiting.
 */
export const toggleFormatPainter: Command = (state, dispatch) => {
  const painter = formatPainterKey.getState(state)
  if (!painter) return false
  if (painter.armed) {
    dispatch?.(state.tr.setMeta(formatPainterKey, { armed: false }))
    return true
  }
  const format = readFormat(state, painter.config)
  if (!format) return false
  dispatch?.(state.tr.setMeta(formatPainterKey, { format, armed: true }))
  return true
}

/** Esc while waiting: stop without changing anything. */
export const cancelFormatPainter: Command = (state, dispatch) => {
  if (!isFormatPainterArmed(state)) return false
  dispatch?.(state.tr.setMeta(formatPainterKey, { armed: false }))
  return true
}

/** Ctrl+Alt+C copies, Ctrl+Alt+V applies (as in TinyMCE), Esc stops waiting. */
export function formatPainterKeymap(): KeyBindings {
  return {
    'Mod-Alt-c': copyFormat,
    'Mod-Alt-v': pasteFormat,
    Escape: cancelFormatPainter,
  }
}

/** Toolbar button "Format painter" (pressed while it waits for the text to format). */
export function formatPainterItem(): ToolbarButton {
  return {
    type: 'button',
    id: 'format-painter',
    icon: 'formatPainter',
    label: (t) => t('formatPainter.label'),
    shortcut: 'Mod-Alt-c',
    command: toggleFormatPainter,
    isActive: isFormatPainterArmed,
  }
}
