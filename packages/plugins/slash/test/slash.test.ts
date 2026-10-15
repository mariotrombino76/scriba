// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  basicSchemaSpec,
  keymap,
  runKeymaps,
  serializeHTML,
} from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView, someProp } from '@scriba/view'
import {
  basicSlashItems,
  filterItems,
  getSlashState,
  slashCommands,
  slashKeymap,
  type SlashItem,
} from '../src/index.js'

const schema = new Schema(basicSchemaSpec)
const t = createTranslator('it')
let ran = 0
const items: SlashItem[] = [
  ...basicSlashItems(schema),
  { id: 'table', label: () => 'Tabella', keywords: ['table'], run: () => ran++ },
  { id: 'emoji', label: () => 'Emoji e simboli', keywords: ['faccine'], run: () => ran++ },
]

function setup() {
  const place = document.createElement('div')
  document.body.appendChild(place)
  const view = new EditorView(place, {
    state: EditorState.create({
      schema,
      plugins: [...slashCommands(items, t), keymap(slashKeymap(items, t), { priority: 110 })],
    }),
  })
  view.focus()
  const type = (text: string) => {
    for (const ch of text) {
      const { from, to } = view.state.selection
      if (!someProp(view.state, 'handleTextInput', (h) => h(view, from, to, ch)))
        view.dispatch(view.state.tr.insertText(ch))
    }
  }
  const key = (name: string) =>
    runKeymaps(
      view.state,
      (tr) => view.dispatch(tr),
      { key: name, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false },
      view,
    )
  const html = () => serializeHTML(view.state.doc)
  return {
    view,
    type,
    key,
    html,
    menu: () => document.querySelector('.scriba-slash-menu') as HTMLElement,
  }
}

describe('filtering', () => {
  it('by label prefix first, then words anywhere (labels and keywords), ignoring accents', () => {
    expect(filterItems(items, 'tit', t).map((i) => i.id)).toEqual([
      'heading1',
      'heading2',
      'heading3',
    ])
    expect(filterItems(items, 'h2', t).map((i) => i.id)).toEqual(['heading2'])
    expect(filterItems(items, 'FACCINE', t).map((i) => i.id)).toEqual(['emoji'])
    expect(filterItems(items, 'simbol', t).map((i) => i.id)).toEqual(['emoji'])
    expect(filterItems(items, 'zzz', t)).toEqual([])
  })
})

describe('slash menu', () => {
  it('"/" at the start opens it; typing filters; Enter runs the entry and removes "/query"', () => {
    const { type, key, html, view, menu } = setup()
    type('/')
    expect(getSlashState(view.state).active).toBe(true)
    expect(menu().hidden).toBe(false)
    expect(view.dom.getAttribute('aria-controls')).toBe(menu().id)
    type('tit')
    key('ArrowDown')
    expect(view.dom.getAttribute('aria-activedescendant')).toMatch(/heading2$/)
    key('Enter')
    expect(html()).toBe('<h2></h2>')
    expect(getSlashState(view.state).active).toBe(false)
    expect(menu().hidden).toBe(true)
  })

  it('actions with run (dialogs) get the view', () => {
    const { type, key, html } = setup()
    const before = ran
    type('/tab')
    key('Tab')
    expect(ran).toBe(before + 1)
    expect(html()).toBe('<p></p>')
  })

  it('Escape closes and keeps the text; "/" inside a word does not open', () => {
    const { type, key, html, view } = setup()
    type('/ti')
    expect(key('Escape')).toBe(true)
    expect(getSlashState(view.state).active).toBe(false)
    expect(html()).toBe('<p>/ti</p>')
    type(' a/b')
    expect(getSlashState(view.state).active).toBe(false)
  })

  it('closes when the "/" is deleted or the cursor leaves', () => {
    const { type, view } = setup()
    type('/ti')
    const { from } = getSlashState(view.state)
    view.dispatch(view.state.tr.delete(from, from + 3))
    expect(getSlashState(view.state).active).toBe(false)
  })

  it('"/" followed by a space is just a slash ("e / o")', () => {
    const { type, key, view, html } = setup()
    type('/')
    key(' ')
    type(' o')
    expect(getSlashState(view.state).active).toBe(false)
    expect(html()).toBe('<p>/ o</p>')
  })

  it('a query matching nothing closes the menu at the next space (normal typing goes on)', () => {
    const { type, key, view, html } = setup()
    type('/zzz')
    expect(getSlashState(view.state).active).toBe(true)
    key(' ') // keydown first, then the space is typed
    type(' ')
    expect(getSlashState(view.state).active).toBe(false)
    expect(html()).toBe('<p>/zzz </p>')
  })
})
