import type { CommentStore, CommentThread, ThreadKind } from '@scriba-editor/plugin-comments'
import type { CollabProvider } from './provider.js'

const MESSAGE_COMMENTS = 3

/**
 * Comments through `@scriba-editor/collab-server`: every change is checked and
 * stamped by the server (ids, author = the authenticated user, date), and
 * everybody receives the new list at once. Offline, operations are refused.
 */
export function collabCommentStore(provider: CollabProvider): CommentStore & { destroy(): void } {
  let threads: readonly CommentThread[] = []
  let userId: string | null = null
  let refs = 0
  const listeners = new Set<() => void>()
  const pending = new Map<number, { resolve(id?: string): void; reject(e: Error): void }>()
  const waiting = new Map<string, (t: CommentThread) => void>() // created threads, until the next list

  const offStatus = provider.onStatus((status) => {
    if (status === 'connected') return
    for (const p of pending.values()) p.reject(new Error('offline'))
    pending.clear()
  })
  const offMessages = provider.onMessageType(MESSAGE_COMMENTS, (payload) => {
    let msg: {
      type?: string
      ref?: number
      ok?: boolean
      error?: string
      threadId?: string
      threads?: unknown
      you?: unknown
    }
    try {
      msg = JSON.parse(payload)
    } catch {
      return
    }
    if (msg.type === 'snapshot' && Array.isArray(msg.threads)) {
      threads = msg.threads as CommentThread[]
      userId = typeof msg.you === 'string' ? msg.you : null
      for (const [id, resolve] of waiting) {
        const t = threads.find((x) => x.id === id)
        if (t) {
          waiting.delete(id)
          resolve(t)
        }
      }
      listeners.forEach((l) => l())
    } else if (msg.type === 'result' && typeof msg.ref === 'number') {
      const p = pending.get(msg.ref)
      pending.delete(msg.ref)
      if (!p) return
      if (msg.ok) p.resolve(msg.threadId)
      else p.reject(new Error(msg.error ?? 'refused'))
    }
  })

  const send = (op: Record<string, unknown>) =>
    new Promise<string | undefined>((resolve, reject) => {
      const ref = ++refs
      pending.set(ref, { resolve, reject })
      if (!provider.sendMessageType(MESSAGE_COMMENTS, JSON.stringify({ ref, ...op }))) {
        pending.delete(ref)
        reject(new Error('offline'))
      }
    })

  return {
    get userId() {
      return userId
    },
    threads: () => threads,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async createThread(kind: ThreadKind, text: string) {
      const id = await send({ op: 'create', kind, text })
      if (!id) throw new Error('refused')
      const existing = threads.find((t) => t.id === id)
      return existing ?? new Promise<CommentThread>((resolve) => waiting.set(id, resolve))
    },
    async reply(threadId, text) {
      await send({ op: 'reply', threadId, text })
    },
    async setResolved(threadId, resolved) {
      await send({ op: 'resolve', threadId, resolved })
    },
    async deleteComment(threadId, commentId) {
      await send({ op: 'deleteComment', threadId, commentId })
    },
    async deleteThread(threadId) {
      await send({ op: 'deleteThread', threadId })
    },
    destroy() {
      offStatus()
      offMessages()
    },
  }
}
