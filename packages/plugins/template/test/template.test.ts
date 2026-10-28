// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import {
  AllSelection,
  EditorState,
  Fragment,
  Schema,
  TextSelection,
  basicSchemaSpec,
  history,
  parseHTML,
  serializeHTML,
  undo,
} from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import { linkMarks } from '../../link/src/index.js'
import { listNodes } from '../../list/src/index.js'
import {
  MAX_TEMPLATE_LENGTH,
  defaultTemplateValues,
  fillPlaceholders,
  insertTemplate,
  openTemplateDialog,
  parseTemplate,
  templateToolbarItem,
  type Template,
  type TemplateOptions,
} from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...listNodes },
  marks: { ...basicSchemaSpec.marks, ...linkMarks },
})
const t = createTranslator('it')
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const html = (state: EditorState) => serializeHTML(state.doc)
const template = (source: string, values?: Record<string, string>) =>
  serializeHTML(parseTemplate(schema, source, values))

function run(state: EditorState, content: Fragment): EditorState {
  let next = state
  insertTemplate(content)(state, (tr) => (next = state.apply(tr)))
  return next
}

describe('placeholders', () => {
  it('fills the known ones, keeps the others as they are', () => {
    const values = { name: 'Anna', count: () => '3' }
    expect(fillPlaceholders('Ciao {{name}}, {{ count }} messaggi {{other}}', values)).toBe(
      'Ciao Anna, 3 messaggi {{other}}',
    )
  })

  it('never reads inherited properties', () => {
    expect(fillPlaceholders('{{constructor}} {{toString}} {{__proto__}}', {})).toBe(
      '{{constructor}} {{toString}} {{__proto__}}',
    )
  })

  it('has date and time built in, in the given locale', () => {
    const values = defaultTemplateValues('it-IT')
    const today = new Date().toLocaleDateString('it-IT', { dateStyle: 'long' })
    expect(fillPlaceholders('{{date}}', values)).toBe(today)
    expect(fillPlaceholders('{{time}}', values)).toMatch(/^\d{1,2}[.:]\d{2}$/)
  })
})

describe('parseTemplate', () => {
  it('parses the HTML through the schema and fills the placeholders', () => {
    expect(template('<h2>Verbale</h2><p>Per <b>{{who}}</b></p>', { who: 'Ditta' })).toBe(
      '<h2>Verbale</h2><p>Per <strong>Ditta</strong></p>',
    )
  })

  it('inserts values as text: markup in a value stays text', () => {
    expect(template('<p>{{x}}</p>', { x: '<img src=x onerror=alert(1)><b>y</b>' })).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt;&lt;b&gt;y&lt;/b&gt;</p>',
    )
  })

  it('leaves attributes alone: a placeholder cannot build a URL', () => {
    expect(
      template('<p><a href="{{url}}">x</a></p>', { url: 'javascript:alert(1)' }),
    ).not.toContain('javascript')
  })

  it('drops what the schema does not allow (untrusted HTML)', () => {
    const out = template(
      '<p onclick="alert(1)">a<script>alert(1)</script><img src=x onerror=alert(1)></p>' +
        '<p><a href="javascript:alert(1)">b</a></p><style>p{}</style><iframe src="https://x.it"></iframe>',
    )
    expect(out).toBe('<p>a</p><p>b</p>')
  })

  it('refuses templates that are too long', () => {
    expect(() => parseTemplate(schema, 'x'.repeat(MAX_TEMPLATE_LENGTH + 1))).toThrow(RangeError)
  })
})

