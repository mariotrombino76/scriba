// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML, type Node } from '@scriba/core'
import { docFromY, updateFragment, writeDoc } from '@scriba/plugin-collab'
import { withBlockIds } from '@scriba/plugin-permissions'
import { applyGuardedUpdate } from '../src/index.js'

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
