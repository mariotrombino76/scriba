// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, serializeHTML } from '@scriba-editor/core'
import { linkMarks } from '@scriba-editor/plugin-link'
import { imageNodes } from '@scriba-editor/plugin-image'
import { readDocument } from '../src/index.js'

/** Opened files are untrusted input (CLAUDE.md §5.2): Word files too. */
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...imageNodes },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})

async function hostileWord(): Promise<Blob & { name: string }> {
  const docx = await import('docx')
  const svg = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  )
  const png = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    ),
    (c) => c.charCodeAt(0),
  )
  const file = new docx.Document({
    sections: [
      {
        children: [
          new docx.Paragraph({
            children: [
              new docx.ExternalHyperlink({
                link: 'javascript:alert(1)',
                children: [new docx.TextRun('cliccami')],
              }),
              new docx.TextRun(' <img src=x onerror=alert(1)> '),
              new docx.ExternalHyperlink({
                link: 'https://example.com/ok',
                children: [new docx.TextRun('sicuro')],
              }),
            ],
          }),
          new docx.Paragraph({
            children: [
              new docx.ImageRun({
                type: 'svg',
                data: svg,
                fallback: { type: 'png', data: png },
                transformation: { width: 10, height: 10 },
              }),
            ],
          }),
        ],
      },
    ],
  })
  return Object.assign(await docx.Packer.toBlob(file), { name: 'ostile.docx' })
}

describe('opening hostile files', () => {
  it('a Word file: no script, no javascript: link, no SVG image; text stays text', async () => {
    const out = serializeHTML(await readDocument(schema, await hostileWord()))
    // no handlers in tags (the escaped text may show "onerror=" as text)
    expect(out).not.toMatch(/javascript:|<script|<svg|image\/svg|<[^>]*\son\w+=/i)
    expect(out).toContain('cliccami') // the text of the refused link stays
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(out).toContain('<a href="https://example.com/ok">sicuro</a>')
  }, 20_000)

  it('an HTML file with mutation-XSS and data: payloads', async () => {
    const page = Object.assign(
      new Blob([
        '<p><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="x"></p>',
        '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
        '<p><a href=" JaVaScRiPt:alert(1)">a</a><a href="data:text/html,<script>">b</a></p>',
      ]),
      { name: 'ostile.html' },
    )
    const out = serializeHTML(await readDocument(schema, page))
    expect(out).not.toMatch(/javascript:|<script|image\/svg|data:text|<[^>]*\son\w+=/i)
  })
})
