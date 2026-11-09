// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inlineToolbar } from '../src/index.js'

function setup(area: { top: number; bottom: number; left?: number; width?: number }) {
  const container = document.createElement('div')
  const toolbar = document.createElement('div')
  const button = document.createElement('button')
  toolbar.append(button)
  const text = document.createElement('div')
  text.tabIndex = 0
  container.append(toolbar, text)
  const outside = document.createElement('button')
  document.body.append(container, outside)
  const { top, bottom, left = 10, width = 300 } = area
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    top,
    bottom,
    left,
    width,
    height: bottom - top,
    right: left + width,
    x: left,
    y: top,
    toJSON: () => ({}),
  })
  Object.defineProperty(toolbar, 'offsetHeight', { value: 40 })
  const handle = inlineToolbar(container, toolbar)
  return { container, toolbar, button, text, outside, handle }
}
const settle = () => new Promise<void>((r) => queueMicrotask(r))

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('inlineToolbar', () => {
  it('shows the toolbar only while the editor has the focus', async () => {
    const { container, toolbar, button, text, outside } = setup({ top: 200, bottom: 400 })
    expect(container.classList.contains('scriba-inline')).toBe(true)
    expect(toolbar.hidden).toBe(true)
    text.focus()
    expect(toolbar.hidden).toBe(false)
    // into the toolbar: it stays
    button.focus()
    await settle()
    expect(toolbar.hidden).toBe(false)
    outside.focus()
    await settle()
    expect(toolbar.hidden).toBe(true)
  })

  it('floats above the area when there is room', () => {
    const { toolbar, text } = setup({ top: 200, bottom: 400 })
    text.focus()
    expect(toolbar.dataset['placement']).toBe('above')
    expect(toolbar.style.position).toBe('absolute')
    expect(toolbar.style.top).toBe('-44px')
    expect(toolbar.style.width).toBe('300px')
  })

  it('goes below at the top of the window, docks when the area scrolled up', () => {
    const below = setup({ top: 10, bottom: 100 })
    below.text.focus()
    expect(below.toolbar.dataset['placement']).toBe('below')
    expect(below.toolbar.style.top).toBe('94px')
    document.body.replaceChildren()
    const docked = setup({ top: -300, bottom: 600, left: 25 })
    docked.text.focus()
    expect(docked.toolbar.dataset['placement']).toBe('docked')
    expect(docked.toolbar.style.position).toBe('fixed')
    expect(docked.toolbar.style.top).toBe('0px')
    expect(docked.toolbar.style.left).toBe('25px')
  })

  it('Alt+F10 moves the focus into the toolbar', () => {
    const { button, text } = setup({ top: 200, bottom: 400 })
    text.focus()
    text.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', altKey: true, bubbles: true }))
    expect(document.activeElement).toBe(button)
  })

  it('destroy puts everything back', () => {
    const { container, toolbar, text, handle } = setup({ top: 200, bottom: 400 })
    text.focus()
    handle.destroy()
    expect(container.classList.contains('scriba-inline')).toBe(false)
    expect(toolbar.hidden).toBe(false)
    expect(toolbar.style.position).toBe('')
  })
})
