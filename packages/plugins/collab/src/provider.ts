import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1
const MESSAGE_AUTH = 2

export type CollabStatus = 'connecting' | 'connected' | 'disconnected' | 'denied'

export interface CollabProviderOptions {
  /** Server URL, e.g. "wss://example.com/collab" (the document name is appended). */
  url: string
  documentName: string
  /** Token checked by the server (sent as the first message, never in the URL). */
  token: string | (() => string | Promise<string>)
  ydoc: Y.Doc
  awareness?: awarenessProtocol.Awareness
  /** Longest wait between reconnection attempts (ms, default 30 000). */
  maxBackoffMs?: number
  /** WebSocket implementation (default: the browser's). */
  WebSocket?: typeof WebSocket
}

type Listener = (status: CollabStatus, info: { canWrite: boolean }) => void

/**
 * WebSocket transport for a Yjs document (talks to `@scriba/collab-server`):
 * authenticates first, then syncs the document and the cursors; reconnects
 * with exponential backoff; stops for good when the server refuses access.
 */
export class CollabProvider {
  readonly awareness: awarenessProtocol.Awareness
  status: CollabStatus = 'connecting'
  /** Granted by the server (read-only users can follow but not edit). */
  canWrite = false
  private ws: WebSocket | null = null
  private attempts = 0
  private retry: ReturnType<typeof setTimeout> | undefined
  private destroyed = false
  private ready = false
  private readonly listeners = new Set<Listener>()
  private readonly handlers = new Map<number, Set<(payload: string) => void>>()
  private resolveSynced!: () => void
  /** Resolves once the first full sync with the server is done. */
  readonly synced: Promise<void> = new Promise((r) => (this.resolveSynced = r))

  constructor(private readonly options: CollabProviderOptions) {
    this.awareness = options.awareness ?? new awarenessProtocol.Awareness(options.ydoc)
    options.ydoc.on('update', this.onDocUpdate)
    this.awareness.on('update', this.onAwarenessUpdate)
    void this.connect()
  }

  /** Calls `listener` on every status change; returns a function removing it. */
  onStatus(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setStatus(status: CollabStatus): void {
    this.status = status
    for (const l of this.listeners) l(status, { canWrite: this.canWrite })
  }

  private send(data: Uint8Array): void {
    if (this.ws && this.ready && this.ws.readyState === 1)
      this.ws.send(data as Uint8Array<ArrayBuffer>) // lib0 buffers are plain ArrayBuffers
  }

  private async connect(): Promise<void> {
    if (this.destroyed) return
    this.setStatus('connecting')
    const Impl = this.options.WebSocket ?? WebSocket
    const url = `${this.options.url.replace(/\/$/, '')}/${encodeURIComponent(this.options.documentName)}`
    const ws = new Impl(url)
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    this.ready = false
    ws.onopen = async () => {
      const token =
        typeof this.options.token === 'function' ? await this.options.token() : this.options.token
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_AUTH)
      encoding.writeVarString(encoder, token)
      if (ws.readyState === 1) ws.send(encoding.toUint8Array(encoder))
    }
    ws.onmessage = (event: MessageEvent) =>
      this.onMessage(new Uint8Array(event.data as ArrayBuffer))
    ws.onclose = (event: CloseEvent) => {
      if (this.ws !== ws) return
      this.ws = null
      this.ready = false
      // others' cursors are gone while we are offline
      const others = [...this.awareness.getStates().keys()].filter(
        (id) => id !== this.awareness.clientID,
      )
      awarenessProtocol.removeAwarenessStates(this.awareness, others, this)
      if (this.destroyed) return
      if (event.code === 4401 || event.code === 4403 || event.code === 4400) {
        this.setStatus('denied') // no point in retrying
        return
      }
      this.setStatus('disconnected')
      const base = Math.min(this.options.maxBackoffMs ?? 30_000, 1000 * 2 ** this.attempts++)
      this.retry = setTimeout(() => void this.connect(), base / 2 + Math.random() * (base / 2))
    }
  }

