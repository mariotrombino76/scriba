// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML, type Node } from '@scriba/core'
import { imageNodes } from '../../image/src/index.js'
import { listNodes } from '../../list/src/index.js'
import { tableNodes } from '../../table/src/index.js'
import { diffDocs, diffSequence, formatRevisionDate, type DocDiff } from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...listNodes, ...tableNodes, ...imageNodes },
  marks: basicSchemaSpec.marks,
})
const doc = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)

/** The merged text with [+added+] and [-removed-] around highlighted ranges. */
function marked(diff: DocDiff): string {
  const blocks: string[] = []
  const open = (p: number) => diff.highlights.filter((h) => h.from === p)
  const close = (p: number) => diff.highlights.filter((h) => h.to === p)
  diff.doc.descendants((node: Node, pos: number) => {
    if (!node.isTextblock) return true
    let out = ''
    const start = pos + 1
    const end = start + node.content.size
    for (let p = start; p <= end; p++) {
      for (const h of close(p)) out += h.kind === 'insert' ? '+]' : '-]'
      if (p === end) break
      for (const h of open(p)) out += h.kind === 'insert' ? '[+' : '[-'
      out += diff.doc.textBetween(p, p + 1)
    }
    blocks.push(out)
    return false
  })
  return blocks.join(' | ')
}

describe('diffSequence', () => {
  const eq = (a: string, b: string) => a === b
  it('finds the longest common part', () => {
    expect(diffSequence([...'abcd'], [...'axcd'], eq)).toEqual([
      ['equal', 0, 0],
      ['delete', 1],
      ['insert', 1],
      ['equal', 2, 2],
      ['equal', 3, 3],
    ])
    expect(diffSequence([], [...'ab'], eq)).toEqual([
      ['insert', 0],
      ['insert', 1],
    ])
  })
})

describe('diffDocs', () => {
  it('finds nothing in equal documents', () => {
    const d = diffDocs(doc('<p>uno</p><p>due</p>'), doc('<p>uno</p><p>due</p>'))
    expect(d.changes).toEqual([])
    expect(serializeHTML(d.doc)).toBe('<p>uno</p><p>due</p>')
  })

  it('compares a changed paragraph word by word', () => {
    const d = diffDocs(
      doc('<p>Il gatto nero dorme.</p>'),
      doc('<p>Il gatto bianco dorme molto.</p>'),
    )
    expect(marked(d)).toBe('Il gatto [-nero-][+bianco+] dorme[+ molto+].')
    expect(d.changes.map((c) => [c.kind, c.text])).toEqual([
      ['delete', 'nero'],
      ['insert', 'bianco'],
      ['insert', ' molto'],
    ])
  })

  it('places an addition the way a person reads it', () => {
    const d = diffDocs(
      doc('<p>Il gatto nero dorme.</p>'),
      doc('<p>Il gatto bianco dorme. Sogna.</p>'),
    )
    expect(marked(d)).toBe('Il gatto [-nero-][+bianco+] dorme.[+ Sogna.+]')
    const r = diffDocs(doc('<p>uno. due. tre.</p>'), doc('<p>uno. tre.</p>'))
    expect(marked(r)).toBe('uno. [-due. -]tre.')
  })

  it('shows a formatting change as removed and added', () => {
    const d = diffDocs(doc('<p>uno due</p>'), doc('<p>uno <strong>due</strong></p>'))
    expect(marked(d)).toBe('uno [-due-][+due+]')
  })

  it('adds and removes whole blocks', () => {
    const d = diffDocs(doc('<p>a</p><p>b</p><p>c</p>'), doc('<p>a</p><p>c</p><h2>d</h2>'))
    expect(marked(d)).toBe('a | [-b-] | c | [+d+]')
    expect(d.changes.map((c) => c.kind)).toEqual(['delete', 'insert'])
    // a whole-block change covers the block
    const removed = d.changes[0]!
    expect(d.doc.nodeAt(removed.from)?.textContent).toBe('b')
  })

  it('shows a block whose type or attributes changed as replaced', () => {
    const d = diffDocs(doc('<p>titolo</p>'), doc('<h1>titolo</h1>'))
    expect(marked(d)).toBe('[-titolo-] | [+titolo+]')
    const a = diffDocs(doc('<h1>x</h1>'), doc('<h2>x</h2>'))
    expect(a.changes.map((c) => c.kind)).toEqual(['delete', 'insert'])
  })

  it('looks inside lists and tables, rows whole', () => {
    const d = diffDocs(
      doc('<ul><li><p>uno</p></li><li><p>due</p></li></ul>'),
      doc('<ul><li><p>uno</p></li><li><p>tre</p></li></ul>'),
    )
    expect(marked(d)).toBe('uno | [-due-][+tre+]')
    const t = diffDocs(
      doc('<table><tr><td><p>a</p></td></tr><tr><td><p>b</p></td></tr></table>'),
      doc('<table><tr><td><p>a</p></td></tr><tr><td><p>c</p></td></tr></table>'),
    )
    expect(marked(t)).toBe('a | [-b-] | [+c+]')
    expect(t.changes).toHaveLength(2)
  })

  it('counts an image as one token', () => {
    const d = diffDocs(doc('<p>a <img src="x.png" alt="x"> b</p>'), doc('<p>a  b</p>'))
    expect(d.changes).toHaveLength(1)
    // the image and the space before it: no words to read out
    expect(d.changes[0]).toMatchObject({ kind: 'delete', text: ' ' })
  })

  it('keeps every highlight inside a textblock of the merged document', () => {
    const d = diffDocs(
      doc('<p>uno</p><ul><li><p>x</p></li></ul><p>fine</p>'),
      doc('<h2>nuovo</h2><p>uno due</p><p>fine</p>'),
    )
    for (const h of d.highlights) {
      const $from = d.doc.resolve(h.from)
      expect($from.parent.isTextblock).toBe(true)
      expect(h.to).toBeLessThanOrEqual($from.end())
    }
  })
})

describe('formatRevisionDate', () => {
  it('formats in the locale, ignoring invalid dates', () => {
    expect(formatRevisionDate('2026-11-09T10:30:00', 'it')).toMatch(/9 nov 2026.*10:30/)
    expect(formatRevisionDate('non una data', 'it')).toBe('')
  })
})
