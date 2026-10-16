// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Plugin, TextSelection } from '@scriba/core'
import { b, beforeInput, br, doc, h, img, mount, p, pre, quote, schema, tick } from './helpers.js'

describe('rendering', () => {
  it('renders the document with accessible attributes', () => {
    const view = mount(doc(h(1, 'T'), p('a', b('b')), quote(p('q'))))
    expect(view.dom.innerHTML).toBe(
      '<h1>T</h1><p>a<strong>b</strong></p><blockquote><p>q</p></blockquote>',
    )
    expect(view.dom.getAttribute('role')).toBe('textbox')
    expect(view.dom.getAttribute('aria-multiline')).toBe('true')
    expect(view.dom.getAttribute('aria-label')).toBe('Testo')
    expect(view.dom.getAttribute('contenteditable')).toBe('true')
  })

  it('keeps empty blocks and trailing hard breaks visible', () => {
    const view = mount(doc(p(), p('a', br())))
    expect(view.dom.innerHTML).toBe(
      '<p><br class="scriba-trailing-break"></p><p>a<br><br class="scriba-trailing-break"></p>',
    )
  })

  it('keeps a trailing newline in code visible and reachable', () => {
    const view = mount(doc(pre('a\n')), 3)
    expect(view.dom.innerHTML).toBe('<pre><code>a\n<br class="scriba-trailing-break"></code></pre>')
    const { node, offset } = view.domAtPos(3)
    expect(view.posAtDOM(node, offset)).toBe(3)
  })

  it('reuses the DOM of unchanged blocks', () => {
    const view = mount(doc(p('a'), p('b'), p('c')), 8)
    const [first, second, third] = Array.from(view.dom.children)
    view.dispatch(view.state.tr.insertText('X'))
    const after = Array.from(view.dom.children)
    expect(after[0]).toBe(first)
    expect(after[1]).toBe(second)
    expect(after[2]).toBe(third) // same markup: updated in place
    expect(view.dom.innerHTML).toBe('<p>a</p><p>b</p><p>cX</p>')
    view.dispatch(view.state.tr.insert(3, schema.node('heading', { level: 2 })))
    expect(Array.from(view.dom.children)[0]).toBe(first)
    expect(view.dom.children[1]!.nodeName).toBe('H2')
  })

  it('never renders unsafe attributes', () => {
    const view = mount(doc(p(img('https://x.it/a.png'))))
    const image = view.dom.querySelector('img')!
    expect(image.getAttribute('src')).toBe('https://x.it/a.png')
    expect(image.getAttribute('contenteditable')).toBe('false')
  })
})

describe('positions', () => {
  it('maps every position to the DOM and back', () => {
    const d = doc(h(2, 'ab'), p('c', b('de'), 'f', img('x.png'), 'g'), quote(p('hi')), pre('j'))
    const view = mount(d)
    for (let pos = 0; pos <= d.content.size; pos++) {
      const $pos = d.resolve(pos)
      if (!$pos.parent.inlineContent) continue
      const { node, offset } = view.domAtPos(pos)
      expect(view.posAtDOM(node, offset), `pos ${pos}`).toBe(pos)
    }
  })
})

