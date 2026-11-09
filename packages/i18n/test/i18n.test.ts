import { describe, expect, it as test } from 'vitest'
import { createTranslator, de, en, es, fr, it, type Messages } from '../src/index.js'

const translations: Record<string, Messages> = { it, fr, de, es }
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('i18n', () => {
  for (const [name, messages] of Object.entries(translations)) {
    test(`${name}: exactly the English keys`, () => {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort())
    })

    test(`${name}: every message keeps the English placeholders and is not empty`, () => {
      for (const key of Object.keys(en) as (keyof Messages)[]) {
        expect(placeholders(messages[key]), key).toEqual(placeholders(en[key]))
        expect(messages[key].trim(), key).not.toBe('')
        // plain text only: a translation is never markup
        expect(messages[key], key).not.toMatch(/<[a-z!/]/i)
      }
    })
  }

  test('translates with params and falls back', () => {
    const t = createTranslator('it')
    expect(t('mark.bold')).toBe('Grassetto')
    expect(t('block.heading', { level: 2 })).toBe('Titolo 2')
    expect(createTranslator('it-IT')('history.undo')).toBe('Annulla')
    expect(createTranslator('xx')('history.undo')).toBe('Undo')
    expect(createTranslator('en', { 'history.undo': 'Back' })('history.undo')).toBe('Back')
    expect(t('block.heading')).toBe('Titolo {level}')
  })

  test('the other languages are passed as objects', () => {
    expect(createTranslator(fr)('mark.bold')).not.toBe(en['mark.bold'])
    expect(createTranslator(de)('block.heading', { level: 3 })).toContain('3')
    expect(createTranslator(es)('history.undo')).not.toBe('Undo')
  })
})