  private onMessage(message: Uint8Array): void {
    const decoder = decoding.createDecoder(message)
    const type = decoding.readVarUint(decoder)
    if (type === MESSAGE_AUTH) {
      const granted = decoding.readVarUint(decoder) === 1
      const scope = decoding.readVarString(decoder)
      if (!granted) return // the server closes the connection next
      this.canWrite = scope === 'read-write'
      this.ready = true
      this.attempts = 0
      // now sync: our state vector, and our cursor
      const step1 = encoding.createEncoder()
      encoding.writeVarUint(step1, MESSAGE_SYNC)
      syncProtocol.writeSyncStep1(step1, this.options.ydoc)
      this.send(encoding.toUint8Array(step1))
      if (this.awareness.getLocalState() !== null) {
        const aw = encoding.createEncoder()
        encoding.writeVarUint(aw, MESSAGE_AWARENESS)
        encoding.writeVarUint8Array(
          aw,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.awareness.clientID]),
        )
        this.send(encoding.toUint8Array(aw))
      }
      this.setStatus('connected')
    } else if (type === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      const sub = syncProtocol.readSyncMessage(decoder, encoder, this.options.ydoc, this)
      if (encoding.length(encoder) > 1) this.send(encoding.toUint8Array(encoder))
      if (sub === syncProtocol.messageYjsSyncStep2) this.resolveSynced()
    } else if (type === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(
        this.awareness,
        decoding.readVarUint8Array(decoder),
        this,
      )
    } else {
      const handlers = this.handlers.get(type)
      if (handlers) {
        const payload = decoding.readVarString(decoder)
        for (const h of handlers) h(payload)
      }
    }
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    this.send(encoding.toUint8Array(encoder))
  }

  private onAwarenessUpdate = (
    { added, updated, removed }: Record<string, number[]>,
    origin: unknown,
  ) => {
    if (origin === this) return
    const ids = [...added!, ...updated!, ...removed!].filter((id) => id === this.awareness.clientID)
    if (!ids.length) return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, ids),
    )
    this.send(encoding.toUint8Array(encoder))
  }

  /** Listens to an extra message type (e.g. 3: comments); its payload is a string. */
  onMessageType(type: number, handler: (payload: string) => void): () => void {
    let set = this.handlers.get(type)
    if (!set) this.handlers.set(type, (set = new Set()))
    set.add(handler)
    return () => set.delete(handler)
  }

  /** Sends an extra message type; false when not connected (nothing is queued). */
  sendMessageType(type: number, payload: string): boolean {
    if (!this.ready || !this.ws || this.ws.readyState !== 1) return false
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, type)
    encoding.writeVarString(encoder, payload)
    this.send(encoding.toUint8Array(encoder))
    return true
  }

  /** Disconnects for good (removes our cursor for the others first). */
  destroy(): void {
    this.destroyed = true
    clearTimeout(this.retry)
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.awareness.clientID], 'destroy')
    this.options.ydoc.off('update', this.onDocUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    this.ws?.close()
    this.ws = null
  }
}

/**
 * A status line for the connection ("Online", "Read only", "Offline…"), as a
 * polite live region: screen readers hear when the connection drops or returns.
 */
export function collabStatusElement(
  doc: Document,
  provider: CollabProvider,
  t: (
    key:
      | 'collab.connecting'
      | 'collab.connected'
      | 'collab.readOnly'
      | 'collab.disconnected'
      | 'collab.denied',
  ) => string,
): HTMLElement {
  const el = doc.createElement('p')
  el.className = 'scriba-collab-status'
  el.setAttribute('role', 'status')
  const render = (status: CollabStatus) => {
    el.dataset['status'] = status
    el.textContent =
      status === 'connected'
        ? t(provider.canWrite ? 'collab.connected' : 'collab.readOnly')
        : t(`collab.${status}` as 'collab.connecting')
  }
  render(provider.status)
  provider.onStatus(render)
  return el
}
