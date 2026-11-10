import type * as Y from 'yjs'
import type { Node, Schema } from '@scriba-editor/core'
import { docFromY } from '@scriba-editor/plugin-collab'

export {
  CollabServer,
  attachCollabServer,
  listenCollabServer,
  rewriteAwareness,
  MESSAGE_SYNC,
  MESSAGE_AWARENESS,
  MESSAGE_AUTH,
  CLOSE,
  type CollabServerOptions,
  type CollabLimits,
  type AuthResult,
  type CollabUserInfo,
} from './server.js'
export { applyAnnotationUpdate, applyGuardedUpdate } from './blocks.js'
export {
  MESSAGE_COMMENTS,
  MAX_THREADS,
  MAX_COMMENTS_PER_THREAD,
  applyCommentOp,
  publicThreads,
  type StoredThread,
  type CommentOp,
} from './comments.js'

/**
 * The shared document as a Scriba document, rebuilt through the schema
 * (unknown or invalid content dropped). Serialize it with `serializeHTML`
 * and, before showing it anywhere else, pass it through `@scriba-editor/sanitize-server`.
 */
export function documentFromYjs(schema: Schema, ydoc: Y.Doc, field = 'scriba'): Node {
  return docFromY(schema, ydoc.getXmlFragment(field))
}
