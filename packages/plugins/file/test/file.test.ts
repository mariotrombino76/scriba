// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba/core'
import { listNodes } from '@scriba/plugin-list'
import { blockquoteNodes } from '@scriba/plugin-blockquote'
import { linkMarks } from '@scriba/plugin-link'
import { tableNodes } from '@scriba/plugin-table'
import {
  OpenFileError,
  documentBlob,
  documentTitle,
  documentToHTMLFile,
  documentToText,
  fileName,
  filePlugin,
  formatOf,
  hasUnsavedChanges,
  readDocument,
} from '../src/index.js'
import { createTranslator } from '@scriba/i18n'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...listNodes, ...blockquoteNodes, ...tableNodes },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const file = (parts: BlobPart[], name: string) => Object.assign(new Blob(parts), { name })
const html = (doc: Parameters<typeof serializeHTML>[0]) => serializeHTML(doc)

describe('opening files', () => {
  it('knows formats by extension only', () => {
    expect(formatOf('Verbale.DOCX')).toBe('docx')
    expect(formatOf('a.htm')).toBe('html')
    expect(formatOf('note.markdown')).toBe('markdown')
    expect(formatOf('x.txt')).toBe('text')
    expect(formatOf('x.pdf')).toBeNull()
    expect(formatOf('docx')).toBeNull()
  })

  it('HTML is untrusted: it goes through the schema like a paste', async () => {
    const doc = await readDocument(
      schema,
      file(
        [
          '<html><head><script>alert(1)</script><style>p{}</style></head><body>',
          '<h1 onclick="x">Titolo</h1><p>a <b>b</b><img src=x onerror=alert(1)>',
          '<a href="javascript:alert(1)">link</a></p><iframe src="https://evil"></iframe></body></html>',
        ],
        'pagina.html',
      ),
    )
    expect(html(doc)).toBe('<h1>Titolo</h1><p>a <strong>b</strong>link</p>')
  })

  it('Markdown and plain text', async () => {
    expect(html(await readDocument(schema, file(['# T\n\n- uno\n- **due**'], 'n.md')))).toBe(
      '<h1>T</h1><ul><li><p>uno</p></li><li><p><strong>due</strong></p></li></ul>',
    )
    expect(html(await readDocument(schema, file(['uno\r\n\r\n<b>due</b>'], 'n.txt')))).toBe(
      '<p>uno</p><p></p><p>&lt;b&gt;due&lt;/b&gt;</p>',
    )
  })

  it('refuses unknown types, large files, damaged or too large Word files', async () => {
    const reason = (p: Promise<unknown>) =>
      p.then(
        () => 'ok',
        (e: unknown) => (e instanceof OpenFileError ? e.reason : String(e)),
      )
    expect(await reason(readDocument(schema, file(['%PDF'], 'a.pdf')))).toBe('type')
    expect(
      await reason(readDocument(schema, file(['x'.repeat(50)], 'a.txt'), { maxFileBytes: 10 })),
    ).toBe('size')
    expect(await reason(readDocument(schema, file(['not a zip'], 'a.docx')))).toBe('damaged')
    const word = await documentBlob(parse('<p>ciao</p>'), 'docx', 'T')
    const named = Object.assign(word, { name: 'w.docx' })
    expect(await reason(readDocument(schema, named, { maxUnzippedBytes: 100 }))).toBe('tooComplex')
  }, 20_000)
})

describe('saving files', () => {
  const DOC = parse(
    '<h1>Verbale 3/10</h1><p>Testo <strong>forte</strong>, <em>corsivo</em> e <a href="https://x.it">link</a>.</p>' +
      '<ul><li><p>uno</p></li><li><p>due</p></li></ul><ol><li><p>primo</p></li></ol>' +
      '<blockquote><p>citazione</p></blockquote>' +
      '<table><tr><td><p>A</p></td><td><p>B</p></td></tr></table>',
  )

  it('title and file name', () => {
    expect(documentTitle(DOC, 'Documento')).toBe('Verbale 3/10')
    expect(documentTitle(parse('<p></p>'), 'Documento')).toBe('Documento')
    expect(fileName('Verbale 3/10', 'docx')).toBe('Verbale 3-10.docx')
    expect(fileName('<script>:', 'html')).toBe('-script-.html')
  })

  it('HTML page: from the serializer, title escaped', () => {
    const page = documentToHTMLFile(parse('<p>x</p>'), '</title><script>alert(1)</script>', 'it"x')
    expect(page).toContain('<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>')
    expect(page).toContain('<html lang="it&#34;x">')
    expect(page).toContain('<body>\n<p>x</p>\n</body>')
  })

  it('plain text: one block per paragraph', () => {
    expect(documentToText(parse('<h1>T</h1><p>a</p><ul><li><p>b</p></li></ul>'))).toBe(
      'T\n\na\n\nb\n',
    )
  })

  it('Word round trip: what we write, mammoth reads back with its structure', async () => {
    const blob = await documentBlob(DOC, 'docx', 'Verbale')
    const back = await readDocument(schema, Object.assign(blob, { name: 'v.docx' }))
    const out = html(back)
    expect(out).toContain('<h1>Verbale 3/10</h1>')
    expect(out).toContain('<strong>forte</strong>')
    expect(out).toContain('<em>corsivo</em>')
    expect(out).toContain('<a href="https://x.it">link</a>')
    expect(out).toContain('<ul><li><p>uno</p></li><li><p>due</p></li></ul>')
    expect(out).toContain('<ol><li><p>primo</p></li></ol>')
    expect(out).toMatch(/<table>.*A.*B.*<\/table>/)
  }, 20_000)
})

describe('unsaved changes', () => {
  it('a change makes the document unsaved; saving (meta) clears it', () => {
    let state = EditorState.create({
      schema,
      doc: parse('<p>a</p>'),
      plugins: [filePlugin({ t: createTranslator('it') })],
    })
    expect(hasUnsavedChanges(state)).toBe(false)
    state = state.apply(state.tr.insertText('b', 2))
    expect(hasUnsavedChanges(state)).toBe(true)
    state = state.apply(state.tr.insertText('', 2).delete(2, 3))
    expect(hasUnsavedChanges(state)).toBe(false) // back to the saved text
    state = state.apply(state.tr.insertText('c', 2))
    state = state.apply(state.tr.setMeta('scribaFileSaved', true))
    expect(hasUnsavedChanges(state)).toBe(false)
  })
})
