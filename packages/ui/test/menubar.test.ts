// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection, history } from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import {
  defineScribaMenubar,
  historyItems,
  markItems,
  blockStyleMenu,
  type ScribaMenubar,
} from '../src/index.js'
import { doc, p, schema } from '../../core/test/helpers/schema.js'

defineScribaMenubar()

function setup(editable = true) {
  document.body.textContent = ''
  const bar = document.createElement('scriba-menubar') as ScribaMenubar
  const place = document.createElement('div')
  document.body.append(bar, place)
  const d = doc(p('abc'))
  const view = new EditorView(place, {
    state: EditorState.create({
      doc: d,
      selection: TextSelection.create(d, 1, 3),
      plugins: [history()],
    }),
    editable: () => editable,
  })
  bar.mac = false
  bar.translator = createTranslator('it')
  bar.menus = [
    { id: 'edit', label: 'menu.edit', items: historyItems() },
    { id: 'format', label: 'menu.format', items: [...markItems(schema), blockStyleMenu(schema)!] },
  ]
  bar.view = view
  const items = () => [...bar.querySelectorAll<HTMLButtonElement>('.scriba-menubar-item')]
  const key = (el: Element, k: string) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  const openMenu = () => bar.querySelector<HTMLElement>('[role=menu]:not([hidden])')
  return { bar, view, items, key, openMenu }
}

describe('<scriba-menubar>', () => {
  it('is a menubar with one tab stop and named menus', () => {
    const { bar, items } = setup()
    expect(bar.getAttribute('role')).toBe('menubar')
    expect(bar.getAttribute('aria-label')).toBe('Menu')
    expect(items().map((b) => b.textContent)).toEqual(['Modifica', 'Formato'])
    expect(items().map((b) => b.tabIndex)).toEqual([0, -1])
    expect(items()[0]!.getAttribute('aria-haspopup')).toBe('menu')
  })

  it('arrows move between menus; Down opens; Left/Right in an open menu switch menus', () => {
    const { items, key, openMenu } = setup()
    items()[0]!.focus()
    key(items()[0]!, 'ArrowRight')
    expect(document.activeElement).toBe(items()[1])
    key(items()[1]!, 'ArrowDown')
    expect(openMenu()?.getAttribute('aria-label')).toBe('Formato')
    expect(items()[1]!.getAttribute('aria-expanded')).toBe('true')
    key(document.activeElement!, 'ArrowRight') // wraps to "Modifica"
    expect(openMenu()?.getAttribute('aria-label')).toBe('Modifica')
    key(document.activeElement!, 'Escape')
    expect(openMenu()).toBeNull()
    expect(document.activeElement).toBe(items()[0])
  })

  it('entries run commands on the editor; toolbar menus become sub-menus', () => {
    const { view, items, openMenu } = setup()
    items()[1]!.click()
    openMenu()!.querySelector<HTMLButtonElement>('[data-entry=bold]')!.click()
    expect(view.state.doc.firstChild!.firstChild!.marks.map((m) => m.type.name)).toEqual(['bold'])
    items()[1]!.click()
    const style = openMenu()!.querySelector<HTMLButtonElement>('[data-entry=block-style]')!
    expect(style.getAttribute('aria-haspopup')).toBe('menu')
    style.click()
    expect(openMenu()?.getAttribute('aria-label')).toBe('Stile paragrafo')
  })

  it('read-only: editing entries are disabled, like in the toolbar', () => {
    const { items, openMenu } = setup(false)
    items()[1]!.click()
    expect(openMenu()!.querySelector('[data-entry=bold]')!.getAttribute('aria-disabled')).toBe(
      'true',
    )
  })

  it("'|' separates groups", () => {
    const { bar, items, openMenu } = setup()
    bar.menus = [
      { id: 'm', label: 'menu.edit', items: [...historyItems(), '|', ...markItems(schema)] },
    ]
    items()[0]!.click()
    const menu = openMenu()!
    expect(menu.querySelectorAll('[role=separator]')).toHaveLength(1)
    expect(
      menu.querySelector('[role=separator]')!.nextElementSibling!.getAttribute('data-entry'),
    ).toBe('bold')
  })
})

describe('clearFormatting', () => {
  it('removes formatting marks but keeps links and annotations', async () => {
    const { clearFormatting } = await import('../src/index.js')
    const d = doc(
      p(schema.text('ab', [schema.mark('bold'), schema.mark('link', { href: 'https://x.it' })])),
    )
    let state = EditorState.create({ doc: d, selection: TextSelection.create(d, 1, 3) })
    expect(clearFormatting(state, (tr) => (state = state.apply(tr)))).toBe(true)
    expect(state.doc.firstChild!.firstChild!.marks.map((m) => m.type.name)).toEqual(['link'])
    expect(clearFormatting(state)).toBe(false) // nothing left to clear
  })
})

describe('sub-menus and scrolling', () => {
  it('scrolling inside the parent menu does not close a sub-menu', () => {
    const { items, openMenu } = setup()
    items()[1]!.click()
    const parent = openMenu()!
    parent.querySelector<HTMLButtonElement>('[data-entry=block-style]')!.click()
    expect(openMenu()?.getAttribute('aria-label')).toBe('Stile paragrafo')
    parent.dispatchEvent(new Event('scroll'))
    expect(openMenu()?.getAttribute('aria-label')).toBe('Stile paragrafo')
    document.dispatchEvent(new Event('scroll')) // the page itself: closes
    expect(openMenu()).toBeNull()
  })
})
