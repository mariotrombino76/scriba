// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection, history } from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import {
  blockStyleMenu,
  contextMenu,
  historyItems,
  markItems,
  selectAllItem,
  type ContextMenuSection,
} from '../src/index.js'
import { doc, p, schema } from '../../core/test/helpers/schema.js'

function setup(sections: ContextMenuSection[], editable = true) {
  document.body.textContent = ''
  const place = document.createElement('div')
  document.body.append(place)
  const d = doc(p('abcdef'))
  const view = new EditorView(place, {
    state: EditorState.create({
      doc: d,
      selection: TextSelection.create(d, 1, 3),
      plugins: [history()],
    }),
    editable: () => editable,
  })
  // jsdom has no layout: the click lands at position 5, the caret box is fixed
  view.posAtCoords = () => 5
  view.coordsAtPos = () => ({ left: 10, right: 10, top: 20, bottom: 30 })
  const menu = contextMenu(view, { sections, translator: createTranslator('it'), mac: false })
  const rightClick = (init: MouseEventInit = {}) => {
    const event = new MouseEvent('contextmenu', {
      button: 2,
      clientX: 50,
      clientY: 60,
      bubbles: true,
      cancelable: true,
      ...init,
    })
    view.dom.dispatchEvent(event)
    return event
  }
  const openMenu = () => document.querySelector<HTMLElement>('[role=menu]:not([hidden])')
  const key = (k: string) =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
    )
  return { view, menu, rightClick, openMenu, key }
}

const always = (id: string, items: ContextMenuSection['items']): ContextMenuSection => ({
  id,
  isVisible: () => true,
  items,
})

describe('contextMenu', () => {
  it('no section applies: the browser menu opens (event not prevented)', () => {
    const { rightClick, openMenu } = setup([{ id: 'x', isVisible: () => false, items: [] }])
    expect(rightClick().defaultPrevented).toBe(false)
    expect(openMenu()).toBeNull()
  })

  it('opens at the click with the sections that apply, separated', () => {
    const { rightClick, openMenu } = setup([
      always('marks', markItems(schema).slice(0, 2)),
      { id: 'hidden', isVisible: () => false, items: historyItems() },
      always('all', [selectAllItem()]),
    ])
    expect(rightClick().defaultPrevented).toBe(true)
    const menu = openMenu()!
    expect(menu.getAttribute('aria-label')).toBe('Menu contestuale')
    expect(
      [...menu.querySelectorAll('[data-entry]')].map((e) => e.getAttribute('data-entry')),
    ).toEqual(['bold', 'italic', 'select-all'])
    expect(
      menu.querySelector('[role=separator]')!.nextElementSibling!.getAttribute('data-entry'),
    ).toBe('select-all')
    expect(menu.style.left).toBe('50px')
    expect(menu.style.top).toBe('60px')
    expect(document.activeElement).toBe(menu.querySelector('[data-entry=bold]'))
  })

  it('Ctrl+right click keeps the browser menu', () => {
    const { rightClick, openMenu } = setup([always('marks', markItems(schema))])
    expect(rightClick({ ctrlKey: true }).defaultPrevented).toBe(false)
    expect(openMenu()).toBeNull()
  })

  it('a right click outside the selection moves the cursor there; inside keeps it', () => {
    const { view, rightClick } = setup([always('marks', markItems(schema))])
    rightClick() // position 5, outside 1–3
    expect([view.state.selection.from, view.state.selection.to]).toEqual([5, 5])
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 6)))
    rightClick()
    expect([view.state.selection.from, view.state.selection.to]).toEqual([2, 6])
  })

  it('the menu key opens it at the cursor without moving it', () => {
    const { view, rightClick, openMenu } = setup([always('marks', markItems(schema))])
    rightClick({ button: 0, clientX: 0, clientY: 0 })
    expect([view.state.selection.from, view.state.selection.to]).toEqual([1, 3])
    expect(openMenu()!.style.top).toBe('34px')
  })

  it('entries run on the selection; Escape gives the focus back to the editor', () => {
    const { view, rightClick, openMenu, key } = setup([always('marks', markItems(schema))])
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4, 6)))
    rightClick()
    openMenu()!.querySelector<HTMLButtonElement>('[data-entry=bold]')!.click()
    expect(openMenu()).toBeNull()
    expect(view.state.doc.firstChild!.child(1).marks.map((m) => m.type.name)).toEqual(['bold'])
    rightClick()
    key('Escape')
    expect(openMenu()).toBeNull()
    expect(document.activeElement).toBe(view.dom)
  })

  it('toolbar menus are sub-menus: Right opens, Left goes back', () => {
    const { rightClick, openMenu, key } = setup([always('style', [blockStyleMenu(schema)!])])
    rightClick()
    expect(document.activeElement!.getAttribute('aria-haspopup')).toBe('menu')
    key('ArrowRight')
    expect(openMenu()!.getAttribute('aria-label')).toBe('Stile paragrafo')
    key('ArrowLeft')
    expect(openMenu()!.getAttribute('aria-label')).toBe('Menu contestuale')
  })

  it('read-only: editing entries are disabled, read-only ones are not', () => {
    const { rightClick, openMenu } = setup(
      [always('mixed', [...markItems(schema).slice(0, 1), selectAllItem()])],
      false,
    )
    rightClick()
    const menu = openMenu()!
    expect(menu.querySelector('[data-entry=bold]')!.getAttribute('aria-disabled')).toBe('true')
    expect(menu.querySelector('[data-entry=select-all]')!.getAttribute('aria-disabled')).toBe(
      'false',
    )
  })

  it('a click elsewhere in the editor closes it; destroy removes the listener', () => {
    const { view, menu, rightClick, openMenu } = setup([always('marks', markItems(schema))])
    rightClick()
    view.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(openMenu()).toBeNull()
    menu.destroy()
    expect(rightClick().defaultPrevented).toBe(false)
  })
})
