import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import type { Plugin } from '@scriba/core'
import { yBinding } from './binding.js'
import { collabCursors, type CollabUser } from './cursors.js'
import { CollabProvider } from './provider.js'
export {
  yBinding,
  yBindingKey,
  remoteTransaction,
  REMOTE_META,
  type YBindingOptions,
} from './binding.js'
export { toY, nodeFromY, docFromY, updateFragment, writeDoc } from './mapping.js'
export { diffStart, diffEnd } from './diff.js'
export {
  collabCursors,
  cursorsKey,
  type CollabUser,
  type CursorsOptions,
  type RemoteCursor,
} from './cursors.js'
export { toRelative, fromRelative } from './positions.js'
export {
  CollabProvider,
  collabStatusElement,
  type CollabProviderOptions,
  type CollabStatus,
} from './provider.js'

export interface CollabSetupOptions {
  /** Collaboration server URL (see `@scriba/collab-server`). */
  url: string
  documentName: string
  token: string | (() => string | Promise<string>)
  /** Your name and color (the server replaces them with your authenticated identity). */
  user?: CollabUser
  field?: string
}

/**
 * Everything for a collaborative editor in one call: the shared Yjs document,
 * the connection and the plugins (document sync and cursors). Add `plugins`
 * to the state; make the view read-only while `provider.canWrite` is false.
 */
export function collab(options: CollabSetupOptions): {
  ydoc: Y.Doc
  awareness: Awareness
  provider: CollabProvider
  plugins: Plugin[]
  destroy(): void
} {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const provider = new CollabProvider({
    url: options.url,
    documentName: options.documentName,
    token: options.token,
    ydoc,
    awareness,
  })
  const field = options.field ?? 'scriba'
  return {
    ydoc,
    awareness,
    provider,
    plugins: [
      yBinding({ ydoc, field, synced: provider.synced }),
      collabCursors({ awareness, field, ...(options.user ? { user: options.user } : {}) }),
    ],
    destroy() {
      provider.destroy()
      ydoc.destroy()
    },
  }
}
export { collabCommentStore } from './comments.js'
