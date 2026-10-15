import { describe, expect, it } from 'vitest'
import { CHARACTERS, codePoints, searchCharacters } from '../src/index.js'

describe('character data', () => {
  it('every entry has text and names in both languages, no duplicates in a category', () => {
    for (const [cat, list] of Object.entries(CHARACTERS)) {
      const seen = new Set<string>()
      for (const e of list) {
        expect(e.c.length, cat).toBeGreaterThan(0)
        expect(e.it.trim() && e.en.trim(), `${cat} ${e.c}`).toBeTruthy()
        expect(seen.has(e.c), `${cat} duplicate ${e.c}`).toBe(false)
        seen.add(e.c)
      }
    }
  })

  it('is plain text: never markup', () => {
    for (const list of Object.values(CHARACTERS))
      for (const e of list) expect(e.c).not.toMatch(/[<>&]/)
  })
})

describe('search', () => {
  it('finds by Italian or English name, ignoring accents and case', () => {
    expect(searchCharacters('euro').map((e) => e.c)).toContain('€')
    expect(searchCharacters('caffe').map((e) => e.c)).toContain('☕')
    expect(searchCharacters('COFFEE').map((e) => e.c)).toContain('☕')
    expect(searchCharacters('freccia destra').map((e) => e.c)).toContain('→')
  })

  it('finds the character itself; empty search gives nothing', () => {
    expect(searchCharacters('π')[0]?.c).toBe('π')
    expect(searchCharacters('   ')).toEqual([])
  })
})

it('shows code points, ignoring joiners and variation selectors', () => {
  expect(codePoints('€')).toBe('U+20AC')
  expect(codePoints('👍')).toBe('U+1F44D')
  expect(codePoints('❤️')).toBe('U+2764')
  expect(codePoints('👩‍💻')).toBe('U+1F469 U+1F4BB')
})
