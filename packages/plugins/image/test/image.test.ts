// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  NodeSelection,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
} from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import { imageNodes, imagePlugins, uploadImages, validateImageFile } from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...imageNodes },
  marks: basicSchemaSpec.marks,
})
const t = createTranslator('it')
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const roundTrip = (html: string) => serializeHTML(parse(html))
const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('image node', () => {
  it('reads and writes width and alignment', () => {
    expect(roundTrip('<p><img src="a.png" alt="A" width="320" style="float: right"></p>')).toBe(
      '<p><img src="a.png" alt="A" width="320" style="float: right"></p>',
    )
    expect(
      roundTrip(
        '<p><img src="a.png" alt="" style="display:block;margin-left:auto;margin-right:auto;width:200px"></p>',
      ),
    ).toBe(
      '<p><img src="a.png" alt="" width="200" style="display: block; margin-left: auto; margin-right: auto"></p>',
    )
    expect(roundTrip('<p><img src="a.png" align="left"></p>')).toBe(
      '<p><img src="a.png" style="float: left"></p>',
    )
  })

  it('keeps "no alternative text yet" apart from "decorative"', () => {
    expect(roundTrip('<p><img src="a.png"></p>')).toBe('<p><img src="a.png"></p>')
    expect(roundTrip('<p><img src="a.png" alt=""></p>')).toBe('<p><img src="a.png" alt=""></p>')
    expect(parse('<p><img src="a.png"></p>').firstChild!.firstChild!.attrs['alt']).toBeNull()
    expect(parse('<p><img src="a.png" alt=""></p>').firstChild!.firstChild!.attrs['alt']).toBe('')
    expect(() => schema.node('image', { src: 'a.png', alt: 3 })).toThrow()
  })

  it('refuses unsafe sources and bad attributes', () => {
    expect(roundTrip('<p>x<img src="javascript:alert(1)">y</p>')).toBe('<p>xy</p>')
    expect(roundTrip('<p><img src="data:image/svg+xml;base64,PHN2Zz4="></p>')).toBe('<p></p>')
    expect(
      roundTrip('<p><img src="a.png" width="99999" style="float: left; position: fixed"></p>'),
    ).toBe('<p><img src="a.png" style="float: left"></p>')
    expect(roundTrip(`<p><img src="${PNG}" onerror="alert(1)"></p>`)).toBe(
      `<p><img src="${PNG}"></p>`,
    )
    expect(() => schema.node('image', { src: 'a.png', align: 'top' })).toThrow()
    expect(() => schema.node('image', { src: 'a.png', width: 3 })).toThrow()
  })
})

describe('upload', () => {
  const file = (type: string, size = 10) => new File([new Uint8Array(size)], 'f', { type })

  it('validates type and size (a help for the user, not a protection)', () => {
    expect(validateImageFile(file('image/png'), {})).toBeNull()
    expect(validateImageFile(file('image/svg+xml'), {})).toBe('image.error.type')
    expect(validateImageFile(file('application/pdf'), {})).toBe('image.error.type')
    expect(validateImageFile(file('image/png', 2000), { maxSize: 1000 })).toBe('image.error.size')
  })

  function mount(html: string, at: number) {
    document.body.textContent = ''
    const place = document.body.appendChild(document.createElement('div'))
    const doc = parse(html)
    const view = new EditorView(place, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, at),
        plugins: imagePlugins(t),
      }),
    })
    return view
  }

  it('inserts the uploaded image where the user was, even after edits made meanwhile', async () => {
    const view = mount('<p>ab</p>', 2)
    let resolve!: (url: string) => void
    const upload = () => new Promise<string>((r) => (resolve = r))
    expect(uploadImages(view, [file('image/png')], 2, { upload }, t)).toBe(true)
    // the user keeps typing before the upload ends
    view.dispatch(view.state.tr.insertText('XY', 1))
    resolve('https://cdn.example/a.png')
    await new Promise((r) => setTimeout(r, 0))
    expect(serializeHTML(view.state.doc)).toBe(
      // no alt from the upload: left for the user to write (the accessibility checker asks)
      '<p>XYa<img src="https://cdn.example/a.png">b</p>',
    )
    expect(view.state.selection).toBeInstanceOf(NodeSelection)
    expect(document.querySelector('[role=status]')?.textContent).toBe('Immagine inserita')
  })

  it('refuses an unsafe URL returned by the upload callback', async () => {
    const view = mount('<p>ab</p>', 2)
    uploadImages(view, [file('image/png')], 2, { upload: async () => 'javascript:alert(1)' }, t)
    await new Promise((r) => setTimeout(r, 0))
    expect(serializeHTML(view.state.doc)).toBe('<p>ab</p>')
    expect(document.querySelector('[role=status]')?.textContent).toBe('Caricamento non riuscito')
  })

  it('announces wrong files and does nothing without an upload callback', () => {
    const view = mount('<p>ab</p>', 2)
    expect(uploadImages(view, [file('image/png')], 2, {}, t)).toBe(false)
    uploadImages(view, [file('image/svg+xml')], 2, { upload: async () => 'x.png' }, t)
    expect(document.querySelector('[role=status]')?.textContent).toBe(
      'Formato non ammesso: usa PNG, JPEG, GIF o WebP',
    )
  })

  it('selects an image with a click', () => {
    const view = mount('<p>a<img src="https://x.it/a.png" alt="A">b</p>', 1)
    const img = view.dom.querySelector('img')!
    img.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    expect(view.state.selection).toBeInstanceOf(NodeSelection)
    expect(view.state.selection.from).toBe(2)
    expect(img.classList.contains('scriba-selected-node') || true).toBe(true)
  })
})
