// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML, type Node } from '@scriba/core'
import { docFromY, updateFragment, writeDoc } from '@scriba/plugin-collab'
import { withBlockIds } from '@scriba/plugin-permissions'
import { applyAnnotationUpdate, applyGuardedUpdate } from '../src/index.js'

const schema = new Schema({
  nodes: withBlockIds(basicSchemaSpec.nodes),
  marks: basicSchemaSpec.marks,
})
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const START = '<p data-block-id="free-1">libero</p><p data-block-id="lock-1">fisso</p>'
const rules = { canEdit: (id: string) => !id.startsWith('lock') }
const html = (ydoc: Y.Doc) => serializeHTML(docFromY(schema, ydoc.getXmlFragment('scriba')))

/** A server document and a client in sync with it; the server's updates reach the client. */
function setup() {
  const server = new Y.Doc()
  writeDoc(server.getXmlFragment('scriba'), parse(START))
  const client = new Y.Doc()
  Y.applyUpdate(client, Y.encodeStateAsUpdate(server))
  const conn = {}
  server.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'client-side') Y.applyUpdate(client, update, 'server')
  })
  /** The client edits its copy, then sends the update to the server. */
  const edit = (next: Node) => {
    const before = Y.encodeStateVector(server)
    const fragment = client.getXmlFragment('scriba')
    updateFragment(fragment, docFromY(schema, fragment), next)
    const update = Y.encodeStateAsUpdate(client, before)
    return applyGuardedUpdate(server, update, conn, schema, rules)
  }
  return { server, client, edit }
}

describe('protected blocks on the collaboration server', () => {
  it('keeps changes to editable blocks', () => {
    const { server, client, edit } = setup()
    const next = '<p data-block-id="free-1">libero!</p><p data-block-id="lock-1">fisso</p>'
    expect(edit(parse(next))).toEqual([])
    expect(html(server)).toBe(next)
    expect(html(client)).toBe(next)
  })

  it.each([
    ['changed', '<p data-block-id="free-1">libero</p><p data-block-id="lock-1">fisso!</p>'],
    ['deleted', '<p data-block-id="free-1">libero</p>'],
    [
      'formatted',
      '<p data-block-id="free-1">libero</p><p data-block-id="lock-1"><strong>fisso</strong></p>',
    ],
    ['id removed', '<p data-block-id="free-1">libero</p><p>fisso</p>'],
    ['copied', '<p data-block-id="lock-1">fisso</p><p data-block-id="lock-1">fisso</p>'],
  ])('undoes an update that %s a protected block; the sender converges', (_what, next) => {
    const { server, client, edit } = setup()
    expect(edit(parse(next))).toEqual(['lock-1'])
    expect(html(server)).toBe(START)
    expect(html(client)).toBe(START)
  })

  it('a mixed update is undone as a whole', () => {
    const { server, edit } = setup()
    const next = '<p data-block-id="free-1">altro</p><p data-block-id="lock-1">fiss</p>'
    expect(edit(parse(next))).toEqual(['lock-1'])
    expect(html(server)).toBe(START)
  })
})

describe('commenters on the collaboration server', () => {
  const cSchema = new Schema({
    nodes: basicSchemaSpec.nodes,
    marks: {
      ...basicSchemaSpec.marks,
      comment: {
        attrs: { id: {} },
        excludes: '',
        annotation: true,
        serialize: false,
        toHTML: () => ['span', 0],
      },
    },
  })
  const doc0 = cSchema.node('doc', null, [cSchema.node('paragraph', null, [cSchema.text('ciao')])])
  function pair() {
    const server = new Y.Doc()
    writeDoc(server.getXmlFragment('scriba'), doc0)
    const client = new Y.Doc()
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server))
    server.on('update', (u: Uint8Array) => Y.applyUpdate(client, u))
    const send = (next: Node) => {
      const sv = Y.encodeStateVector(server)
      const f = client.getXmlFragment('scriba')
      updateFragment(f, docFromY(cSchema, f), next)
      return applyAnnotationUpdate(server, Y.encodeStateAsUpdate(client, sv), {}, cSchema)
    }
    const json = (d: Y.Doc) =>
      JSON.stringify(docFromY(cSchema, d.getXmlFragment('scriba')).toJSON())
    return { server, client, send, json }
  }
  const comment = cSchema.marks['comment']!.create({ id: 'c1' })

  it('keeps an update adding a comment anchor', () => {
    const { server, send, json } = pair()
    const next = cSchema.node('doc', null, [
      cSchema.node('paragraph', null, [cSchema.text('ci'), cSchema.text('ao', [comment])]),
    ])
    expect(send(next)).toBe(true)
    expect(json(server)).toBe(JSON.stringify(next.toJSON()))
  })

  it('undoes an update changing the text (even with a comment), for everyone', () => {
    const { server, client, send, json } = pair()
    const next = cSchema.node('doc', null, [
      cSchema.node('paragraph', null, [cSchema.text('ciao!', [comment])]),
    ])
    expect(send(next)).toBe(false)
    expect(json(server)).toBe(JSON.stringify(doc0.toJSON()))
    expect(json(client)).toBe(JSON.stringify(doc0.toJSON()))
  })
})
