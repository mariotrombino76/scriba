// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { StrictMode, act, createElement, createRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ScribaEditor, type UseScriba } from '../src/index.js'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null
let host: HTMLElement
afterEach(() => {
  act(() => root?.unmount())
  root = null
  host?.remove()
})

function render(element: Parameters<Root['render']>[0]) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(element))
  const editor = () => host.querySelector<HTMLElement>('[role=textbox]')!
  return { host, editor }
}

const type = (el: HTMLElement, text: string) =>
  act(() => {
    el.focus()
    el.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: text,
        bubbles: true,
        cancelable: true,
      }),
    )
  })

describe('<ScribaEditor> (React)', () => {
  it('inline: the toolbar shows only while the editor has the focus', () => {
    const { host, editor } = render(
      createElement(ScribaEditor, { value: '<p>a</p>', inline: true }),
    )
    expect(host.querySelector('.scriba')!.classList.contains('scriba-inline')).toBe(true)
    const bar = host.querySelector<HTMLElement>('scriba-toolbar')!
    expect(bar.hidden).toBe(true)
    act(() => editor().focus())
    expect(bar.hidden).toBe(false)
  })

  it('renders the toolbar and the editor; the initial HTML goes through the schema', () => {
    const { host, editor } = render(
      createElement(ScribaEditor, { value: '<p>Ciao<script>alert(1)</script></p>' }),
    )
    expect(host.querySelector('scriba-toolbar')!.getAttribute('role')).toBe('toolbar')
    expect(editor().getAttribute('aria-label')).toBe('Editor di testo formattato')
    expect(editor().innerHTML).not.toContain('script')
    expect(editor().textContent).toBe('Ciao')
  })

  it('onChange gets the HTML after typing; a value from outside replaces the content', () => {
    const changes: string[] = []
    let setOutside: (v: string) => void = () => {}
    function App() {
      const [html, setHtml] = useState('<p>a</p>')
      setOutside = setHtml
      return createElement(ScribaEditor, {
        value: html,
        onChange: (v) => {
          changes.push(v as string)
          setHtml(v as string)
        },
      })
    }
    const { editor } = render(createElement(App))
    type(editor(), 'b')
    expect(changes.at(-1)).toMatch(/^<p>(ab|ba)<\/p>$/)
    act(() => setOutside('<p>da fuori <img src=x onerror=alert(1)></p>'))
    expect(editor().textContent).toBe('da fuori')
    expect(editor().innerHTML).not.toContain('onerror')
    // our own change does not come back as a replacement (no feedback loop)
    expect(changes).toHaveLength(1)
  })

  it('the ref exposes getContent, setContent and the view', () => {
    const ref = createRef<UseScriba>()
    render(createElement(ScribaEditor, { ref, value: '<p>x</p>', toolbar: false }))
    expect(ref.current!.getContent()).toBe('<p>x</p>')
    act(() => ref.current!.setContent('<h2>Titolo</h2>'))
    expect(ref.current!.getContent()).toBe('<h2>Titolo</h2>')
    expect(ref.current!.view!.state.doc.firstChild!.type.name).toBe('heading')
  })

  it('JSON format', () => {
    const onChange = vi.fn()
    const value = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'j' }] }],
    }
    const { editor } = render(createElement(ScribaEditor, { value, format: 'json', onChange }))
    type(editor(), 'k')
    expect(onChange.mock.calls.at(-1)![0]).toMatchObject({ type: 'doc' })
  })

  it('editable can change after mounting (read-only)', () => {
    function App({ editable }: { editable: boolean }) {
      return createElement(ScribaEditor, { value: '<p>a</p>', editable })
    }
    const { editor } = render(createElement(App, { editable: true }))
    expect(editor().getAttribute('aria-readonly')).toBe('false')
    act(() => root!.render(createElement(App, { editable: false })))
    expect(editor().getAttribute('aria-readonly')).toBe('true')
  })

  it('StrictMode (double mount): one editor; unmount removes it', () => {
    const { host } = render(
      createElement(StrictMode, null, createElement(ScribaEditor, { value: '<p>a</p>' })),
    )
    expect(host.querySelectorAll('[role=textbox]')).toHaveLength(1)
    act(() => root!.unmount())
    root = null
    expect(host.querySelectorAll('[role=textbox]')).toHaveLength(0)
  })
})
