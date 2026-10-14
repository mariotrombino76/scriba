import { describe, expect, it as test } from 'vitest'
import { createTranslator, en, it } from '../src/index.js'

describe('i18n', () => {
  test('every locale has exactly the English keys', () => {
    expect(Object.keys(it).sort()).toEqual(Object.keys(en).sort())
  })

  test('translates with params and falls back', () => {
    const t = createTranslator('it')
    expect(t('mark.bold')).toBe('Grassetto')
    expect(t('block.heading', { level: 2 })).toBe('Titolo 2')
    expect(createTranslator('it-IT')('history.undo')).toBe('Annulla')
    expect(createTranslator('xx')('history.undo')).toBe('Undo')
    expect(createTranslator('en', { 'history.undo': 'Back' })('history.undo')).toBe('Back')
    expect(t('block.heading')).toBe('Titolo {level}')
  })
})
