// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  history,
  parseHTML,
  serializeHTML,
  undo,
} from '@scriba/core'
import { EditorView } from '@scriba/view'
import { listNodes } from '@scriba/plugin-list'
import { linkMarks } from '@scriba/plugin-link'
import { imageNodes } from '@scriba/plugin-image'
import { tableNodes, tableNormalize } from '@scriba/plugin-table'
import { yBinding } from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...listNodes, ...imageNodes, ...tableNodes },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)

function editor(ydoc: Y.Doc, html = '<p></p>') {
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc: parse(html),
      plugins: [history(), tableNormalize(), yBinding({ ydoc })],
    }),
  })
  return {
    view,
    html: () => serializeHTML(view.state.doc),
    insert: (text: string, pos: number) => view.dispatch(view.state.tr.insertText(text, pos)),
    undo: () => undo(view.state, (tr) => view.dispatch(tr), view),
  }
}

/** Two documents exchanging updates (like through a server); `online` can be switched off. */
function pair(html = '<p></p>') {
  const a = new Y.Doc()
  const b = new Y.Doc()
  const net = { online: true }
  a.on(
    'update',
    (u: Uint8Array, origin: unknown) =>
      origin !== 'net' && net.online && Y.applyUpdate(b, u, 'net'),
  )
  b.on(
    'update',
    (u: Uint8Array, origin: unknown) =>
      origin !== 'net' && net.online && Y.applyUpdate(a, u, 'net'),
  )
  const A = editor(a, html)
  const B = editor(b)
  const sync = () => {
    net.online = true
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'net')
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'net')
  }
  return { A, B, net, sync, ydocs: [a, b] as const }
}

describe('Yjs binding', () => {
  it('the first editor shares its content; the second loads it', () => {
    const { B } = pair('<h1>Titolo</h1><p>uno <strong>due</strong></p>')
    expect(B.html()).toBe('<h1>Titolo</h1><p>uno <strong>due</strong></p>')
  })

  it('edits travel both ways, with marks, lists, tables and images', () => {
    const { A, B } = pair('<p>ciao</p>')
    A.insert(' mondo', 5)
    expect(B.html()).toBe('<p>ciao mondo</p>')
    B.view.dispatch(B.view.state.tr.addMark(1, 5, schema.mark('bold')))
    expect(A.html()).toBe('<p><strong>ciao</strong> mondo</p>')
    const content = parse(
      '<ul><li><p>x</p></li></ul><table><tr><td>c</td></tr></table><p><img src="a.png" alt="A"></p>',
    ).content
    A.view.dispatch(A.view.state.tr.insert(A.view.state.doc.content.size, content))
    expect(B.html()).toBe(A.html())
    expect(B.html()).toContain('<img src="a.png" alt="A">')
  })

  it('people typing at the same time in the same paragraph keep both texts', () => {
    const { A, B, net, sync } = pair('<p>ab</p>')
    net.online = false
    A.insert('X', 2) // aXb
    B.insert('Y', 3) // abY
    sync()
    expect(A.html()).toBe('<p>aXbY</p>')
    expect(B.html()).toBe(A.html())
  })

  it('emoji and other characters outside the BMP keep positions aligned', () => {
    const { A, B } = pair('<p>a😀b</p>')
    A.insert('X', 4) // after the emoji (2 positions in the document too)
    expect(B.html()).toBe('<p>a😀Xb</p>')
    B.view.dispatch(B.view.state.tr.delete(2, 4)) // remove the emoji
    expect(A.html()).toBe('<p>aXb</p>')
    B.view.dispatch(B.view.state.tr.addMark(1, 4, schema.mark('italic')))
    expect(A.html()).toBe('<p><em>aXb</em></p>')
  })

  it('the cursor stays where it was when someone edits earlier in the paragraph', () => {
    const { A, B } = pair('<p>hello world</p>')
    A.view.dispatch(A.view.state.tr.setSelection(TextSelection.create(A.view.state.doc, 7))) // before "world"
    B.insert('>> ', 1)
    expect(A.html()).toBe('<p>&gt;&gt; hello world</p>')
    expect(
      A.view.state.doc.textBetween(A.view.state.selection.from, A.view.state.selection.from + 5),
    ).toBe('world')
  })

  it('undo only undoes your own changes', () => {
    const { A, B } = pair('<p>ab</p>')
    A.insert('A', 3)
    B.insert('B', 1)
    expect(A.html()).toBe('<p>BabA</p>')
    A.undo()
    expect(A.html()).toBe('<p>Bab</p>')
    expect(B.html()).toBe('<p>Bab</p>')
  })
})

describe('remote content is untrusted (§5.8)', () => {
  it('unknown nodes, unsafe URLs and invalid attributes are dropped', () => {
    const { A, ydocs } = pair('<p>ok</p>')
    const frag = ydocs[1].getXmlFragment('scriba')
    ydocs[1].transact(() => {
      frag.insert(frag.length, [new Y.XmlElement('script')])
      const p = new Y.XmlElement('paragraph')
      const text = new Y.XmlText()
      text.insert(0, 'link', { link: JSON.stringify({ href: 'javascript:alert(1)' }) })
      text.insertEmbed(4, { type: 'image', attrs: { src: 'data:image/svg+xml;base64,PHN2Zz4=' } })
      text.insertEmbed(5, { type: 'paragraph' }) // a block as an inline: refused
      p.insert(0, [text])
      const h = new Y.XmlElement('heading')
      h.setAttribute('level', JSON.stringify(99))
      frag.insert(frag.length, [p, h])
    })
    expect(A.html()).toBe('<p>ok</p><p>link</p>')
  })

  it('invalid structures are repaired or dropped (a row without cells, a bare cell)', () => {
    const { A, ydocs } = pair('<p>ok</p>')
    const frag = ydocs[1].getXmlFragment('scriba')
    ydocs[1].transact(() => {
      const table = new Y.XmlElement('table')
      table.insert(0, [new Y.XmlElement('table_row')])
      frag.insert(frag.length, [table, new Y.XmlElement('table_cell')])
    })
    // whatever is left must be a valid document
    expect(() => A.view.state.doc.check()).not.toThrow()
    expect(A.html()).not.toContain('<td>x')
  })
})

describe('convergence', () => {
  it('random concurrent edits end in the same, valid document', () => {
    let seed = 42
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % n
    }
    for (let round = 0; round < 20; round++) {
      const { A, B, net, sync } = pair('<p>abc</p><p>def</p>')
      net.online = false
      for (const E of [A, B, A, B, A]) {
        const size = E.view.state.doc.content.size
        const pos = 1 + rand(size - 1)
        const $pos = E.view.state.doc.resolve(pos)
        if (!$pos.parent.isTextblock) continue
        const op = rand(3)
        if (op === 0) E.insert('xyz'.slice(0, 1 + rand(3)), pos)
        else if (op === 1 && $pos.parentOffset > 0)
          E.view.dispatch(E.view.state.tr.delete(pos - 1, pos))
        else E.view.dispatch(E.view.state.tr.split(pos))
      }
      sync()
      expect(B.html()).toBe(A.html())
      expect(() => A.view.state.doc.check()).not.toThrow()
    }
  })
})
