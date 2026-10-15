import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import { Awareness } from 'y-protocols/awareness'
import { Schema, basicSchemaSpec, serializeHTML } from '@scriba/core'
import { CollabProvider, writeDoc } from '@scriba/plugin-collab'
import {
  CLOSE,
  MESSAGE_AUTH,
  attachCollabServer,
  documentFromYjs,
  type CollabServerOptions,
} from '../src/index.js'

const schema = new Schema(basicSchemaSpec)
const servers: WebSocketServer[] = []
const providers: CollabProvider[] = []

afterEach(async () => {
  for (const p of providers.splice(0)) p.destroy()
  for (const s of servers.splice(0)) await new Promise((r) => s.close(r))
})

const USERS: Record<string, { id: string; name: string; canWrite: boolean }> = {
  'tok-anna': { id: 'u1', name: 'Anna', canWrite: true },
  'tok-bruno': { id: 'u2', name: 'Bruno', canWrite: true },
  'tok-guest': { id: 'u3', name: 'Ospite', canWrite: false },
}

async function start(extra: Partial<CollabServerOptions> = {}) {
  const wss = new WebSocketServer({ port: 0 })
  servers.push(wss)
  await new Promise((r) => wss.once('listening', r))
  const server = attachCollabServer(wss, {
    authenticate: (token, doc) => {
      const u = USERS[token]
      return u && doc.startsWith('doc')
        ? { user: { id: u.id, name: u.name }, canWrite: u.canWrite }
        : null
    },
    ...extra,
  })
  const url = `ws://127.0.0.1:${(wss.address() as { port: number }).port}`
  return { url, server }
}

function client(url: string, token: string, documentName = 'doc-1') {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const provider = new CollabProvider({
    url,
    documentName,
    token,
    ydoc,
    awareness,
    WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
  })
  providers.push(provider)
  return { ydoc, awareness, provider, text: () => ydoc.getText('t').toString() }
}

async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 10))
  }
}

/** A raw socket, to send what a real client never would. */
function raw(url: string): Promise<{ ws: WebSocket; closed: Promise<number> }> {
  const ws = new WebSocket(url)
  const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)))
  return new Promise((r) => ws.on('open', () => r({ ws, closed })))
}

describe('collab server', () => {
  it('two users edit the same document through the server', async () => {
    const { url } = await start()
    const a = client(url, 'tok-anna')
    const b = client(url, 'tok-bruno')
    await until(() => a.provider.status === 'connected' && b.provider.status === 'connected')
    a.ydoc.getText('t').insert(0, 'ciao ')
    b.ydoc.getText('t').insert(0, 'mondo')
    await until(() => a.text().length === 10 && b.text().length === 10)
    expect(a.text()).toBe(b.text())
    expect(a.provider.canWrite).toBe(true)
  })

  it('names next to cursors come from the server, not from the client', async () => {
    const { url } = await start()
    const a = client(url, 'tok-anna')
    const b = client(url, 'tok-bruno')
    await until(() => a.provider.status === 'connected' && b.provider.status === 'connected')
    a.awareness.setLocalStateField('user', { name: 'Il Direttore', color: 1 }) // a lie
    await until(() => b.awareness.getStates().has(a.awareness.clientID))
    await until(
      () =>
        (b.awareness.getStates().get(a.awareness.clientID) as { user?: { name: string } }).user
          ?.name === 'Anna',
    )
  })

  it('a wrong token is refused for good (no retries, no data)', async () => {
    const { url } = await start()
    const x = client(url, 'tok-nobody')
    await until(() => x.provider.status === 'denied')
    const y = client(url, 'tok-anna', 'other-doc') // known user, document not allowed
    await until(() => y.provider.status === 'denied')
  })

  it('read-only users follow the document but their changes are refused', async () => {
    const { url } = await start()
    const a = client(url, 'tok-anna')
    const g = client(url, 'tok-guest')
    await until(() => a.provider.status === 'connected' && g.provider.status === 'connected')
    expect(g.provider.canWrite).toBe(false)
    a.ydoc.getText('t').insert(0, 'da Anna')
    await until(() => g.text() === 'da Anna')
    g.ydoc.getText('t').insert(0, 'XXX')
    await new Promise((r) => setTimeout(r, 200))
    expect(a.text()).toBe('da Anna')
  })

  it('auth must come first and in time; bad names are refused', async () => {
    const { url } = await start({ limits: { authTimeoutMs: 100 } })
    const silent = await raw(`${url}/doc-1`)
    expect(await silent.closed).toBe(CLOSE.unauthenticated)
    const rude = await raw(`${url}/doc-1`)
    rude.ws.send(new Uint8Array([0, 0, 0])) // sync before auth
    expect(await rude.closed).toBe(CLOSE.unauthenticated)
    const bad = await raw(`${url}/..%2Fetc%2Fpasswd`)
    expect(await bad.closed).toBe(CLOSE.badRequest)
  })

  it('limits: message size and rate', async () => {
    const { url } = await start({ limits: { maxMessageBytes: 2048, messagesPerSecond: 5 } })
    const big = await raw(`${url}/doc-1`)
    big.ws.send(new Uint8Array(10_000))
    expect([CLOSE.tooLarge, 1009]).toContain(await big.closed)
    const chatty = await raw(`${url}/doc-1`)
    const auth = encoding.createEncoder()
    encoding.writeVarUint(auth, MESSAGE_AUTH)
    encoding.writeVarString(auth, 'tok-anna')
    chatty.ws.send(encoding.toUint8Array(auth))
    await new Promise((r) => setTimeout(r, 100))
    for (let i = 0; i < 50; i++) chatty.ws.send(new Uint8Array([1, 1, 0])) // empty awareness updates
    expect(await chatty.closed).toBe(CLOSE.tooManyRequests)
  })

  it('loads and stores documents; documentFromYjs goes through the schema', async () => {
    const seed = new Y.Doc()
    writeDoc(
      seed.getXmlFragment('scriba'),
      schema.node('doc', null, [schema.node('paragraph', null, [schema.text('salvato')])]),
    )
    let stored: Uint8Array | null = null
    const { url } = await start({
      load: (name) => (name === 'doc-saved' ? Y.encodeStateAsUpdate(seed) : null),
      store: (_name, state) => {
        stored = state
      },
      storeDelayMs: 20,
    })
    const a = client(url, 'tok-anna', 'doc-saved')
    await until(() => a.ydoc.getXmlFragment('scriba').length === 1)
    expect(serializeHTML(documentFromYjs(schema, a.ydoc))).toBe('<p>salvato</p>')
    a.ydoc.getText('t').insert(0, 'x')
    await until(() => stored !== null)
  })
})
