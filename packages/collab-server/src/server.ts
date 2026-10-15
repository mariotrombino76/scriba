import type { IncomingMessage } from 'node:http'
import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import { WebSocketServer, type WebSocket } from 'ws'
import { MESSAGE_COMMENTS, applyCommentOp, publicThreads, type StoredThread } from './comments.js'

/** Message types (y-websocket compatible, plus our auth message from the client). */
export const MESSAGE_SYNC = 0
export const MESSAGE_AWARENESS = 1
export const MESSAGE_AUTH = 2

/** Close codes. */
export const CLOSE = {
  badRequest: 4400,
  unauthenticated: 4401,
  forbidden: 4403,
  tooLarge: 4413,
  tooManyRequests: 4429,
} as const

export interface CollabUserInfo {
  /** Stable id from your user system (never shown). */
  id: string
  /** Name shown to the others next to the cursor (plain text). */
  name: string
  /** Color slot 0–7 (default: from the id). */
  color?: number
}

export interface AuthResult {
  user: CollabUserInfo
  /** False: the user can follow the document but every change is refused. */
  canWrite: boolean
}

export interface CollabLimits {
  /** Largest message (bytes, default 1 MB). Bigger messages close the connection. */
  maxMessageBytes?: number
  /** Largest document (bytes of its Yjs state, default 10 MB). */
  maxDocumentBytes?: number
  /** Messages per second per connection (default 60, bursts up to twice that). */
  messagesPerSecond?: number
  /** Time to send the auth message after connecting (ms, default 5000). */
  authTimeoutMs?: number
  /** Connections per document (default 100). */
  maxConnectionsPerDocument?: number
}

export interface CollabServerOptions {
  /**
   * Required. Checks the token sent by the client for this document and says
   * who the user is and whether they may write. Return null to refuse.
   * Never decide from the document name alone: names can be guessed (§5.8).
   */
  authenticate(token: string, documentName: string): Promise<AuthResult | null> | AuthResult | null
  /** Loads a stored document (its Yjs state), or null for a new one. */
  load?(documentName: string): Promise<Uint8Array | null> | Uint8Array | null
  /**
   * Stores a document (debounced, and when the last user leaves). Use
   * `documentFromYjs` to get it through the schema, then serialize it.
   */
  store?(documentName: string, state: Uint8Array, ydoc: Y.Doc): Promise<void> | void
  /** Delay before storing after changes (ms, default 2000). */
  storeDelayMs?: number
  /** Loads the comment threads of a document (authors and ids as stored). */
  loadComments?(documentName: string): Promise<StoredThread[] | null> | StoredThread[] | null
  /** Stores the comment threads (with the documents, same timing). */
  storeComments?(documentName: string, threads: StoredThread[]): Promise<void> | void
  limits?: CollabLimits
}

const DOC_NAME = /^[\w.-]{1,128}$/
const MAX_TOKEN = 8192
const MAX_NAME = 60

interface Connection {
  ws: WebSocket
  auth: AuthResult
  /** Awareness client ids announced by this connection (no one else may use them). */
  clientIds: Set<number>
  tokens: number
  lastRefill: number
}

interface SharedDoc {
  name: string
  ydoc: Y.Doc
  awareness: awarenessProtocol.Awareness
  connections: Map<WebSocket, Connection>
  storeTimer?: ReturnType<typeof setTimeout>
  ready: Promise<void>
  threads: StoredThread[]
}

function send(ws: WebSocket, data: Uint8Array): void {
  if (ws.readyState === ws.OPEN) ws.send(data)
}

