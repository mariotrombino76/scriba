import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import * as Y from 'yjs'
import { CollabProvider, collabCommentStore } from '@scriba-editor/plugin-collab'
import {
  applyCommentOp,
  attachCollabServer,
  type CollabServerOptions,
  type StoredThread,
} from '../src/index.js'

const servers: WebSocketServer[] = []
const cleanups: (() => void)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0)) c()
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
  attachCollabServer(wss, {
    authenticate: (token) => {
      const u = USERS[token]
      return u ? { user: { id: u.id, name: u.name }, canWrite: u.canWrite } : null
    },
    ...extra,
  })
  return `ws://127.0.0.1:${(wss.address() as { port: number }).port}`
}

function user(url: string, token: string, documentName = 'doc-c') {
  const provider = new CollabProvider({
    url,
    documentName,
    token,
    ydoc: new Y.Doc(),
    WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
  })
  const store = collabCommentStore(provider)
  cleanups.push(() => (store.destroy(), provider.destroy()))
  return { provider, store }
}

async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('comments channel', () => {
  it('threads are created with the server-assigned author and reach everyone', async () => {
    const url = await start()
    const anna = user(url, 'tok-anna')
    const bruno = user(url, 'tok-bruno')
    await until(() => anna.provider.status === 'connected' && bruno.provider.status === 'connected')
    const thread = await anna.store.createThread('comment', 'Da controllare')
    expect(thread.comments[0]!.author).toEqual({ id: 'u1', name: 'Anna' })
    expect(anna.store.userId).toBe('u1')
    await until(() => bruno.store.threads().length === 1)
    await bruno.store.reply(thread.id, 'Fatto')
    await until(() => anna.store.threads()[0]!.comments.length === 2)
    expect(anna.store.threads()[0]!.comments[1]!.author.name).toBe('Bruno')
  })

  it('you can delete only your own comments and threads; read-only users cannot comment', async () => {
    const url = await start()
    const anna = user(url, 'tok-anna')
    const bruno = user(url, 'tok-bruno')
    const guest = user(url, 'tok-guest')
    await until(() => [anna, bruno, guest].every((u) => u.provider.status === 'connected'))
    const thread = await anna.store.createThread('comment', 'mio')
    await until(() => bruno.store.threads().length === 1)
    await expect(bruno.store.deleteComment(thread.id, thread.comments[0]!.id)).rejects.toThrow(
      'forbidden',
    )
    await expect(bruno.store.deleteThread(thread.id)).rejects.toThrow('forbidden')
    await expect(guest.store.createThread('comment', 'ciao')).rejects.toThrow('read-only')
    await expect(guest.store.setResolved(thread.id, true)).rejects.toThrow('read-only')
    await anna.store.deleteThread(thread.id)
    await until(() => bruno.store.threads().length === 0)
  })

  it('threads are stored and loaded with the document; new users get them on joining', async () => {
    let saved: StoredThread[] = []
    const url = await start({ storeComments: (_d, t) => void (saved = t), storeDelayMs: 10 })
    const anna = user(url, 'tok-anna', 'doc-p')
    await until(() => anna.provider.status === 'connected')
    await anna.store.createThread('comment', 'resto')
    await until(() => saved.length === 1)
    expect(saved[0]!.createdBy).toBe('u1')
    const url2 = await start({ loadComments: () => saved })
    const late = user(url2, 'tok-bruno', 'doc-p')
    await until(() => late.store.threads().length === 1)
    expect('createdBy' in late.store.threads()[0]!).toBe(false) // server-only field
  })
})

describe('applyCommentOp', () => {
  const me = { id: 'u1', name: '  Anna\n  ' }
  it('validates input and sets ids/author/date itself', () => {
    const r = applyCommentOp(
      [],
      {
        op: 'create',
        kind: 'comment',
        text: '  ok  ',
        author: { id: 'x', name: 'Falso' },
        id: 'mine',
      },
      me,
      true,
    )
    if ('error' in r) throw new Error(r.error)
    const t = r.threads[0]!
    expect(t.id).not.toBe('mine')
    expect(t.comments[0]).toMatchObject({ text: 'ok', author: { id: 'u1', name: 'Anna' } })
    expect(applyCommentOp([], { op: 'create', kind: 'comment', text: '   ' }, me, true)).toEqual({
      error: 'bad-request',
    })
    expect(applyCommentOp([], { op: 'nope' }, me, true)).toEqual({ error: 'bad-request' })
    expect(applyCommentOp([], { op: 'create', kind: 'evil', text: 'x' }, me, true)).toEqual({
      error: 'bad-request',
    })
    const long = applyCommentOp(
      [],
      { op: 'create', kind: 'comment', text: 'x'.repeat(10_000) },
      me,
      true,
    )
    if ('error' in long) throw new Error()
    expect(long.threads[0]!.comments[0]!.text).toHaveLength(5000)
  })
})
