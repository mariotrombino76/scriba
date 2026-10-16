import * as Y from 'yjs'
import type { Schema } from '@scriba/core'
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
