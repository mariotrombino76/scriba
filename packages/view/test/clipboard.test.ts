// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from '@scriba-editor/core'
import { EditorView } from '../src/index.js'
import { b, doc, h, mount, p } from './helpers.js'

function clipboardEvent(type: string, data: Record<string, string> = {}) {
  const store = { ...data }
  const event = new Event(type, { cancelable: true, bubbles: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (t: string) => store[t] ?? '',
      setData: (t: string, v: string) => (store[t] = v),
    },
  })
  return { event, store }
}

const paste = (view: EditorView, data: Record<string, string>) => {
  const { event } = clipboardEvent('paste', data)
  view.dom.dispatchEvent(event)
  return event
}

describe('clipboard', () => {
  it('copies model HTML and plain text', () => {
    const view = mount(doc(p('a', b('bc')), p('d')), 2, 7)
    const { event, store } = clipboardEvent('copy')
    view.dom.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(store['text/html']).toBe('<p><strong>bc</strong></p><p>d</p>')
    expect(store['text/plain']).toBe('bc\n\nd')
  })

  it('cuts', () => {
    const view = mount(doc(p('abcd')), 2, 4)
    view.dom.dispatchEvent(clipboardEvent('cut').event)
    expect(view.state.doc.eq(doc(p('ad')))).toBe(true)
  })

  it('pastes inline HTML at the cursor', () => {
    const view = mount(doc(p('ad')), 2)
    paste(view, { 'text/html': '<b>bc</b>' })
    expect(view.state.doc.eq(doc(p('a', b('bc'), 'd')))).toBe(true)
  })

  it('pastes blocks by splitting the current one', () => {
    const view = mount(doc(p('ad')), 2)
    paste(view, { 'text/html': '<p>b</p><h2>c</h2>' })
    expect(view.state.doc.eq(doc(p('ab'), h(2, 'cd')))).toBe(true)
  })

  it('pastes plain text as paragraphs', () => {
    const view = mount(doc(p('ad')), 2)
    paste(view, { 'text/plain': 'b\nc' })
    expect(view.state.doc.eq(doc(p('ab'), p('cd')))).toBe(true)
  })

  it('sanitizes pasted HTML through the schema (§5.2)', () => {
    const view = mount(doc(p('x')), 2)
    paste(view, {
      'text/html':
        '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script><a href="javascript:alert(1)">y</a>',
    })
    expect(view.dom.innerHTML).toBe('<p>x<img src="x" alt="" contenteditable="false">y</p>')
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('clipboardContent and paste(): the same data and path as the events (menu entries)', () => {
    const view = mount(doc(p('a', b('bc')), p('d')), 2, 7)
    expect(view.clipboardContent()).toEqual({
      html: '<p><strong>bc</strong></p><p>d</p>',
      text: 'bc\n\nd',
    })
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)))
    expect(view.clipboardContent()).toBeNull()
    expect(view.paste({ html: '<b>X</b>', text: 'X' })).toBe(true)
    expect(view.state.doc.eq(doc(p('a', b('X'), b('bc')), p('d')))).toBe(true)
    expect(view.paste({ text: '' })).toBe(false)
  })

  it('paste() sanitizes like a paste event (§5.2) and does nothing read-only', () => {
    const view = mount(doc(p('x')), 2)
    expect(
      view.paste({
        html: '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script><a href="javascript:alert(1)">y</a>',
      }),
    ).toBe(true)
    expect(view.dom.innerHTML).toBe('<p>x<img src="x" alt="" contenteditable="false">y</p>')
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()

    document.body.textContent = ''
    const place = document.createElement('div')
    document.body.appendChild(place)
    const d = doc(p('x'))
    const readOnly = new EditorView(place, {
      state: EditorState.create({ doc: d }),
      editable: () => false,
    })
    expect(readOnly.paste({ text: 'no' })).toBe(false)
    expect(readOnly.state.doc.eq(d)).toBe(true)
  })
})
