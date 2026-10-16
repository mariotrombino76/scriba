// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
} from '@scriba/core'
import { serializeMarkdown } from '@scriba/plugin-markdown'
import { calloutNodes, toggleCallout } from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...calloutNodes },
  marks: basicSchemaSpec.marks,
})
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const BOX = '<aside class="scriba-callout" data-callout="warning"><p>Attenzione</p></aside>'

describe('callout node', () => {
  it('round trip through HTML', () => {
    expect(serializeHTML(parse(BOX))).toBe(BOX)
  })

  it('unknown kinds become "info"; a plain <aside> is not a callout', () => {
    expect(serializeHTML(parse('<aside data-callout="javascript:x" onclick="y">a</aside>'))).toBe(
      '<aside class="scriba-callout" data-callout="info"><p>a</p></aside>',
    )
    expect(serializeHTML(parse('<aside>dal web</aside>'))).toBe('<p>dal web</p>')
  })

  it('Markdown keeps the content', () => {
    expect(serializeMarkdown(parse(BOX))).toBe('Attenzione\n')
  })
})

describe('toggleCallout', () => {
  const run = (html: string, from: number, to = from) => {
    const doc = parse(html)
    let state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, from, to) })
    toggleCallout(schema, 'tip')(state, (tr) => (state = state.apply(tr)))
    return serializeHTML(state.doc)
  }

  it('wraps the selected blocks, and takes them out again', () => {
    expect(run('<p>a</p><p>b</p>', 1, 4)).toBe(
      '<aside class="scriba-callout" data-callout="tip"><p>a</p><p>b</p></aside>',
    )
    expect(run(BOX, 3)).toBe('<p>Attenzione</p>')
  })
})
