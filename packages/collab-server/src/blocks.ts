import * as Y from 'yjs'
import type { Node, NodeJSON, Schema } from '@scriba/core'
import { docFromY } from '@scriba/plugin-collab'
import { checkBlockEdits, type BlockRules } from '@scriba/plugin-permissions'

/**
 * Applies an update from a user who may not edit some blocks (§5.1, §5.8).
 * The update is applied, then the document is compared with the one before
 * (`checkBlockEdits`): when it changed, deleted or added a protected block,
 * its changes are undone at once. The undo is a normal update, so it reaches
 * everyone, the sender included, and all copies converge again. A plain
 * refusal would not: the sender already applied its change locally.
 *
 * Returns the ids of the protected blocks the update touched (empty: kept).
 */
export function applyGuardedUpdate(
  ydoc: Y.Doc,
  update: Uint8Array,
  origin: object,
  schema: Schema,
  rules: BlockRules,
  field = 'scriba',
): string[] {
  const fragment = ydoc.getXmlFragment(field)
  const before = docFromY(schema, fragment)
  const undo = new Y.UndoManager(fragment, {
    trackedOrigins: new Set([origin]),
    captureTimeout: 0,
  })
  try {
    Y.applyUpdate(ydoc, update, origin)
    const touched = checkBlockEdits(before, docFromY(schema, fragment), rules)
    if (touched.length) while (undo.undoStack.length) undo.undo()
    return touched
  } finally {
    undo.destroy()
  }
}

/** JSON of a document without annotation marks (comment anchors…), to compare contents. */
function withoutAnnotations(doc: Node, schema: Schema): string {
  const strip = (json: NodeJSON): NodeJSON => {
    const marks = json.marks?.filter((m) => schema.marks[m.type]?.spec.annotation !== true)
    const content: NodeJSON[] = []
    for (const child of json.content?.map(strip) ?? []) {
      // a comment splits text in two: once it is gone, the halves are one text again
      const prev = content[content.length - 1]
      if (prev?.type === 'text' && child.type === 'text' && sameMarks(prev, child))
        content[content.length - 1] = { ...prev, text: (prev.text ?? '') + (child.text ?? '') }
      else content.push(child)
    }
    const out: NodeJSON = { ...json }
    if (marks?.length) out.marks = marks
    else delete out.marks
    if (json.content) out.content = content
    return out
  }
  const sameMarks = (a: NodeJSON, b: NodeJSON) =>
    JSON.stringify(a.marks ?? []) === JSON.stringify(b.marks ?? [])
  return JSON.stringify(strip(doc.toJSON()))
}

/**
 * Applies an update from a commenter (read-only, may comment): kept only if
 * it changed nothing but annotation marks (e.g. comment anchors), otherwise
 * undone for everyone like `applyGuardedUpdate`. Returns true when kept.
 */
export function applyAnnotationUpdate(
  ydoc: Y.Doc,
  update: Uint8Array,
  origin: object,
  schema: Schema,
  field = 'scriba',
): boolean {
  const fragment = ydoc.getXmlFragment(field)
  const before = withoutAnnotations(docFromY(schema, fragment), schema)
  const undo = new Y.UndoManager(fragment, { trackedOrigins: new Set([origin]), captureTimeout: 0 })
  try {
    Y.applyUpdate(ydoc, update, origin)
    if (withoutAnnotations(docFromY(schema, fragment), schema) === before) return true
    while (undo.undoStack.length) undo.undo()
    return false
  } finally {
    undo.destroy()
  }
}
