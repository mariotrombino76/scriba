// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import { EditorState, Schema, TextSelection, basicSchemaSpec, parseHTML } from '@scriba/core'
import { EditorView } from '@scriba/view'
import { collabCursors, cursorsKey, yBinding, type CollabUser } from '../src/index.js'

const schema = new Schema(basicSchemaSpec)
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const tick = () => new Promise((r) => setTimeout(r, 0))

function client(ydoc: Y.Doc, user: CollabUser, html = '<p></p>') {
  const awareness = new Awareness(ydoc)
  const place = document.createElement('div')
  document.body.appendChild(place)
  const view = new EditorView(place, {
    state: EditorState.create({
      doc: parse(html),
      plugins: [yBinding({ ydoc }), collabCursors({ awareness, user })],
    }),
  })
  return { view, awareness }
}

async function setup() {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.on('update', (u: Uint8Array, o: unknown) => o !== 'net' && Y.applyUpdate(b, u, 'net'))
  b.on('update', (u: Uint8Array, o: unknown) => o !== 'net' && Y.applyUpdate(a, u, 'net'))
  const A = client(a, { name: 'Anna <b>x</b>', color: 3 }, '<p>hello world</p>')
  const B = client(b, { name: 'Bruno' })
  // awareness travels like document updates
  const link = (from: Awareness, to: Awareness) =>
    from.on('update', ({ added, updated, removed }: Record<string, number[]>) => {
      const ids = [...added!, ...updated!, ...removed!]
      applyAwarenessUpdate(to, encodeAwarenessUpdate(from, ids), 'net')
    })
  link(A.awareness, B.awareness)
  link(B.awareness, A.awareness)
  A.awareness.setLocalStateField('ping', 1)
  B.awareness.setLocalStateField('ping', 1)
  await tick()
  return { A, B }
}

const select = (view: EditorView, from: number, to = from) =>
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))

describe('remote cursors', () => {
  it("shows the other user's selection and caret, with the name as text", async () => {
    const { A, B } = await setup()
    select(A.view, 1, 6) // "hello"
    await tick()
    const cursors = cursorsKey.getState(B.view.state)!
    expect(cursors).toHaveLength(1)
    expect(cursors[0]).toMatchObject({ name: 'Anna <b>x</b>', color: 3, anchor: 1, head: 6 })
    const sel = B.view.dom.querySelector('.scriba-collab-sel.scriba-collab-c3')
    expect(sel?.textContent).toBe('hello')
    const label = [...document.querySelectorAll('.scriba-collab-name')].find((l) =>
      l.textContent?.startsWith('Anna'),
    )
    expect(label?.textContent).toBe('Anna <b>x</b>') // never parsed as HTML
    expect(label?.querySelector('b')).toBeNull()
  })

  it('cursors stick to the text while others type before them', async () => {
    const { A, B } = await setup()
    select(A.view, 7) // before "world"
    await tick()
    B.view.dispatch(B.view.state.tr.insertText('>>> ', 1))
    await tick()
    const [c] = cursorsKey.getState(B.view.state)!
    expect(B.view.state.doc.textBetween(c!.head, c!.head + 5)).toBe('world')
  })

  it('a malformed or hostile awareness state is ignored', async () => {
    const { A, B } = await setup()
    B.awareness.setLocalStateField('cursor', { anchor: { nonsense: true }, head: 'x' })
    B.awareness.setLocalStateField('user', { name: 42, color: 'red; background:url(x)' })
    await tick()
    expect(() => cursorsKey.getState(A.view.state)).not.toThrow()
    expect(cursorsKey.getState(A.view.state)).toEqual([])
  })
})
