import {
  CLOSE_HISTORY,
  Plugin,
  PluginKey,
  TextSelection,
  blockRange,
  findWrapping,
  sanitizeUrl,
  undo,
  type Command,
  type EditorState,
  type MarkType,
  type Node,
  type NodeType,
  type Transaction,
} from '@scriba/core'
import type { EditorView, ViewPluginProps } from '@scriba/view'

/**
 * An input rule (simple picture: a typing shortcut). When the text before the
 * cursor, including the character just typed, matches `match` (which must end
 * with `$`), `apply` turns it into structure or formatting.
 * `start`/`end` are the document positions of the whole match.
 */
export interface InputRule {
  match: RegExp
  apply(state: EditorState, match: RegExpExecArray, start: number, end: number): Transaction | null
  /** Also inside code (blocks and inline code marks). Default false. */
  inCode?: boolean
}

/** Longest text before the cursor that rules look at. */
const MAX_LOOKBEHIND = 500
const LEAF = '￼'

interface RuleState {
  /** The document right after a rule was applied (Backspace then undoes the rule). */
  undoable: Node | null
}

export const inputRulesKey = new PluginKey<RuleState>('inputRules')

function textBefore(state: EditorState, pos: number): string {
  const $pos = state.doc.resolve(pos)
  const start = Math.max(0, $pos.parentOffset - MAX_LOOKBEHIND)
  return $pos.parent.content.textBetween(start, $pos.parentOffset, undefined, LEAF)
}

function inCode(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos)
  return (
    !!$pos.parent.type.spec.code ||
    $pos.marks().some((m) => m.type.spec.code || m.type.name === 'code')
  )
}

/**
 * The typed character is inserted first (a normal typing step), then the rule
 * runs as its own undo step: Ctrl+Z, or Backspace right after, gives back the
 * typed text (e.g. "# ") instead of the heading.
 */
function runRules(
  view: EditorView,
  rules: readonly InputRule[],
  from: number,
  to: number,
  text: string,
): boolean {
  const before = view.state
  if (view.composing || (!before.selection.empty && from === to)) return false
  const $from = before.doc.resolve(from)
  if (!$from.parent.inlineContent || !$from.sameParent(before.doc.resolve(to))) return false
  const typed = textBefore(before, from) + text
  const candidates = rules.filter((rule) => {
    rule.match.lastIndex = 0
    return rule.match.test(typed) && (rule.inCode || !inCode(before, from))
  })
  if (!candidates.length) return false
  // 1) the character, as typed
  view.dispatch(before.tr.insertText(text, from, to))
  // 2) the first rule that applies
  const state = view.state
  const end = from + text.length
  const now = textBefore(state, end)
  for (const rule of candidates) {
    rule.match.lastIndex = 0
    const m = rule.match.exec(now)
    if (!m) continue
    const tr = rule.apply(state, m, end - m[0].length, end)
    if (!tr) continue
    tr.setMeta(CLOSE_HISTORY, true)
    view.dispatch(tr.setMeta(inputRulesKey, { undoable: null }).scrollIntoView())
    view.dispatch(view.state.tr.setMeta(inputRulesKey, { undoable: view.state.doc }))
    return true
  }
  return true // the character was inserted
}

/** Backspace right after a rule: back to the typed text (undoes the rule step). */
export const undoInputRule: Command = (state, dispatch, view) => {
  const rs = inputRulesKey.getState(state)
  if (!rs?.undoable || rs.undoable !== state.doc) return false
  return undo(state, dispatch, view)
}

/** The plugin running input rules on typed text. */
export function inputRules(rules: readonly InputRule[]): Plugin<RuleState> {
  const props: ViewPluginProps = {
    handleTextInput: (view, from, to, text) => runRules(view, rules, from, to, text),
  }
  return new Plugin<RuleState>({
    key: inputRulesKey,
    state: {
      init: () => ({ undoable: null }),
      apply(tr, value) {
        const meta = tr.getMeta<RuleState>(inputRulesKey)
        if (meta) return meta
        // any other change or cursor move ends the "Backspace undoes" window
        return tr.docChanged || tr.selectionSet ? { undoable: null } : value
      },
    },
    props: { ...props },
  })
}

// --- Rule builders --------------------------------------------------------

/** Block rule: the match (at the start of a paragraph) is removed, then `change` reshapes the block. */
function blockRule(
  match: RegExp,
  change: (tr: Transaction, start: number, m: RegExpExecArray) => boolean,
  only: (block: Node) => boolean = (b) => b.type.name === 'paragraph',
): InputRule {
  return {
    match,
    apply(state, m, start, end) {
      const $start = state.doc.resolve(start)
      if ($start.parentOffset !== 0 || !only($start.parent)) return null
      const tr = state.tr.delete(start, end)
      try {
        return change(tr, start, m) ? tr : null
      } catch {
        return null // not allowed here by the schema
      }
    },
  }
}

