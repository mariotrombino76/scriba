// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  HTMLLimitError,
  Schema,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
} from '@scriba-editor/core'
import type { EditorView } from '@scriba-editor/view'
import { documentSource, parseSource } from '../src/index.js'

const schema = new Schema(basicSchemaSpec)
const doc = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const view = { state: EditorState.create({ schema }) } as unknown as EditorView

describe('source view', () => {
  it('shows one top-level block per line, from the serializer', () => {
    expect(documentSource(doc('<h1>T</h1><p>a <b>b</b></p><p>c</p>'))).toBe(
      '<h1>T</h1>\n<p>a <strong>b</strong></p>\n<p>c</p>',
    )
  })

  it('round-trips: the source parses back to the same document', () => {
    const d = doc('<h2>Titolo</h2><p>uno<br>due</p><pre><code>  x\n y</code></pre>')
    expect(parseSource(view, documentSource(d)).eq(d)).toBe(true)
  })

  it('edited HTML goes through the schema parser (scripts, handlers, bad URLs removed)', () => {
    const parsed = parseSource(
      view,
      '<p onclick="alert(1)">ok<img src=x onerror=alert(1)><script>alert(1)</script></p><style>p{}</style>',
    )
    expect(serializeHTML(parsed)).toBe('<p>ok</p>')
  })

  it('refuses sources that are too long or too deeply nested', () => {
    expect(() => parseSource(view, 'x'.repeat(20), { maxLength: 10 })).toThrow(HTMLLimitError)
    expect(() => parseSource(view, '<div>'.repeat(300) + 'x')).toThrow(HTMLLimitError) // depth > 256
  })
})
