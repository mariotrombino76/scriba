import { Plugin, PluginKey, type Command, type EditorState, type Transaction } from '@scriba-editor/core'
import type { InlineDecoration } from '@scriba-editor/view'
import { checkAccessibility, resolveOptions, targetStart } from './check.js'
import type { A11yIssue, A11yOptions, A11yRuleId, A11yTarget } from './types.js'

/** An issue the user chose to ignore: its check and where it starts (mapped through changes). */
interface Ignored {
  readonly rule: A11yRuleId
  readonly pos: number
}

interface CheckerState {
  readonly options: A11yOptions
  readonly ignored: readonly Ignored[]
  /** The issue shown in the dialog (highlighted in the text). */
  readonly current: A11yTarget | null
}

type Meta = { ignore: Ignored } | { current: A11yTarget | null } | { clearIgnored: true }

export const a11yCheckerKey = new PluginKey<CheckerState>('a11yChecker')

/** Class of the text of the issue shown in the dialog (the theme outlines it). */
export const A11Y_CURRENT_CLASS = 'scriba-a11y-current'

function mapTarget(target: A11yTarget, tr: Transaction): A11yTarget | null {
  if (target.kind === 'node') {
    const r = tr.mapping.mapResult(target.pos, 1)
    return r.deleted ? null : { kind: 'node', pos: r.pos }
  }
  const from = tr.mapping.map(target.from, 1)
  const to = Math.max(from, tr.mapping.map(target.to, -1))
  return { kind: 'text', from, to }
}

/**
 * The accessibility checker's state: options, ignored issues (for this
 * session: they are not saved in the document) and the highlighted issue.
 */
export function a11yChecker(options: A11yOptions = {}): Plugin {
  resolveOptions(options) // invalid options fail now, not when the dialog opens
  return new Plugin<CheckerState>({
    key: a11yCheckerKey,
    state: {
      init: () => ({ options, ignored: [], current: null }),
      apply(tr, value) {
        const meta = tr.getMeta(a11yCheckerKey) as Meta | undefined
        let { ignored, current } = value
        if (tr.docChanged) {
          ignored = ignored.flatMap((i) => {
            const r = tr.mapping.mapResult(i.pos, 1)
            return r.deleted ? [] : [{ rule: i.rule, pos: r.pos }]
          })
          current = current && mapTarget(current, tr)
        }
        if (meta && 'ignore' in meta) ignored = [...ignored, meta.ignore]
        if (meta && 'clearIgnored' in meta) ignored = []
        if (meta && 'current' in meta) current = meta.current
        return ignored === value.ignored && current === value.current
          ? value
          : { options, ignored, current }
      },
    },
    props: {
      decorations: (state: EditorState): InlineDecoration[] => {
        const current = a11yCheckerKey.getState(state)?.current
        if (!current || current.kind !== 'text' || current.from >= current.to) return []
        // one decoration per textblock: decorations stay inside a block
        const out: InlineDecoration[] = []
        state.doc.nodesBetween(current.from, current.to, (node, pos) => {
          if (!node.isTextblock) return true
          const from = Math.max(current.from, pos + 1)
          const to = Math.min(current.to, pos + node.nodeSize - 1)
          if (from < to) out.push({ from, to, class: A11Y_CURRENT_CLASS })
          return false
        })
        return out
      },
    },
  })
}

/** The document's issues, without the ignored ones (empty without the plugin). */
export function a11yIssues(state: EditorState): A11yIssue[] {
  const plugin = a11yCheckerKey.getState(state)
  if (!plugin) return []
  return checkAccessibility(state.doc, plugin.options).filter(
    (issue) =>
      !plugin.ignored.some((i) => i.rule === issue.rule && i.pos === targetStart(issue.target)),
  )
}

/** Hides an issue until the editor is reloaded (TinyMCE's "Ignore"). */
export function ignoreIssue(issue: A11yIssue): Command {
  return (state, dispatch) => {
    if (!a11yCheckerKey.getState(state)) return false
    dispatch?.(
      state.tr.setMeta(a11yCheckerKey, {
        ignore: { rule: issue.rule, pos: targetStart(issue.target) },
      }),
    )
    return true
  }
}

/** Shows the ignored issues again. */
export const clearIgnoredIssues: Command = (state, dispatch) => {
  if (!a11yCheckerKey.getState(state)?.ignored.length) return false
  dispatch?.(state.tr.setMeta(a11yCheckerKey, { clearIgnored: true }))
  return true
}

/** Highlights an issue's text (null: none). */
export function setCurrentIssue(target: A11yTarget | null): Command {
  return (state, dispatch) => {
    if (!a11yCheckerKey.getState(state)) return false
    dispatch?.(state.tr.setMeta(a11yCheckerKey, { current: target }))
    return true
  }
}
