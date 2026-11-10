import {
  EditorState,
  Selection,
  type Command,
  type Node,
  type NodeType,
  type Transaction,
} from '@scriba-editor/core'
import type { A11yLevel, WcagCriterion } from './types.js'

/** The WCAG 2.2 success criteria the checks refer to. */
export const WCAG = {
  nonTextContent: { id: '1.1.1', level: 'A', slug: 'non-text-content' },
  infoAndRelationships: { id: '1.3.1', level: 'A', slug: 'info-and-relationships' },
  contrastMinimum: { id: '1.4.3', level: 'AA', slug: 'contrast-minimum' },
  contrastEnhanced: { id: '1.4.6', level: 'AAA', slug: 'contrast-enhanced' },
  visualPresentation: { id: '1.4.8', level: 'AAA', slug: 'visual-presentation' },
  linkPurpose: { id: '2.4.4', level: 'A', slug: 'link-purpose-in-context' },
  headingsAndLabels: { id: '2.4.6', level: 'AA', slug: 'headings-and-labels' },
  nameRoleValue: { id: '4.1.2', level: 'A', slug: 'name-role-value' },
} as const satisfies Record<string, WcagCriterion>

const LEVELS: Record<A11yLevel, number> = { A: 1, AA: 2, AAA: 3 }

/** Whether a criterion is part of the checked level (AA includes A, AAA includes both). */
export const withinLevel = (criterion: WcagCriterion, level: A11yLevel) =>
  LEVELS[criterion.level] <= LEVELS[level]

/** A repair command that only works on the document the issue was found in. */
export function onDoc(doc: Node, build: (tr: Transaction) => boolean): Command {
  return (state, dispatch) => {
    if (state.doc !== doc) return false
    const tr = state.tr
    if (!build(tr)) return false
    dispatch?.(tr.scrollIntoView())
    return true
  }
}

/**
 * Runs `command` as if `selection` were the selection of `tr`'s current
 * document and adds its steps to `tr` (to reuse the commands of other plugins).
 */
export function runWithSelection(
  tr: Transaction,
  selection: (doc: Node) => Selection,
  command: Command,
): boolean {
  const temp = EditorState.create({ doc: tr.doc, selection: selection(tr.doc) })
  let result: Transaction | null = null
  if (!command(temp, (t) => (result = t))) return false
  const done = result as Transaction | null
  if (!done) return false
  for (const step of done.steps) tr.step(step)
  tr.setSelection(Selection.fromJSON(tr.doc, done.selection.toJSON()))
  return true
}

/** Content range of a textblock at `pos`. */
export const contentRange = (node: Node, pos: number) => ({
  kind: 'text' as const,
  from: pos + 1,
  to: pos + node.nodeSize - 1,
})

/** Attributes of `node` that `type` also has (alignment, class… survive a type change). */
export function sharedAttrs(node: Node, type: NodeType, extra: Record<string, unknown> = {}) {
  const attrs: Record<string, unknown> = {}
  for (const name of Object.keys(type.spec.attrs ?? {}))
    if (name in node.attrs) attrs[name] = node.attrs[name]
  return { ...attrs, ...extra }
}

/** Plain text with whitespace collapsed. */
export const plain = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Text from outside (a dialog field): control characters become spaces, within `max`. */
export function cleanText(raw: string, max: number): string {
  return [...raw]
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}
