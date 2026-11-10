import {
  AddMarkStep,
  RemoveMarkStep,
  SetAttrsStep,
  SetNodeTypeStep,
  type Node,
  type NodeJSON,
  type Transaction,
} from '@scriba-editor/core'
import { blockIdOf } from './ids.js'

/** Whether the current user may change the block with this id. */
export type CanEdit = (id: string) => boolean

export interface BlockRules {
  canEdit: CanEdit
  /**
   * Marks that may be added to or removed from protected text because they
   * do not change it (default: `comment`, so people can still comment).
   */
  allowMarks?: readonly string[]
}

const DEFAULT_ALLOWED: readonly string[] = ['comment']

/** Tells whether a node is a block the user may not edit (cached per id). @internal */
export function lockedTest(rules: BlockRules): (node: Node) => boolean {
  const cache = new Map<string, boolean>()
  return (node) => {
    const id = blockIdOf(node)
    if (id === null) return false
    let locked = cache.get(id)
    if (locked === undefined) cache.set(id, (locked = !rules.canEdit(id)))
    return locked
  }
}

/** A protected block inside, or overlapping, `from…to` of `doc`. */
function touchesLocked(doc: Node, from: number, to: number, locked: (n: Node) => boolean): boolean {
  for (const pos of from === to ? [from] : [from, to]) {
    const $pos = doc.resolve(pos)
    for (let d = 1; d <= $pos.depth; d++) if (locked($pos.node(d))) return true
  }
  if (from === to) return false
  let found = false
  doc.nodesBetween(from, to, (node) => {
    if (found) return false
    if (locked(node)) found = true
    return !found
  })
  return found
}

/**
 * Whether a transaction leaves every protected block as it was: no change
 * inside one, no deletion, no new block carrying a protected id. Checks only
 * what each step changed, so it stays fast on large documents.
 */
export function transactionAllowed(tr: Transaction, rules: BlockRules): boolean {
  const locked = lockedTest(rules)
  const allowed = rules.allowMarks ?? DEFAULT_ALLOWED
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i]!
    const before = tr.docs[i]!
    const after = tr.docs[i + 1] ?? tr.doc
    if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
      if (allowed.includes(step.mark.type.name)) continue
      if (touchesLocked(before, step.from, step.to, locked)) return false
      continue
    }
    if (step instanceof SetAttrsStep || step instanceof SetNodeTypeStep) {
      const node = before.nodeAt(step.pos)
      if (!node || touchesLocked(before, step.pos, step.pos + node.nodeSize, locked)) return false
      const changed = after.nodeAt(step.pos)
      if (!changed || touchesLocked(after, step.pos, step.pos + changed.nodeSize, locked))
        return false
      continue
    }
    let ok = true
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      if (!ok) return
      if (touchesLocked(before, oldStart, oldEnd, locked)) ok = false
      else if (touchesLocked(after, newStart, newEnd, locked)) ok = false
    })
    if (!ok) return false
  }
  return true
}

/** JSON of a node without the allowed marks (they may differ). */
function comparable(json: NodeJSON, allowed: readonly string[]): unknown {
  const marks = json.marks?.filter((m) => !allowed.includes(m.type))
  return {
    ...json,
    marks: marks?.length ? marks : undefined,
    content: json.content?.map((c) => comparable(c, allowed)),
  }
}

function lockedBlocks(doc: Node, locked: (n: Node) => boolean, allowed: readonly string[]) {
  const out: { id: string; json: string }[] = []
  doc.descendants((node) => {
    if (!locked(node)) return true
    out.push({ id: blockIdOf(node)!, json: JSON.stringify(comparable(node.toJSON(), allowed)) })
    return false // its content is part of it
  })
  return out
}

/**
 * Server-side check of a saved or received document (CLAUDE.md §5.1, §5.8):
 * every block the user may not edit must be in `after` exactly as in
 * `before` (same order, same content; allowed marks aside), and no new
 * block may carry a protected id. Returns the ids that were changed, deleted
 * or added (empty: the edit is allowed).
 */
export function checkBlockEdits(before: Node, after: Node, rules: BlockRules): string[] {
  const locked = lockedTest(rules)
  const allowed = rules.allowMarks ?? DEFAULT_ALLOWED
  const a = lockedBlocks(before, locked, allowed)
  const b = lockedBlocks(after, locked, allowed)
  const bad = new Set<string>()
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i]
    const y = b[i]
    if (x && y && x.id === y.id && x.json === y.json) continue
    if (x) bad.add(x.id)
    if (y) bad.add(y.id)
  }
  return [...bad]
}