/** Wraps the current block in `type` (e.g. a list), joining a list of the same type just before it. */
function wrapBlock(type: NodeType, attrs?: (m: RegExpExecArray) => Record<string, unknown>) {
  return (tr: Transaction, start: number, m: RegExpExecArray): boolean => {
    const $pos = tr.doc.resolve(start)
    const range = blockRange($pos, $pos)
    const wrapping = range && findWrapping(range, type, attrs?.(m) ?? null)
    if (!range || !wrapping) return false
    tr.wrap(range, wrapping)
    const before = range.start // position before the new wrapper
    const $before = tr.doc.resolve(before)
    const prev = $before.nodeBefore
    if (prev && prev.type === type && type.name !== 'blockquote') {
      try {
        tr.join(before)
      } catch {
        /* not joinable: keep two lists */
      }
    }
    return true
  }
}

/** Inline rule: `open text close` → text with a mark (delimiters removed). */
function markRule(match: RegExp, type: MarkType): InputRule {
  return {
    match,
    apply(state, m, start, end) {
      const text = m[2]!
      const lead = m[1] ?? ''
      const from = start + lead.length
      const textStart = end - m[0].length + m[0].indexOf(text, lead.length)
      const textEnd = textStart + text.length
      const tr = state.tr
      tr.delete(textEnd, end) // closing delimiter
      tr.delete(from, textStart) // opening delimiter
      const markedEnd = from + text.length
      tr.addMark(from, markedEnd, type.create())
      tr.setSelection(TextSelection.create(tr.doc, markedEnd))
      tr.removeStoredMark(type) // typing goes on without the mark
      return tr
    },
  }
}

/** Markdown typing shortcuts for the node and mark types the schema has. */
export function markdownInputRules(schema: {
  nodes: Record<string, NodeType | undefined>
  marks: Record<string, MarkType | undefined>
}): InputRule[] {
  const n = schema.nodes
  const k = schema.marks
  const rules: InputRule[] = []
  if (n['heading'])
    rules.push(
      blockRule(
        /^(#{1,6})\s$/,
        (tr, start, m) => {
          tr.setBlockType(start, start, n['heading']!, { level: m[1]!.length })
          return true
        },
        (b) => b.type.name === 'paragraph' || b.type.name === 'heading',
      ),
    )
  if (n['bullet_list']) rules.push(blockRule(/^\s*[-*+]\s$/, wrapBlock(n['bullet_list'])))
  if (n['ordered_list'])
    rules.push(
      blockRule(
        /^(\d{1,9})[.)]\s$/,
        wrapBlock(n['ordered_list'], (m) => ({ start: Math.min(Number(m[1]), 99_999) })),
      ),
    )
  if (n['blockquote']) rules.push(blockRule(/^>\s$/, wrapBlock(n['blockquote'])))
  if (n['horizontal_rule']) {
    const hr = n['horizontal_rule']
    // "---" (or "___", "***") alone in a paragraph: a horizontal line, the text goes on below
    rules.push(
      blockRule(/^(?:---|___|\*\*\*)$/, (tr, start) => {
        const $pos = tr.doc.resolve(start)
        if ($pos.parent.content.size) return false
        const para = $pos.parent.type
        tr.replaceWith($pos.before(), $pos.after(), [hr.create(), para.create()])
        tr.setSelection(TextSelection.create(tr.doc, $pos.before() + 2))
        return true
      }),
    )
  }
  if (n['code_block'])
    rules.push(
      blockRule(/^```([a-z0-9][a-z0-9+#_-]{0,31})?\s$/i, (tr, start, m) => {
        tr.setBlockType(
          start,
          start,
          n['code_block']!,
          m[1] ? { language: m[1].toLowerCase() } : null,
        )
        return true
      }),
    )
  // Inline marks: the closing delimiter just typed; content must not start/end with a space.
  const inner = (d: string) =>
    `((?:[^${d}\\s${LEAF}])|(?:[^${d}\\s${LEAF}][^${d}${LEAF}]*[^${d}\\s${LEAF}]))`
  if (k['bold']) {
    rules.push(markRule(new RegExp(`(^|[^*])\\*\\*${inner('*')}\\*\\*$`), k['bold']))
    rules.push(markRule(new RegExp(`(^|[^_\\p{L}\\p{N}])__${inner('_')}__$`, 'u'), k['bold']))
  }
  if (k['italic']) {
    rules.push(markRule(new RegExp(`(^|[^*])\\*${inner('*')}\\*$`), k['italic']))
    rules.push(markRule(new RegExp(`(^|[^_\\p{L}\\p{N}])_${inner('_')}_$`, 'u'), k['italic']))
  }
  if (k['strike']) rules.push(markRule(new RegExp(`(^|[^~])~~${inner('~')}~~$`), k['strike']))
  if (k['code']) rules.push(markRule(new RegExp(`(^|[^\`])\`${inner('`')}\`$`), k['code']))
  if (k['link']) {
    const link = k['link']
    rules.push({
      match: /(^|[^!])\[([^\]\n￼]{1,500})\]\(([^()\s￼]{1,2000})\)$/,
      apply(state, m, start, end) {
        const href = sanitizeUrl(m[3], { kind: 'link' }) // whitelist (§5.3)
        if (!href) return null
        const from = start + m[1]!.length
        const tr = state.tr.insertText(m[2]!, from, end)
        tr.addMark(from, from + m[2]!.length, link.create({ href }))
        tr.removeStoredMark(link)
        return tr
      },
    })
  }
  return rules
}
