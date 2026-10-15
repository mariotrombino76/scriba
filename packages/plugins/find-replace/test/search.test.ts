import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, parseHTML } from '@scriba/core'
import { JSDOM } from 'jsdom'
import {
  SearchRunner,
  blockTexts,
  compileQuery,
  expandReplacement,
  searchTexts,
  toMatches,
} from '../src/index.js'

const spans = (texts: string[], query: Parameters<typeof searchTexts>[1]) => {
  const r = searchTexts(texts, query)
  if (typeof r === 'string' || r === null) return r
  return r.matches.map(([b, f, t]) => texts[b]!.slice(f, t))
}

describe('search engine', () => {
  it('finds plain text, case-insensitive by default, special characters literal', () => {
    expect(spans(['Ciao ciao CIAO'], { text: 'ciao' })).toEqual(['Ciao', 'ciao', 'CIAO'])
    expect(spans(['Ciao ciao'], { text: 'ciao', caseSensitive: true })).toEqual(['ciao'])
    expect(spans(['a.b axb (x)'], { text: 'a.b' })).toEqual(['a.b'])
    expect(spans(['(x) $1'], { text: '(x)' })).toEqual(['(x)'])
  })

  it('whole words respect accented letters', () => {
    expect(spans(['casa casale accasa casa'], { text: 'casa', wholeWord: true })).toEqual([
      'casa',
      'casa',
    ])
    expect(spans(['è perché'], { text: 'è', wholeWord: true })).toEqual(['è'])
  })

  it('regular expressions, with groups', () => {
    const r = searchTexts(['2026-10-15'], { text: '(\\d+)-(\\d+)', regex: true })
    expect(r).toEqual({ matches: [[0, 0, 7, ['2026', '10']]], truncated: false })
  })

  it('reports invalid, empty and too long queries', () => {
    expect(compileQuery({ text: '(', regex: true })).toBe('invalid')
    expect(compileQuery({ text: '' })).toBe('empty')
    expect(compileQuery({ text: 'x'.repeat(501) })).toBe('tooLong')
  })

  it('zero-width matches never loop and are skipped', () => {
    expect(spans(['abc'], { text: 'x*', regex: true })).toEqual([])
    expect(spans(['aa b'], { text: 'a*', regex: true })).toEqual(['aa'])
  })

  it('stops at the match limit', () => {
    const r = searchTexts(['a'.repeat(50)], { text: 'a' }, 10)
    expect(r).toMatchObject({ truncated: true })
    expect(typeof r === 'object' && r?.matches.length).toBe(10)
  })

  it('expands $&, $1, $$ in regex replacements only', () => {
    expect(expandReplacement('[$1/$2] $& $$ $9', '2026-10', ['2026', '10'], true)).toBe(
      '[2026/10] 2026-10 $ $9',
    )
    expect(expandReplacement('$1', 'x', ['y'], false)).toBe('$1')
  })
})

describe('document mapping', () => {
  it('offsets in each textblock map to document positions (images count as one)', () => {
    const schema = new Schema(basicSchemaSpec)
    const { window } = new JSDOM('')
    const doc = parseHTML(
      schema,
      new window.DOMParser().parseFromString('<p>ab</p><p>c<br>ab</p>', 'text/html').body,
    )
    const { starts, texts } = blockTexts(doc)
    expect(texts).toEqual(['ab', 'c￼ab'])
    const r = searchTexts(texts, { text: 'ab' })
    if (typeof r !== 'object' || !r) throw new Error()
    const matches = toMatches(r.matches, starts)
    expect(matches.map((m) => doc.textBetween(m.from, m.to))).toEqual(['ab', 'ab'])
  })
})

describe('SearchRunner', () => {
  it('plain text runs here; regex without a worker is unsupported', async () => {
    const runner = new SearchRunner({ createWorker: () => null })
    expect(await runner.run(['xx'], { text: 'x' })).toMatchObject({ truncated: false })
    expect(await runner.run(['xx'], { text: 'x', regex: true })).toBe('unsupported')
  })

  it('a regex taking too long: the worker is terminated and the search reports a timeout', async () => {
    let terminated = 0
    const hanging = {
      onmessage: null,
      onerror: null,
      postMessage() {}, // never answers, like a catastrophic regex
      terminate: () => terminated++,
    } as unknown as Worker
    const runner = new SearchRunner({ createWorker: () => hanging, timeout: 50 })
    expect(await runner.run(['aaaa'], { text: '(a+)+$', regex: true })).toBe('timeout')
    expect(terminated).toBe(1)
  })

  it('a newer search cancels the one in progress', async () => {
    const answers: ((data: unknown) => void)[] = []
    const worker = {
      onmessage: null as ((e: MessageEvent) => void) | null,
      onerror: null,
      postMessage(msg: { id: number }) {
        answers.push(() =>
          worker.onmessage?.({
            data: { id: msg.id, result: { matches: [], truncated: false } },
          } as MessageEvent),
        )
      },
      terminate() {},
    }
    const runner = new SearchRunner({
      createWorker: () => worker as unknown as Worker,
      timeout: 1000,
    })
    const first = runner.run(['a'], { text: 'a', regex: true })
    const second = runner.run(['a'], { text: 'a', regex: true })
    expect(await first).toBe('cancelled')
    answers[1]!(null)
    expect(await second).toEqual({ matches: [], truncated: false })
  })
})
