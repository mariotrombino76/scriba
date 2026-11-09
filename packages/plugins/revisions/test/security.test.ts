// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, serializeHTML } from '@scriba/core'
import { imageNodes } from '../../image/src/index.js'
import { linkMarks } from '../../link/src/index.js'
import { MAX_REVISION_LENGTH, parseRevision } from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...imageNodes },
  marks: { ...basicSchemaSpec.marks, ...linkMarks },
})

describe('version content is untrusted', () => {
  it('goes through the schema parser: scripts, handlers and bad URLs are dropped', () => {
    const doc = parseRevision(
      schema,
      '<p onclick="x()">ciao<script>alert(1)</script> <a href="javascript:alert(1)">link</a>' +
        '<img src="x" onerror="alert(1)" alt="i"> <img src="data:image/svg+xml;base64,PHN2Zz4=" alt="s"></p>' +
        '<iframe src="https://evil.example"></iframe><style>*{}</style>',
    )
    const html = serializeHTML(doc)
    expect(html).not.toMatch(/script|onclick|onerror|javascript:|svg|iframe|style>/i)
    expect(html).toContain('ciao')
  })

  it('validates JSON against the schema', () => {
    expect(() => parseRevision(schema, { type: 'doc', content: [{ type: 'script' }] })).toThrow()
    expect(() =>
      parseRevision(schema, {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'image', attrs: { src: 'javascript:alert(1)' } }],
          },
        ],
      }),
    ).toThrow()
    // a fragment, not a document
    expect(() => parseRevision(schema, { type: 'paragraph' })).toThrow()
    const ok = parseRevision(schema, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ok' }] }],
    })
    expect(serializeHTML(ok)).toBe('<p>ok</p>')
  })

  it('refuses a version too long instead of cutting it', () => {
    expect(() => parseRevision(schema, 'x'.repeat(MAX_REVISION_LENGTH + 1))).toThrow(RangeError)
  })

  it('never runs anything while parsing (inert document)', () => {
    const w = window as unknown as { hit?: boolean }
    parseRevision(schema, '<img src="x" onerror="window.hit = true">')
    expect(w.hit).toBeUndefined()
  })
})
