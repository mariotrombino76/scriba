// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditor, core } from '../src/index.js'

afterEach(() => {
  document.body.textContent = ''
})

const host = () => {
  const el = document.createElement('div')
  el.id = 'editor'
  document.body.append(el)
  return el
}
const type = (el: HTMLElement, text: string) =>
  el.dispatchEvent(
    new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: text,
      bubbles: true,
      cancelable: true,
    }),
  )

describe('Scriba.createEditor', () => {
  it('full preset: toolbar and editor in the target (element or selector); content through the schema', () => {
    host()
    const editor = createEditor('#editor', {
      content:
        '<h2>T</h2><table><tr><td>a</td></tr></table><p onclick="x">b<script>alert(1)</script></p>',
    })
    expect(editor.element.parentElement!.id).toBe('editor')
    expect(editor.element.querySelector('scriba-toolbar')).not.toBeNull()
    expect(editor.view.dom.getAttribute('aria-label')).toBe('Editor di testo formattato')
    expect(editor.getContent()).toBe(
      '<h2>T</h2><table><tbody><tr><td><p>a</p></td></tr></tbody></table><p>b</p>',
    )
  })

  it('full preset: "Template…" only when templates are given', () => {
    const item = (editor: { element: HTMLElement }) =>
      editor.element.querySelector('[data-item="template"]')
    expect(item(createEditor(host()))).toBeNull()
    document.body.textContent = ''
    const editor = createEditor(host(), {
      templates: { templates: [{ title: 'Lettera', content: '<p>Gentile cliente,</p>' }] },
    })
    expect(item(editor)?.getAttribute('aria-label')).toBe('Modello…')
  })

  it('every built-in language by name: it, en, fr, de, es (with region)', () => {
    const label = (locale: string) =>
      createEditor(host(), { locale }).view.dom.getAttribute('aria-label')
    expect(label('de')).toBe('Rich-Text-Editor')
    expect(label('fr-CA')).toBe('Éditeur de texte enrichi')
    expect(label('es')).toBe('Editor de texto enriquecido')
    expect(label('en')).toBe('Rich text editor')
  })

  it('basic preset: only the basic schema (a table becomes text)', () => {
    const editor = createEditor(host(), {
      preset: 'basic',
      toolbar: false,
      content: '<table><tr><td>a</td></tr></table>',
    })
    expect(editor.element.querySelector('scriba-toolbar')).toBeNull()
    expect(editor.getContent()).toBe('<p>a</p>')
  })

  it('onChange after typing; setContent does not call it and is not undoable', () => {
    const onChange = vi.fn()
    const editor = createEditor(host(), { content: '<p>a</p>', onChange })
    editor.view.dispatch(
      editor.view.state.tr.setSelection(core.TextSelection.create(editor.view.state.doc, 2)),
    )
    type(editor.view.dom, 'b')
    expect(onChange).toHaveBeenLastCalledWith('<p>ab</p>')
    editor.setContent('<p>nuovo <img src=x onerror=alert(1)></p>')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(editor.getContent()).toBe('<p>nuovo <img src="x"></p>')
  })

  it('JSON format, read-only, destroy', () => {
    const editor = createEditor(host(), {
      format: 'json',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'j' }] }],
      },
    })
    expect(editor.getContent()).toMatchObject({ type: 'doc' })
    editor.setEditable(false)
    expect(editor.view.dom.getAttribute('aria-readonly')).toBe('true')
    editor.destroy()
    expect(document.querySelector('.scriba')).toBeNull()
  })

  it('an unknown target is an error', () => {
    expect(() => createEditor('#nessuno')).toThrow(/no element/)
  })
})
