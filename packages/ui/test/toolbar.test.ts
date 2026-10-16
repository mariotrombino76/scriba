// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection, history, type Node } from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import { defineScribaToolbar, formatShortcut, type ScribaToolbar } from '../src/index.js'
import { b, doc, h, p } from '../../core/test/helpers/schema.js'

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
  const control = (id: string) => toolbar.querySelector<HTMLButtonElement>(`[data-item="${id}"]`)!
  return { toolbar, view, control }
}

describe('<scriba-toolbar>', () => {
  it('renders named groups of accessible controls', () => {
    const { toolbar, control } = setup(doc(p('ab')))
    expect(toolbar.getAttribute('role')).toBe('toolbar')
    expect(toolbar.getAttribute('aria-label')).toBe('Formattazione')
    const groups = [...toolbar.querySelectorAll('[role=group]')].map((g) =>
      g.getAttribute('aria-label'),
    )
    expect(groups).toEqual(['Cronologia', 'Stile del testo', 'Formattazione carattere'])
    expect(control('bold').getAttribute('aria-label')).toBe('Grassetto')
    expect(control('bold').title).toBe('Grassetto (Ctrl+B)')
    expect(control('bold').getAttribute('aria-keyshortcuts')).toBe('Control+B')
    // icons are decorative SVG, not markup strings
    const icon = control('undo').querySelector('svg')!
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    // one tab stop
    expect([...toolbar.querySelectorAll('button')].filter((el) => el.tabIndex === 0)).toHaveLength(
      1,
    )
  })

  it('shows the paragraph style as the value of its menu', () => {
    const { view, control } = setup(doc(h(2, 'x'), p('a', b('bc'))), 2)
    expect(control('block-style').getAttribute('aria-label')).toBe('Stile paragrafo: Titolo 2')
    expect(control('block-style').textContent).toContain('Titolo 2')
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6, 7)))
    expect(control('block-style').getAttribute('aria-label')).toBe('Stile paragrafo: Paragrafo')
    expect(control('bold').getAttribute('aria-pressed')).toBe('true')
  })

  it('changes the block style from the menu, with previews and shortcuts', () => {
    const { view, control, toolbar } = setup(doc(p('ab')), 1)
    control('block-style').click()
    const menu = toolbar.querySelector<HTMLElement>('[role=menu]:not([hidden])')!
    const h2 = menu.querySelector<HTMLButtonElement>('[data-entry="heading-2"]')!
    expect(h2.classList.contains('scriba-preview-h2')).toBe(true)
    expect(h2.textContent).toContain('Ctrl+Alt+2')
    expect(menu.querySelector('[aria-checked=true]')?.getAttribute('aria-label')).toBe('Paragrafo')
    h2.click()
    expect(view.state.doc.eq(doc(h(2, 'ab')))).toBe(true)
  })

  it('runs commands on click and disables unavailable ones', () => {
    const { view, control } = setup(doc(p('abc')), 1, 3)
    expect(control('undo').getAttribute('aria-disabled')).toBe('true')
    control('bold').click()
    expect(view.state.doc.eq(doc(p(b('ab'), 'c')))).toBe(true)
    expect(control('undo').getAttribute('aria-disabled')).toBe('false')
    control('undo').click()
    expect(view.state.doc.eq(doc(p('abc')))).toBe(true)
    control('undo').click() // aria-disabled: stays focusable, does nothing
    expect(view.state.doc.eq(doc(p('abc')))).toBe(true)
  })

  it('moves focus with arrow keys, Home and End across groups (roving tabindex)', () => {
    const { toolbar, control } = setup(doc(p('a')))
    const key = (k: string) =>
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
    control('undo').focus()
    key('ArrowRight')
    expect(document.activeElement).toBe(control('redo'))
    key('ArrowRight')
    expect(document.activeElement).toBe(control('block-style'))
    expect(control('block-style').tabIndex).toBe(0)
    expect(control('undo').tabIndex).toBe(-1)
    key('End')
    expect(document.activeElement).toBe(control('code'))
    key('Home')
    expect(document.activeElement).toBe(control('undo'))
    key('ArrowLeft')
    expect(document.activeElement).toBe(control('code'))
    expect(toolbar.contains(document.activeElement)).toBe(true)
  })

  it('hides contextual controls and skips them in keyboard navigation', () => {
    const { toolbar, control } = setup(doc(p('a')))
    toolbar.items = [
      { type: 'button', id: 'always', text: 'A', label: () => 'Sempre', command: () => true },
      {
        type: 'button',
        id: 'heading-only',
        text: 'H',
        label: () => 'Solo nei titoli',
        command: () => true,
        isVisible: (state) => state.selection.$from.parent.type.name === 'heading',
      },
    ]
    expect(control('heading-only').hidden).toBe(true)
    expect([...toolbar.querySelectorAll('button')].filter((el) => el.tabIndex === 0)).toEqual([
      control('always'),
    ])
  })

  it('is disabled when the editor is read-only', () => {
    const { view, control } = setup(doc(p('abc')), 1, 3)
    view.options.editable = () => false
    view.updateState(view.state)
    expect(control('bold').getAttribute('aria-disabled')).toBe('true')
    expect(control('block-style').getAttribute('aria-disabled')).toBe('true')
  })

  it('read-only: items marked readOnly stay usable but can never change the document', () => {
    const { toolbar, view, control } = setup(doc(p('abc')), 1, 3)
    let opened = 0
    toolbar.items = [
      {
        type: 'button',
        id: 'sneaky',
        label: () => 'Sneaky',
        readOnly: true,
        command: (state, dispatch) => {
          dispatch?.(state.tr.insertText('x', 1))
          return true
        },
      },
      { type: 'button', id: 'find', label: () => 'Find', readOnly: true, command: () => true, run: () => opened++ },
      { type: 'button', id: 'edit', label: () => 'Edit', command: () => true, run: () => opened++ },
    ] // prettier-ignore
    view.options.editable = () => false
    view.updateState(view.state)
    expect(control('sneaky').getAttribute('aria-disabled')).toBe('false')
    expect(control('find').getAttribute('aria-disabled')).toBe('false')
    expect(control('edit').getAttribute('aria-disabled')).toBe('true')
    control('sneaky').click()
    control('find').click()
    control('edit').click()
    expect(view.state.doc.textContent).toBe('abc')
    expect(opened).toBe(1)
  })

  it('uses the translator and English fallback', () => {
    const { toolbar, control } = setup(doc(p('a')), 1, 1, 'en')
    expect(control('bold').getAttribute('aria-label')).toBe('Bold')
    toolbar.translator = createTranslator('it', { 'mark.bold': 'Neretto' })
    expect(control('bold').getAttribute('aria-label')).toBe('Neretto')
  })

  it('has a hidden "More options" button until something overflows', () => {
    const { toolbar } = setup(doc(p('a')))
    const more = toolbar.querySelector<HTMLButtonElement>('.scriba-toolbar-more')!
    expect(more.getAttribute('aria-label')).toBe('Altre opzioni')
    expect(more.hidden).toBe(true) // jsdom has no layout: nothing overflows (layout is tested e2e)
  })
})

describe('formatShortcut', () => {
  const t = createTranslator('it')
  it('formats for PC and mac', () => {
    expect(formatShortcut('Shift-Mod-z', t, false)).toBe('Ctrl+Maiusc+Z')
    expect(formatShortcut('Mod-Alt-1', t, false)).toBe('Ctrl+Alt+1')
    expect(formatShortcut('Shift-Mod-z', t, true)).toBe('⇧⌘Z')
  })
})