describe('insertTemplate', () => {
  const content = parseTemplate(schema, '<h2>Titolo</h2><p>Testo</p>').content

  it('replaces a blank document', () => {
    const state = EditorState.create({ schema })
    expect(html(run(state, content))).toBe('<h2>Titolo</h2><p>Testo</p>')
  })

  it('replaces everything when everything is selected', () => {
    const doc = parse('<p>vecchio</p><p>testo</p>')
    const state = EditorState.create({ doc, selection: new AllSelection(doc) })
    expect(html(run(state, content))).toBe('<h2>Titolo</h2><p>Testo</p>')
  })

  it('inserts at the cursor, splitting the paragraph, as one undo step', () => {
    const doc = parse('<p>primadopo</p>')
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6),
      plugins: [history()],
    })
    state = run(state, content)
    expect(html(state)).toBe('<p>prima</p><h2>Titolo</h2><p>Testo</p><p>dopo</p>')
    undo(state, (tr) => (state = state.apply(tr)))
    expect(html(state)).toBe('<p>primadopo</p>')
  })

  it('keeps whole blocks at the start or end of a paragraph, replaces an empty one', () => {
    const doc = parse('<p>uno</p><p></p>')
    const at = (pos: number) =>
      html(run(EditorState.create({ doc, selection: TextSelection.create(doc, pos) }), content))
    expect(at(1)).toBe('<h2>Titolo</h2><p>Testo</p><p>uno</p><p></p>')
    expect(at(4)).toBe('<p>uno</p><h2>Titolo</h2><p>Testo</p><p></p>')
    expect(at(6)).toBe('<p>uno</p><h2>Titolo</h2><p>Testo</p>')
  })

  it('replaces the selected text', () => {
    const doc = parse('<p>uno due tre</p>')
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 5, 8) })
    expect(html(run(state, content))).toBe('<p>uno </p><h2>Titolo</h2><p>Testo</p><p> tre</p>')
  })

  it('inside a list item: the blocks go in the item', () => {
    const doc = parse('<ul><li><p>uno</p></li></ul>')
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 6) })
    expect(html(run(state, parseTemplate(schema, '<p>due</p>').content))).toBe(
      '<ul><li><p>uno</p><p>due</p></li></ul>',
    )
  })

  it('does nothing with an empty template', () => {
    const state = EditorState.create({ schema })
    expect(insertTemplate(Fragment.empty)(state)).toBe(false)
  })
})

