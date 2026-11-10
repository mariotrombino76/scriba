// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
} from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { EditorView, someProp } from '@scriba-editor/view'
import {
  fillMergeTags,
  insertMergeTag,
  mergeTagMenu,
  mergeTagNodes,
  mergeTags,
  mergeTagsIn,
} from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...mergeTagNodes },
  marks: basicSchemaSpec.marks,
})
const t = createTranslator('it')
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const html = (input: string) => serializeHTML(parse(input))
const TAG = (name: string) => `<span data-merge-tag="${name}">{{${name}}}</span>`
const TAGS = [
  { name: 'cliente.nome', label: 'Nome', group: 'Cliente' },
  { name: 'cliente.email', label: 'E-mail', group: 'Cliente' },
  { name: 'data_oggi', label: 'Data di oggi' },
]

describe('merge tag node', () => {
  it('round trip; the text inside is always rebuilt from the name', () => {
    expect(html(`<p>Gentile ${TAG('cliente.nome')},</p>`)).toBe(
      `<p>Gentile ${TAG('cliente.nome')},</p>`,
    )
    expect(
      html(
        '<p><span data-merge-tag="cliente.nome"><b>altro</b><img src=x onerror=alert(1)></span></p>',
      ),
    ).toBe(`<p>${TAG('cliente.nome')}</p>`)
  })

  it('only safe names; other spans keep their text', () => {
    for (const bad of ['Cliente.Nome', 'a b', 'a..b', '.a', 'a"><script>', '', 'x'.repeat(101)])
      expect(html(`<p><span data-merge-tag="${bad.replace(/"/g, '&quot;')}">t</span></p>`)).toBe(
        '<p>t</p>',
      )
  })

  it('exports as {{name}}', () => {
    expect(parse(`<p>a ${TAG('data_oggi')}</p>`).textContent).toBe('a {{data_oggi}}')
  })
})

describe('commands and helpers', () => {
  it('insertMergeTag and the menu', () => {
    const doc = parse('<p>Ciao</p>')
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 5) })
    expect(insertMergeTag('cliente.nome')(state, (tr) => (state = state.apply(tr)))).toBe(true)
    expect(serializeHTML(state.doc)).toBe(`<p>Ciao${TAG('cliente.nome')}</p>`)
    expect(insertMergeTag('Not Valid')(state)).toBe(false)
    const menu = mergeTagMenu(TAGS)
    expect(menu.entries.map((e) => e.label(t))).toEqual([
      'Cliente › Nome',
      'Cliente › E-mail',
      'Data di oggi',
    ])
    expect(() => mergeTagMenu([{ name: 'X', label: 'x' }])).toThrow()
  })

  it('fillMergeTags puts values in as plain text, keeping the formatting', () => {
    const doc = parse(`<p><strong>Gentile ${TAG('cliente.nome')}</strong>, ${TAG('ignoto')}</p>`)
    const filled = fillMergeTags(doc, { 'cliente.nome': '<b>Anna</b>' })
    expect(serializeHTML(filled)).toBe(
      `<p><strong>Gentile &lt;b&gt;Anna&lt;/b&gt;</strong>, ${TAG('ignoto')}</p>`,
    )
    expect(filled.firstChild!.childCount).toBe(3) // "Gentile Anna" is one text node
    expect(mergeTagsIn({ doc })).toEqual(['cliente.nome', 'ignoto'])
  })
})

describe('"{{" suggestions', () => {
  it('typing "{{" opens the list; choosing inserts the tag', async () => {
    const place = document.createElement('div')
    document.body.appendChild(place)
    const tags = mergeTags(TAGS, t)
    const doc = parse('<p>Ciao</p>')
    const view = new EditorView(place, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 5),
        plugins: tags.plugins,
      }),
    })
    view.focus()
    const type = (text: string) => {
      for (const ch of text) {
        const { from, to } = view.state.selection
        if (!someProp(view.state, 'handleTextInput', (f) => f(view, from, to, ch)))
          view.dispatch(view.state.tr.insertText(ch, from, to))
      }
    }
    type('{{cli')
    await new Promise((r) => setTimeout(r, 10))
    const options = [...document.querySelectorAll('[role=option]')].map((o) => o.textContent)
    expect(options).toEqual(['Cliente › Nome{{cliente.nome}}', 'Cliente › E-mail{{cliente.email}}'])
    const keys = tags.keymap()
    keys['ArrowDown']!(view.state, (tr) => view.dispatch(tr), view)
    keys['Enter']!(view.state, (tr) => view.dispatch(tr), view)
    expect(serializeHTML(view.state.doc)).toBe(`<p>Ciao${TAG('cliente.email')}</p>`)
    view.destroy()
  })
})
