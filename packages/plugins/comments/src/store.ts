/** Who wrote a comment (assigned by the store / server, never by the page, §5.8). */
export interface CommentAuthor {
  id: string
  name: string
}

export interface CommentEntry {
  id: string
  author: CommentAuthor
  /** Plain text (shown as text, never as HTML). */
  text: string
  /** Milliseconds since 1970 (set by the store / server). */
  createdAt: number
}

export type ThreadKind = 'comment' | 'suggestion'

export interface CommentThread {
  id: string
  kind: ThreadKind
  resolved: boolean
  /** The first entry opens the thread (for a suggestion: an optional note). */
  comments: CommentEntry[]
}

/**
 * Where threads live. Every id, author and date is decided by the store —
 * in practice by YOUR backend from the user's session, so nobody can sign as
 * someone else (§5.8). Rejected operations reject their promise.
 */
export interface CommentStore {
  /** The current user's id (to offer "delete" on their own comments), if known. */
  readonly userId: string | null
  threads(): readonly CommentThread[]
  /** Calls `listener` whenever threads change (also because of other users). */
  subscribe(listener: () => void): () => void
  createThread(kind: ThreadKind, text: string): Promise<CommentThread>
  reply(threadId: string, text: string): Promise<void>
  setResolved(threadId: string, resolved: boolean): Promise<void>
  deleteComment(threadId: string, commentId: string): Promise<void>
  deleteThread(threadId: string): Promise<void>
}

export const MAX_COMMENT_LENGTH = 5000

/** Comment text as stored: trimmed, bounded, never empty (null when invalid). */
export function cleanCommentText(text: unknown, allowEmpty = false): string | null {
  if (typeof text !== 'string') return null
  const clean = text.replace(/\r\n?/g, '\n').trim().slice(0, MAX_COMMENT_LENGTH)
  return clean || allowEmpty ? clean : null
}

let counter = 0
const newId = () => `c${Date.now().toString(36)}${(++counter).toString(36)}`

/**
 * A store kept in memory, for a single user (tests, demos, offline notes).
 * The author is whoever you pass: NOT a protection — with several users use a
 * backend (or the collaboration server) that assigns authors itself.
 */
export function createMemoryCommentStore(user: CommentAuthor): CommentStore {
  let threads: CommentThread[] = []
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const find = (id: string) => {
    const t = threads.find((x) => x.id === id)
    if (!t) throw new Error('unknown thread')
    return t
  }
  const update = (id: string, change: (t: CommentThread) => CommentThread) => {
    find(id)
    threads = threads.map((t) => (t.id === id ? change(t) : t))
    emit()
  }
  const entry = (text: string): CommentEntry => ({
    id: newId(),
    author: { ...user },
    text,
    createdAt: Date.now(),
  })
  return {
    userId: user.id,
    threads: () => threads,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async createThread(kind, text) {
      const clean = cleanCommentText(text, kind === 'suggestion')
      if (clean === null) throw new Error('empty comment')
      const thread: CommentThread = {
        id: newId(),
        kind,
        resolved: false,
        comments: clean ? [entry(clean)] : [],
      }
      threads = [...threads, thread]
      emit()
      return thread
    },
    async reply(threadId, text) {
      const clean = cleanCommentText(text)
      if (clean === null) throw new Error('empty comment')
      update(threadId, (t) => ({ ...t, comments: [...t.comments, entry(clean)] }))
    },
    async setResolved(threadId, resolved) {
      update(threadId, (t) => ({ ...t, resolved }))
    },
    async deleteComment(threadId, commentId) {
      const t = find(threadId)
      const c = t.comments.find((x) => x.id === commentId)
      if (!c || c.author.id !== user.id) throw new Error('not yours')
      update(threadId, (x) => ({ ...x, comments: x.comments.filter((y) => y.id !== commentId) }))
    },
    async deleteThread(threadId) {
      find(threadId)
      threads = threads.filter((t) => t.id !== threadId)
      emit()
    },
  }
}