function colorOf(user: CollabUserInfo): number {
  if (Number.isInteger(user.color) && user.color! >= 0 && user.color! < 8) return user.color!
  let h = 0
  for (const ch of user.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 8
}

/**
 * Rewrites an awareness update from a connection: only its own client ids,
 * and the `user` field replaced by the authenticated identity (nobody can show
 * up with someone else's name, §5.8). Returns null when nothing is left.
 */
export function rewriteAwareness(
  update: Uint8Array,
  owner: Connection,
  owned: (clientId: number) => boolean,
): Uint8Array | null {
  const decoder = decoding.createDecoder(update)
  const encoder = encoding.createEncoder()
  const count = decoding.readVarUint(decoder)
  const entries: [number, number, string][] = []
  for (let i = 0; i < count; i++) {
    const clientId = decoding.readVarUint(decoder)
    const clock = decoding.readVarUint(decoder)
    const json = decoding.readVarString(decoder)
    if (owned(clientId)) continue // someone else's id: refused
    let state: unknown = null
    try {
      state = JSON.parse(json)
    } catch {
      continue
    }
    if (state !== null) {
      if (typeof state !== 'object' || Array.isArray(state)) continue
      const user = owner.auth.user
      ;(state as Record<string, unknown>)['user'] = {
        name: String(user.name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME),
        color: colorOf(user),
      }
    }
    owner.clientIds.add(clientId)
    entries.push([clientId, clock, JSON.stringify(state)])
  }
  if (!entries.length) return null
  encoding.writeVarUint(encoder, entries.length)
  for (const [clientId, clock, json] of entries) {
    encoding.writeVarUint(encoder, clientId)
    encoding.writeVarUint(encoder, clock)
    encoding.writeVarString(encoder, json)
  }
  return encoding.toUint8Array(encoder)
}

/**
 * Collaboration server: one shared Yjs document per name, authenticated
 * connections, read-only users, limits, server-assigned identities.
 * Attach it to a `ws` WebSocketServer: `attachCollabServer(wss, options)`.
 */
export class CollabServer {
  private readonly docs = new Map<string, SharedDoc>()
  private readonly limits: Required<CollabLimits>

  constructor(private readonly options: CollabServerOptions) {
    if (typeof options.authenticate !== 'function')
      throw new TypeError('authenticate() is required')
    this.limits = {
      maxMessageBytes: 1024 * 1024,
      maxDocumentBytes: 10 * 1024 * 1024,
      messagesPerSecond: 60,
      authTimeoutMs: 5000,
      maxConnectionsPerDocument: 100,
      ...options.limits,
    }
  }

  get maxMessageBytes(): number {
    return this.limits.maxMessageBytes
  }

  /** Handles a new WebSocket; the document name is the URL path ("/my-doc"). */
  handleConnection(ws: WebSocket, req: IncomingMessage): void {
    ws.binaryType = 'arraybuffer'
    let name: string
    try {
      name = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname.slice(1))
    } catch {
      name = ''
    }
    if (!DOC_NAME.test(name)) return ws.close(CLOSE.badRequest, 'bad document name')

    let authed = false
    const timer = setTimeout(
      () => !authed && ws.close(CLOSE.unauthenticated, 'auth timeout'),
      this.limits.authTimeoutMs,
    )
    const pending: Uint8Array[] = []
    let conn: Connection | null = null
    let shared: SharedDoc | null = null

    ws.on('message', (data: ArrayBuffer | Buffer) => {
      const message = new Uint8Array(data as ArrayBuffer)
      if (message.byteLength > this.limits.maxMessageBytes)
        return ws.close(CLOSE.tooLarge, 'message too large')
      if (!authed) {
        if (pending.length) return // one auth message only
        pending.push(message)
        void this.authenticate(ws, name, message).then((result) => {
          clearTimeout(timer)
          if (!result) return
          authed = true
          ;({ conn, shared } = result)
        })
        return
      }
      if (!conn || !shared) return
      if (!this.allow(conn)) return ws.close(CLOSE.tooManyRequests, 'too many messages')
      this.onMessage(shared, conn, message)
    })
    ws.on('close', () => {
      clearTimeout(timer)
      if (conn && shared) this.leave(shared, conn)
    })
    ws.on('error', () => ws.close())
  }

  private async authenticate(
    ws: WebSocket,
    name: string,
    message: Uint8Array,
  ): Promise<{ conn: Connection; shared: SharedDoc } | null> {
    let token = ''
    try {
      const decoder = decoding.createDecoder(message)
      if (decoding.readVarUint(decoder) !== MESSAGE_AUTH) throw new Error('auth first')
      token = decoding.readVarString(decoder)
    } catch {
      ws.close(CLOSE.unauthenticated, 'auth required')
      return null
    }
    let auth: AuthResult | null = null
    try {
      auth = token.length <= MAX_TOKEN ? await this.options.authenticate(token, name) : null
    } catch {
      auth = null
    }
    if (ws.readyState !== ws.OPEN) return null
    if (!auth || !auth.user || typeof auth.user.id !== 'string') {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_AUTH)
      encoding.writeVarUint(encoder, 0) // permission denied (y-websocket)
      encoding.writeVarString(encoder, 'forbidden')
      send(ws, encoding.toUint8Array(encoder))
      ws.close(CLOSE.forbidden, 'forbidden')
      return null
    }
    const shared = this.open(name)
    await shared.ready
    if (shared.connections.size >= this.limits.maxConnectionsPerDocument) {
      ws.close(CLOSE.tooManyRequests, 'document full')
      return null
    }
    const conn: Connection = {
      ws,
      auth,
      clientIds: new Set(),
      tokens: this.limits.messagesPerSecond * 2,
      lastRefill: Date.now(),
    }
    shared.connections.set(ws, conn)
    // auth ok → tell the client whether it may write, then start syncing
    const ok = encoding.createEncoder()
    encoding.writeVarUint(ok, MESSAGE_AUTH)
    encoding.writeVarUint(ok, 1) // authorized
    encoding.writeVarString(ok, auth.canWrite ? 'read-write' : 'read-only')
    send(ws, encoding.toUint8Array(ok))
    const step1 = encoding.createEncoder()
    encoding.writeVarUint(step1, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(step1, shared.ydoc)
    send(ws, encoding.toUint8Array(step1))
    this.sendComments(conn, shared, { type: 'snapshot' })
    const states = [...shared.awareness.getStates().keys()]
    if (states.length) {
      const aw = encoding.createEncoder()
      encoding.writeVarUint(aw, MESSAGE_AWARENESS)
      encoding.writeVarUint8Array(
        aw,
        awarenessProtocol.encodeAwarenessUpdate(shared.awareness, states),
      )
      send(ws, encoding.toUint8Array(aw))
    }
    return { conn, shared }
  }

  /** A comments message: results go to the sender, snapshots (with the user's own id) to everyone. */
  private sendComments(conn: Connection, shared: SharedDoc, body: Record<string, unknown>): void {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_COMMENTS)
    const payload =
      body['type'] === 'snapshot'
        ? { ...body, threads: publicThreads(shared.threads), you: conn.auth.user.id }
        : body
    encoding.writeVarString(encoder, JSON.stringify(payload))
    send(conn.ws, encoding.toUint8Array(encoder))
  }

  /** Token bucket: `messagesPerSecond`, bursts up to twice that. */
  private allow(conn: Connection): boolean {
    const now = Date.now()
    const rate = this.limits.messagesPerSecond
    conn.tokens = Math.min(rate * 2, conn.tokens + ((now - conn.lastRefill) / 1000) * rate)
    conn.lastRefill = now
    if (conn.tokens < 1) return false
    conn.tokens -= 1
    return true
  }

  private onMessage(shared: SharedDoc, conn: Connection, message: Uint8Array): void {
    try {
      const decoder = decoding.createDecoder(message)
      const type = decoding.readVarUint(decoder)
      if (type === MESSAGE_SYNC) {
        const sub = decoding.readVarUint(decoder)
        if (sub === syncProtocol.messageYjsSyncStep1) {
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, MESSAGE_SYNC)
          syncProtocol.writeSyncStep2(encoder, shared.ydoc, decoding.readVarUint8Array(decoder))
          send(conn.ws, encoding.toUint8Array(encoder))
        } else if (
          sub === syncProtocol.messageYjsSyncStep2 ||
          sub === syncProtocol.messageYjsUpdate
        ) {
          if (!conn.auth.canWrite) return // read-only: changes refused
          const update = decoding.readVarUint8Array(decoder)
          const size = Y.encodeStateAsUpdate(shared.ydoc).byteLength
          if (size + update.byteLength > this.limits.maxDocumentBytes)
            return conn.ws.close(CLOSE.tooLarge, 'document too large')
          Y.applyUpdate(shared.ydoc, update, conn)
        }
      } else if (type === MESSAGE_COMMENTS) {
        const request = JSON.parse(decoding.readVarString(decoder)) as { ref?: unknown }
        const ref = typeof request.ref === 'number' ? request.ref : 0
        const result = applyCommentOp(shared.threads, request, conn.auth.user, conn.auth.canWrite)
        if ('error' in result) {
          this.sendComments(conn, shared, { type: 'result', ref, ok: false, error: result.error })
          return
        }
        shared.threads = result.threads
        this.sendComments(conn, shared, {
          type: 'result',
          ref,
          ok: true,
          threadId: result.threadId,
        })
        for (const other of shared.connections.values())
          this.sendComments(other, shared, { type: 'snapshot' })
        this.scheduleStore(shared)
      } else if (type === MESSAGE_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder)
        const owned = (id: number) =>
          [...shared.connections.values()].some((c) => c !== conn && c.clientIds.has(id))
        const safe = rewriteAwareness(update, conn, owned)
        if (safe) awarenessProtocol.applyAwarenessUpdate(shared.awareness, safe, conn)
      }
    } catch {
      conn.ws.close(CLOSE.badRequest, 'malformed message')
    }
  }

  private open(name: string): SharedDoc {
    const existing = this.docs.get(name)
    if (existing) return existing
    const ydoc = new Y.Doc({ gc: true })
    const awareness = new awarenessProtocol.Awareness(ydoc)
    awareness.setLocalState(null) // the server has no cursor
    const shared: SharedDoc = {
      name,
      ydoc,
      awareness,
      connections: new Map(),
      ready: Promise.resolve(),
      threads: [],
    }
    shared.ready = (async () => {
      const stored = await this.options.load?.(name)
      if (stored) Y.applyUpdate(ydoc, stored, 'load')
      shared.threads = (await this.options.loadComments?.(name)) ?? []
    })()
    ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      syncProtocol.writeUpdate(encoder, update)
      const message = encoding.toUint8Array(encoder)
      for (const [ws] of shared.connections)
        if (origin !== shared.connections.get(ws)) send(ws, message)
      if (origin !== 'load') this.scheduleStore(shared)
    })
    awareness.on('update', ({ added, updated, removed }: Record<string, number[]>) => {
      const ids = [...added!, ...updated!, ...removed!]
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, ids))
      const message = encoding.toUint8Array(encoder)
      for (const [ws] of shared.connections) send(ws, message)
    })
    this.docs.set(name, shared)
    return shared
  }

  private scheduleStore(shared: SharedDoc): void {
    if (!this.options.store && !this.options.storeComments) return
    clearTimeout(shared.storeTimer)
    shared.storeTimer = setTimeout(() => void this.store(shared), this.options.storeDelayMs ?? 2000)
  }

  private async store(shared: SharedDoc): Promise<void> {
    clearTimeout(shared.storeTimer)
    await this.options.store?.(shared.name, Y.encodeStateAsUpdate(shared.ydoc), shared.ydoc)
    await this.options.storeComments?.(shared.name, shared.threads)
  }

  private leave(shared: SharedDoc, conn: Connection): void {
    shared.connections.delete(conn.ws)
    awarenessProtocol.removeAwarenessStates(shared.awareness, [...conn.clientIds], null)
    if (shared.connections.size === 0) {
      void this.store(shared).finally(() => {
        if (shared.connections.size) return // someone came back meanwhile
        shared.ydoc.destroy()
        this.docs.delete(shared.name)
      })
    }
  }

  /** Stores every open document and closes all connections. */
  async close(): Promise<void> {
    for (const shared of this.docs.values()) {
      for (const [ws] of shared.connections) ws.close()
      await this.store(shared)
    }
  }
}

/** Attaches a collaboration server to a `ws` server (sets its message size limit too). */
export function attachCollabServer(
  wss: WebSocketServer,
  options: CollabServerOptions,
): CollabServer {
  const server = new CollabServer(options)
  wss.options.maxPayload = server.maxMessageBytes
  wss.on('connection', (ws, req) => server.handleConnection(ws, req))
  return server
}

/**
 * Starts a stand-alone collaboration server on `port` (for a server of your
 * own, e.g. behind your HTTP server's upgrade handling, use `attachCollabServer`).
 */
export function listenCollabServer(
  options: CollabServerOptions & { port: number; host?: string },
): { server: CollabServer; wss: WebSocketServer; close(): Promise<void> } {
  const { port, host, ...rest } = options
  const wss = new WebSocketServer({ port, ...(host ? { host } : {}) })
  const server = attachCollabServer(wss, rest)
  return {
    server,
    wss,
    async close() {
      await server.close()
      await new Promise((r) => wss.close(r))
    },
  }
}
