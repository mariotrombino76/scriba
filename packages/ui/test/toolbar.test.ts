// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection, history, type Node } from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import { defineScribaToolbar, formatShortcut, type ScribaToolbar } from '../src/index.js'
import { b, doc, h, p, schema } from '../../core/test/helpers/schema.js'

defineScribaToolbar()

function setup(d: Node, anchor = 1, head = anchor, lang = 'it') {
  document.body.textContent = ''
  document.documentElement.lang = lang
  const toolbar = document.createElement('scriba-toolbar') as ScribaToolbar
  const place = document.createElement('div')
  document.body.append(toolbar, place)
  const state = EditorState.create({
    doc: d,
    selection: TextSelection.create(d, anchor, head),
    plugins: [history()],
  })
  const view = new EditorView(place, { state })
  toolbar.mac = false
  toolbar.view = view
  const button = (id: string) => toolbar.querySelector<HTMLButtonElement>(`[data-item="${id}"]`)!
  return { toolbar, view, button }
}

describe('<scriba-toolbar>', () => {
  it('renders an accessible toolbar from the schema', () => {
    const { toolbar, button } = setup(doc(p('ab')))
    expect(toolbar.getAttribute('role')).toBe('toolbar')
    expect(toolbar.getAttribute('aria-label')).toBe('Formattazione')
    expect(button('bold').getAttribute('aria-label')).toBe('Grassetto')
    expect(button('bold').title).toBe('Grassetto (Ctrl+B)')
    expect(button('bold').getAttribute('aria-keyshortcuts')).toBe('Control+B')
    expect(button('heading-2').getAttribute('aria-label')).toBe('Titolo 2')
    expect(toolbar.querySelectorAll('[role=separator]').length).toBe(2)
    // one tab stop
    expect([...toolbar.querySelectorAll('button')].filter((el) => el.tabIndex === 0)).toHaveLength(
      1,
    )
  })

  it('reflects active marks and blocks with aria-pressed', () => {
    const { view, button } = setup(doc(h(2, 'x'), p('a', b('bc'))), 6, 7)
    expect(button('bold').getAttribute('aria-pressed')).toBe('true')
    expect(button('paragraph').getAttribute('aria-pressed')).toBe('true')
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)))
    expect(button('heading-2').getAttribute('aria-pressed')).toBe('true')
    expect(button('bold').getAttribute('aria-pressed')).toBe('false')
  })

  it('runs commands on click and disables unavailable ones', () => {
    const { view, button } = setup(doc(p('abc')), 1, 3)
    expect(button('undo').getAttribute('aria-disabled')).toBe('true')
    button('bold').click()
    expect(view.state.doc.eq(doc(p(b('ab'), 'c')))).toBe(true)
    expect(button('undo').getAttribute('aria-disabled')).toBe('false')
    button('undo').click()
    expect(view.state.doc.eq(doc(p('abc')))).toBe(true)
    // aria-disabled buttons stay focusable but do nothing
    button('undo').click()
    expect(view.state.doc.eq(doc(p('abc')))).toBe(true)
  })

  it('moves focus with arrow keys, Home and End (roving tabindex)', () => {
    const { toolbar, button } = setup(doc(p('a')))
    const key = (k: string) =>
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
    button('bold').focus()
    key('ArrowRight')
    expect(document.activeElement).toBe(button('italic'))
    expect(button('italic').tabIndex).toBe(0)
    expect(button('bold').tabIndex).toBe(-1)
    key('ArrowLeft')
    key('ArrowLeft')
    expect(document.activeElement).toBe(button('redo'))
    key('Home')
    expect(document.activeElement).toBe(button('bold'))
    key('End')
    expect(document.activeElement).toBe(button('redo'))
    expect(toolbar.contains(document.activeElement)).toBe(true)
  })

  it('is disabled when the editor is read-only', () => {
    const { view, button } = setup(doc(p('abc')), 1, 3)
    view.options.editable = () => false
    view.updateState(view.state)
    expect(button('bold').getAttribute('aria-disabled')).toBe('true')
  })

  it('uses the translator and English fallback', () => {
    const { toolbar, button } = setup(doc(p('a')), 1, 1, 'en')
    expect(button('bold').getAttribute('aria-label')).toBe('Bold')
    toolbar.translator = createTranslator('it', { 'mark.bold': 'Neretto' })
    expect(button('bold').getAttribute('aria-label')).toBe('Neretto')
  })
})

describe('formatShortcut', () => {
  const t = createTranslator('it')
  it('formats for PC and mac', () => {
    expect(formatShortcut('Shift-Mod-z', t, false)).toBe('Maiusc+Ctrl+Z')
    expect(formatShortcut('Mod-Alt-1', t, false)).toBe('Alt+Ctrl+1')
    expect(formatShortcut('Shift-Mod-z', t, true)).toBe('⇧⌘Z')
    expect(schema).toBeTruthy()
  })
})