describe('input', () => {
  it('handles typing through beforeinput', () => {
    const view = mount(doc(p('ac')), 2)
    const event = beforeInput(view, 'insertText', 'b')
    expect(event.defaultPrevented).toBe(true)
    expect(view.state.doc.eq(doc(p('abc')))).toBe(true)
    expect(view.dom.innerHTML).toBe('<p>abc</p>')
    expect(view.state.selection.head).toBe(3)
  })

  it('handles Enter, Backspace and line breaks', () => {
    const view = mount(doc(p('ab')), 2)
    beforeInput(view, 'insertParagraph')
    expect(view.state.doc.eq(doc(p('a'), p('b')))).toBe(true)
    beforeInput(view, 'deleteContentBackward')
    expect(view.state.doc.eq(doc(p('ab')))).toBe(true)
    beforeInput(view, 'insertLineBreak')
    expect(view.state.doc.eq(doc(p('a', br(), 'b')))).toBe(true)
  })

  it('handles undo/redo input types', () => {
    const view = mount(doc(p('a')), 2)
    beforeInput(view, 'insertText', 'b')
    beforeInput(view, 'historyUndo')
    expect(view.state.doc.eq(doc(p('a')))).toBe(true)
    beforeInput(view, 'historyRedo')
    expect(view.state.doc.eq(doc(p('ab')))).toBe(true)
  })

  it('runs keymaps on keydown', () => {
    const view = mount(doc(p('abc')), 1, 3)
    const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, cancelable: true })
    view.dom.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(view.state.doc.eq(doc(p(b('ab'), 'c')))).toBe(true)
    expect(view.dom.innerHTML).toBe('<p><strong>ab</strong>c</p>')
  })

  it('ignores input when not editable', () => {
    const view = mount(doc(p('a')), 2)
    view.options.editable = () => false
    view.updateState(view.state)
    expect(view.dom.getAttribute('contenteditable')).toBe('false')
    expect(view.dom.getAttribute('aria-readonly')).toBe('true')
    const event = beforeInput(view, 'insertText', 'x')
    expect(event.defaultPrevented).toBe(true)
    expect(view.state.doc.eq(doc(p('a')))).toBe(true)
  })

  it('reads text the browser wrote by itself (IME, spellcheck) and restores canonical DOM', async () => {
    const view = mount(doc(p('a', b('b'))), 2)
    const text = view.dom.querySelector('p')!.firstChild as Text
    text.data = 'aXY'
    // foreign markup the browser might add
    const font = document.createElement('font')
    font.textContent = 'Z'
    view.dom.querySelector('p')!.appendChild(font)
    await tick()
    expect(view.state.doc.eq(doc(p('aXY', b('b'), 'Z')))).toBe(true)
    expect(view.dom.innerHTML).toBe('<p>aXY<strong>b</strong>Z</p>')
  })

  it('defers DOM reading until composition ends', async () => {
    const view = mount(doc(p('a')), 2)
    view.dom.dispatchEvent(new CompositionEvent('compositionstart'))
    const text = view.dom.querySelector('p')!.firstChild as Text
    text.data = 'aか'
    await tick()
    expect(view.state.doc.eq(doc(p('a')))).toBe(true)
    text.data = 'a漢'
    window.getSelection()!.setBaseAndExtent(text, 2, text, 2)
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { data: '漢' }))
    await tick()
    await tick()
    expect(view.state.doc.eq(doc(p('a漢')))).toBe(true)
  })

  it('text the browser wrote goes through handleTextInput only with the caret right after it', async () => {
    const seen: string[] = []
    const view = mount(doc(p('ab')), 3)
    view.updateState(
      view.state.reconfigure({
        plugins: [
          ...view.state.plugins,
          new Plugin({
            props: {
              handleTextInput: (_v: unknown, from: number, _to: number, text: string) => {
                seen.push(`${from}:${text}`)
                return false // not handled: the view reads it as usual
              },
            },
          }),
        ],
      }),
    )
    const text = view.dom.querySelector('p')!.firstChild as Text
    text.data = 'abc'
    window.getSelection()!.setBaseAndExtent(text, 3, text, 3)
    await tick()
    expect(seen).toEqual(['3:c'])
    expect(view.state.doc.eq(doc(p('abc')))).toBe(true)
    // caret elsewhere (the diff cannot tell where the text went): just read it
    const again = view.dom.querySelector('p')!.firstChild as Text
    again.data = 'abcd'
    window.getSelection()!.setBaseAndExtent(again, 0, again, 0)
    await tick()
    expect(seen).toEqual(['3:c'])
    expect(view.state.doc.eq(doc(p('abcd')))).toBe(true)
  })

  it('a composition starting right after another one is not interrupted', async () => {
    const view = mount(doc(p('a')), 2)
    const text = view.dom.querySelector('p')!.firstChild as Text
    view.dom.dispatchEvent(new CompositionEvent('compositionstart'))
    text.data = 'a '
    window.getSelection()!.setBaseAndExtent(text, 2, text, 2)
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { data: ' ' }))
    // the next one starts before the first end is processed
    view.dom.dispatchEvent(new CompositionEvent('compositionstart'))
    text.data = 'a @'
    await tick()
    await tick()
    expect(view.composing).toBe(true)
    expect(view.state.doc.eq(doc(p('a')))).toBe(true) // nothing read mid-composition
    expect(view.dom.querySelector('p')!.firstChild).toBe(text) // DOM left to the IME
    window.getSelection()!.setBaseAndExtent(text, 3, text, 3)
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { data: '@' }))
    await tick()
    await tick()
    expect(view.composing).toBe(false)
    expect(view.state.doc.eq(doc(p('a @')))).toBe(true)
  })

  it('applies stored marks to composed text', async () => {
    const view = mount(doc(p('a')), 2)
    view.dispatch(view.state.tr.addStoredMark(schema.mark('bold')))
    view.dom.dispatchEvent(new CompositionEvent('compositionstart'))
    const text = view.dom.querySelector('p')!.firstChild as Text
    text.data = 'aé'
    window.getSelection()!.setBaseAndExtent(text, 2, text, 2)
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { data: 'é' }))
    await tick()
    await tick()
    expect(view.state.doc.eq(doc(p('a', b('é'))))).toBe(true)
    expect(view.dom.innerHTML).toBe('<p>a<strong>é</strong></p>')
  })

  it('keeps marks when the browser types inside a mark element', async () => {
    const view = mount(doc(p(b('ab'))), 2)
    const text = view.dom.querySelector('strong')!.firstChild as Text
    text.data = 'aXb'
    await tick()
    expect(view.state.doc.eq(doc(p(b('aXb'))))).toBe(true)
  })

  it('reverts structural DOM changes it does not understand', async () => {
    const view = mount(doc(p('a'), p('b')))
    view.dom.appendChild(document.createElement('div')).textContent = 'junk'
    await tick()
    expect(view.dom.innerHTML).toBe('<p>a</p><p>b</p>')
  })
})

