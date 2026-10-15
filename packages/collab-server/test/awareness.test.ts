import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import { rewriteAwareness } from '../src/index.js'

const owner = (name: string) =>
  ({
    auth: { user: { id: name, name }, canWrite: true },
    clientIds: new Set<number>(),
  }) as unknown as Parameters<typeof rewriteAwareness>[1]

function update(clientID: number, state: Record<string, unknown>) {
  const doc = new Y.Doc()
  doc.clientID = clientID
  const aw = new Awareness(doc)
  aw.setLocalState(state)
  return encodeAwarenessUpdate(aw, [clientID])
}

function read(u: Uint8Array) {
  const aw = new Awareness(new Y.Doc())
  applyAwarenessUpdate(aw, u, null)
  return aw.getStates()
}

describe('awareness rewriting', () => {
  it('replaces the user with the authenticated identity and keeps the cursor', () => {
    const out = rewriteAwareness(
      update(7, { user: { name: '<img src=x>', color: 'red' }, cursor: { a: 1 } }),
      owner('Anna'),
      () => false,
    )!
    expect(read(out).get(7)).toMatchObject({ user: { name: 'Anna' }, cursor: { a: 1 } })
  })

  it("refuses another connection's client id (no hijacking of someone else's cursor)", () => {
    expect(
      rewriteAwareness(update(7, { cursor: {} }), owner('Mallory'), (id) => id === 7),
    ).toBeNull()
  })

  it('drops states that are not objects', () => {
    expect(
      rewriteAwareness(
        update(9, [] as unknown as Record<string, unknown>),
        owner('A'),
        () => false,
      ),
    ).toBeNull()
  })
})
