// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, Schema, TextSelection, basicSchemaSpec, serializeHTML } from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import { textStyleMarks, textStyleToolbarItems, withBlockStyles } from '@scriba/plugin-text-style'
import { defineScribaToolbar, type ScribaToolbar } from '../src/index.js'

defineScribaToolbar()
const schema = new Schema({
  nodes: withBlockStyles(basicSchemaSpec.nodes),
  marks: { ...basicSchemaSpec.marks, ...textStyleMarks },
})

function setup() {
  document.body.textContent = ''
  const toolbar = document.createElement('scriba-toolbar') as ScribaToolbar
  const place = document.createElement('div')
  document.body.append(toolbar, place)
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('abc')])])
  const view = new EditorView(place, {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, 1, 3) }),
  })
  toolbar.translator = createTranslator('it')
  toolbar.items = textStyleToolbarItems(schema)
  toolbar.view = view
  const button = toolbar.querySelector<HTMLButtonElement>('[data-item="text-color"]')!
  const menu = document.getElementById(button.getAttribute('aria-controls')!)!
  const key = (k: string) =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
    )
  return { toolbar, view, button, menu, key }
}

describe('toolbar menus', () => {
  it('is a WAI-ARIA menu button with labelled entries and swatches', () => {
    const { button, menu } = setup()
    expect(button.getAttribute('aria-haspopup')).toBe('menu')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(menu.getAttribute('role')).toBe('menu')
    expect(menu.hidden).toBe(true)
    const first = menu.querySelector('[role=menuitemradio]')!
    expect(first.getAttribute('aria-label')).toBe('Nero')
    const swatch = first.querySelector<HTMLElement>('.scriba-swatch')!
    expect(swatch.style.backgroundColor).toBe('rgb(0, 0, 0)')
  })

  it('opens, navigates with arrows, chooses with Enter/click and closes', () => {
    const { view, button, menu, key } = setup()
    button.focus()
    button.click()
    expect(menu.hidden).toBe(false)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Nero')
    key('ArrowDown')
    key('ArrowDown')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Rosso')
    ;(document.activeElement as HTMLButtonElement).click()
    expect(menu.hidden).toBe(true)
    expect(serializeHTML(view.state.doc)).toBe('<p><span style="color: #b91c1c">ab</span>c</p>')
    // reopening marks the current color
    button.click()
    expect(menu.querySelector('[aria-checked=true]')?.getAttribute('aria-label')).toBe('Rosso')
  })

  it('Escape closes and returns focus to the button; ArrowDown opens', () => {
    const { button, menu, key } = setup()
    button.focus()
    key('ArrowDown')
    expect(menu.hidden).toBe(false)
    key('Escape')
    expect(menu.hidden).toBe(true)
    expect(document.activeElement).toBe(button)
  })

  it('closes when clicking outside', () => {
    const { button, menu } = setup()
    button.click()
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(menu.hidden).toBe(true)
  })
})