describe('selection', () => {
  it('writes the model selection to the DOM and reads it back', () => {
    const view = mount(doc(p('abc'), p('de')))
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 7)))
    const domSel = window.getSelection()!
    expect(view.posAtDOM(domSel.anchorNode!, domSel.anchorOffset)).toBe(2)
    expect(view.posAtDOM(domSel.focusNode!, domSel.focusOffset)).toBe(7)
    const text = view.dom.querySelectorAll('p')[1]!.firstChild!
    domSel.setBaseAndExtent(text, 1, text, 1)
    view.syncSelectionFromDOM()
    expect(view.state.selection.head).toBe(7)
  })

  it('focus by click keeps the clicked caret; keyboard focus restores the model selection', () => {
    const view = mount(doc(p('abc'), p('de')))
    view.dom.blur()
    const domSel = window.getSelection()!
    const text = view.dom.querySelectorAll('p')[1]!.firstChild!
    // Firefox order: mousedown, the browser places the caret, then focus
    view.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    domSel.setBaseAndExtent(text, 1, text, 1)
    view.dom.dispatchEvent(new FocusEvent('focus'))
    view.document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    expect(view.posAtDOM(domSel.focusNode!, domSel.focusOffset)).toBe(7)
    // keyboard (Tab): the model selection comes back
    domSel.removeAllRanges()
    view.dom.dispatchEvent(new FocusEvent('focus'))
    expect(domSel.rangeCount).toBe(1)
  })
})