describe('template dialog', () => {
  beforeAll(() => {
    // jsdom has no modal dialogs: enough of showModal/close for these tests
    const proto = HTMLDialogElement.prototype as unknown as {
      showModal(this: HTMLDialogElement): void
      close(this: HTMLDialogElement): void
    }
    proto.showModal ??= function () {
      this.open = true
    }
    proto.close ??= function () {
      this.open = false
    }
  })

  const TEMPLATES: Template[] = [
    { title: 'Verbale', description: 'Riunione', content: '<h2>Verbale {{who}}</h2>' },
    { title: 'Lettera', content: () => Promise.resolve('<p>Gentile cliente,</p>') },
    { title: 'Rotto', content: () => Promise.reject(new Error('offline')) },
  ]

  function mount(options: TemplateOptions, source = '<p>testo</p>', editable = true) {
    const place = document.createElement('div')
    document.body.replaceChildren(place)
    const doc = parse(source)
    const view = new EditorView(place, {
      state: EditorState.create({ doc, selection: TextSelection.create(doc, 1) }),
      editable: () => editable,
    })
    const handle = openTemplateDialog(view, t, options)
    const dialog = handle.dialog
    const radio = (name: string) =>
      [...dialog.querySelectorAll('label')]
        .find((l) => l.textContent === name)!
        .querySelector('input')!
    const choose = (name: string) => {
      const r = radio(name)
      r.checked = true
      r.dispatchEvent(new Event('change'))
    }
    const insert = () =>
      [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Inserisci')!
    const preview = () => dialog.querySelector('.scriba-template-preview')!
    const status = () => dialog.querySelector('[role="status"]')!.textContent
    const error = () => dialog.querySelector('[role="alert"]')!.textContent
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
    return { view, handle, dialog, radio, choose, insert, preview, status, error, settle }
  }

  it('lists the templates, previews the first one and inserts it', async () => {
    const m = mount({ templates: TEMPLATES, values: { who: 'Ditta' } })
    expect(m.dialog.querySelector('legend')!.textContent).toBe('Modelli')
    expect(m.radio('Verbale').checked).toBe(true)
    expect(document.activeElement).toBe(m.radio('Verbale'))
    expect(m.dialog.textContent).toContain('Riunione')
    await m.settle()
    const editable = m.preview().querySelector('[contenteditable]')!
    expect(editable.getAttribute('contenteditable')).toBe('false')
    expect(editable.getAttribute('aria-label')).toBe('Anteprima del modello')
    expect(editable.textContent).toBe('Verbale Ditta')
    expect(m.insert().disabled).toBe(false)
    m.dialog.querySelector('form')!.requestSubmit()
    expect(m.dialog.isConnected).toBe(false)
    expect(serializeHTML(m.view.state.doc)).toBe('<h2>Verbale Ditta</h2><p>testo</p>')
    expect(document.activeElement).toBe(m.view.dom)
    m.view.destroy()
  })

  it('loads a template when chosen; a failure is shown and blocks Insert', async () => {
    const m = mount({ templates: TEMPLATES })
    m.choose('Lettera')
    expect(m.status()).toBe('Caricamento…')
    expect(m.insert().disabled).toBe(true)
    await m.settle()
    expect(m.status()).toBe('')
    expect(m.preview().textContent).toBe('Gentile cliente,')
    m.choose('Rotto')
    await m.settle()
    expect(m.error()).toBe('Impossibile caricare il modello «Rotto».')
    expect(m.preview().textContent).toBe('')
    expect(m.insert().disabled).toBe(true)
    m.handle.close()
    m.view.destroy()
  })

  it('ignores a slow answer for a template no longer selected', async () => {
    let resolveSlow: (html: string) => void = () => {}
    const slow: Template = {
      title: 'Lento',
      content: () => new Promise<string>((resolve) => (resolveSlow = resolve)),
    }
    const m = mount({ templates: [slow, { title: 'Veloce', content: '<p>veloce</p>' }] })
    m.choose('Veloce')
    await m.settle()
    resolveSlow('<p>lento</p>')
    await m.settle()
    expect(m.preview().textContent).toBe('veloce')
    m.handle.close()
    m.view.destroy()
  })

  it('loads the list when it is a function, and reports a failure', async () => {
    const m = mount({ templates: () => Promise.resolve([TEMPLATES[0]!]) })
    expect(m.status()).toBe('Caricamento…')
    await m.settle()
    expect(m.radio('Verbale').checked).toBe(true)
    expect(document.activeElement).toBe(m.radio('Verbale'))
    m.handle.close()

    const failed = mount({ templates: () => Promise.reject(new Error('offline')) })
    await failed.settle()
    expect(failed.error()).toBe('Impossibile caricare i modelli.')
    expect(failed.dialog.querySelector('fieldset')!.hidden).toBe(true)
    failed.handle.close()

    const empty = mount({ templates: [] })
    expect(empty.status()).toBe('Nessun modello disponibile.')
    empty.handle.close()
    empty.view.destroy()
  })

  it('read-only: previews, but nothing can be inserted', async () => {
    const m = mount({ templates: TEMPLATES }, '<p>testo</p>', false)
    await m.settle()
    expect(m.preview().textContent).toBe('Verbale {{who}}')
    expect(m.insert().disabled).toBe(true)
    m.dialog.querySelector('form')!.requestSubmit()
    expect(serializeHTML(m.view.state.doc)).toBe('<p>testo</p>')
    m.handle.close()
    m.view.destroy()
  })

  it('closing gives the focus back to the editor and frees the preview', async () => {
    const m = mount({ templates: TEMPLATES })
    await m.settle()
    const previewEditor = m.preview().querySelector('[contenteditable]')!
    m.handle.close()
    expect(document.activeElement).toBe(m.view.dom)
    expect(previewEditor.isConnected).toBe(false)
    m.view.destroy()
  })

  it('toolbar item', () => {
    const item = templateToolbarItem(t, { templates: TEMPLATES })
    expect(item.label(t)).toBe('Modello…')
    expect(item.icon).toBe('template')
    expect(item.readOnly).toBeUndefined()
  })
})
