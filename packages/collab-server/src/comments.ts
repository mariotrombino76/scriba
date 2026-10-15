import { randomUUID } from 'node:crypto'
import { cleanCommentText, type CommentThread } from '@scriba/plugin-comments'

/** Comments channel message type (after sync 0, awareness 1, auth 2). */
export const MESSAGE_COMMENTS = 3

export const MAX_THREADS = 2000
export const MAX_COMMENTS_PER_THREAD = 200

/** A thread as stored by the server (who opened it decides who may delete it). */
export interface StoredThread extends CommentThread {
  createdBy: string
}

export type CommentOp =
  | { op: 'create'; kind: 'comment' | 'suggestion'; text: string }
  | { op: 'reply'; threadId: string; text: string }
  | { op: 'resolve'; threadId: string; resolved: boolean }
  | { op: 'deleteComment'; threadId: string; commentId: string }
  | { op: 'deleteThread'; threadId: string }

/**
 * Applies an operation from an authenticated user. Ids, author and date are
 * set here, never taken from the client (§5.8). Returns the new list and the
 * created thread id, or an error code.
 */
export function applyCommentOp(
  threads: readonly StoredThread[],
  raw: unknown,
  user: { id: string; name: string },
  canWrite: boolean,
): { threads: StoredThread[]; threadId?: string } | { error: string } {
  if (!canWrite) return { error: 'read-only' }
  if (!raw || typeof raw !== 'object') return { error: 'bad-request' }
  const op = raw as Record<string, unknown>
  const name = String(user.name).replace(/\s+/g, ' ').trim().slice(0, 60)
  const entry = (text: string) => ({
    id: randomUUID(),
    author: { id: user.id, name },
    text,
    createdAt: Date.now(),
  })
  const find = () => threads.find((t) => t.id === op['threadId'])
  switch (op['op']) {
    case 'create': {
      const kind =
        op['kind'] === 'suggestion' ? 'suggestion' : op['kind'] === 'comment' ? 'comment' : null
      const text = cleanCommentText(op['text'], kind === 'suggestion')
      if (!kind || text === null) return { error: 'bad-request' }
      if (threads.length >= MAX_THREADS) return { error: 'limit' }
      const thread: StoredThread = {
        id: randomUUID(),
        kind,
        author: { id: user.id, name },
        resolved: false,
        comments: text ? [entry(text)] : [],
        createdBy: user.id,
      }
      return { threads: [...threads, thread], threadId: thread.id }
    }
    case 'reply': {
      const thread = find()
      const text = cleanCommentText(op['text'])
      if (!thread || text === null) return { error: 'bad-request' }
      if (thread.comments.length >= MAX_COMMENTS_PER_THREAD) return { error: 'limit' }
      return {
        threads: threads.map((t) =>
          t === thread ? { ...t, comments: [...t.comments, entry(text)] } : t,
        ),
      }
    }
    case 'resolve': {
      const thread = find()
      if (!thread || typeof op['resolved'] !== 'boolean') return { error: 'bad-request' }
      return {
        threads: threads.map((t) =>
          t === thread ? { ...t, resolved: op['resolved'] as boolean } : t,
        ),
      }
    }
    case 'deleteComment': {
      const thread = find()
      const comment = thread?.comments.find((c) => c.id === op['commentId'])
      if (!thread || !comment) return { error: 'bad-request' }
      if (comment.author.id !== user.id) return { error: 'forbidden' }
      return {
        threads: threads.map((t) =>
          t === thread ? { ...t, comments: t.comments.filter((c) => c !== comment) } : t,
        ),
      }
    }
    case 'deleteThread': {
      const thread = find()
      if (!thread) return { error: 'bad-request' }
      if (thread.createdBy !== user.id) return { error: 'forbidden' }
      return { threads: threads.filter((t) => t !== thread) }
    }
    default:
      return { error: 'bad-request' }
  }
}

/** What clients receive (without the server-only `createdBy`). */
export function publicThreads(threads: readonly StoredThread[]): CommentThread[] {
  return threads.map(({ createdBy: _c, ...t }) => t)
}
