// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { basicSchema, parseHTML, serializeHTML } from '../src/index.js'
import { bigDoc } from './fixtures.js'

/** Loading and saving a 1 MB document: parser in an inert document, serializer, JSON. */
const doc = bigDoc()
const html = serializeHTML(doc)
const json = doc.toJSON()

test('1 MB document: load and save', async ({ bench }) => {
  const results = await bench.compare(
    bench('serializeHTML', () => {
      serializeHTML(doc)
    }),
    bench('parseHTML (inert document + schema)', () => {
      parseHTML(basicSchema, new DOMParser().parseFromString(html, 'text/html').body, {
        maxNodes: 1_000_000,
      })
    }),
    bench('toJSON', () => {
      doc.toJSON()
    }),
    bench('nodeFromJSON (validated)', () => {
      basicSchema.nodeFromJSON(json)
    }),
    { time: 2000 },
  )
  // opening or saving a 1 MB document must not freeze the page for long
  for (const name of [
    'serializeHTML',
    'parseHTML (inert document + schema)',
    'toJSON',
    'nodeFromJSON (validated)',
  ] as const)
    expect(results.get(name).latency.p75, name).toBeLessThan(1000)
})
