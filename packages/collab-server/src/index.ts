import type * as Y from 'yjs'
import type { Node, Schema } from '@scriba/core'
import { docFromY } from '@scriba/plugin-collab'

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

/**
 * The shared document as a Scriba document, rebuilt through the schema
 * (unknown or invalid content dropped). Serialize it with `serializeHTML`
 * and, before showing it anywhere else, pass it through `@scriba/sanitize-server`.
 */
export function documentFromYjs(schema: Schema, ydoc: Y.Doc, field = 'scriba'): Node {
  return docFromY(schema, ydoc.getXmlFragment(field))
}
