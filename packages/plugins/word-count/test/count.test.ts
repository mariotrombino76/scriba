import { describe, expect, it } from 'vitest'
import { EditorState, Schema, TextSelection, basicSchemaSpec, parseHTML } from '@scriba/core'
import { JSDOM } from 'jsdom'
import { countRange, countState, countString } from '../src/index.js'

const schema = new Schema(basicSchemaSpec)
const { window } = new JSDOM('')
const parse = (html: string) =>
  parseHTML(schema, new window.DOMParser().parseFromString(html, 'text/html').body)

describe('countString', () => {
  it('counts words and characters', () => {
    expect(countString('Ciao mondo')).toEqual({ words: 2, characters: 10, charactersNoSpaces: 9 })
    expect(countString('')).toEqual({ words: 0, characters: 0, charactersNoSpaces: 0 })
    expect(countString('  ,  ')).toEqual({ words: 0, characters: 5, charactersNoSpaces: 1 })
  })

  it("keeps elisions together (l'albero) and numbers as words", () => {
    expect(countString("l'albero è alto 3,5 metri", 'it').words).toBe(5)
  })

  it('counts what people see as one character (emoji, accents)', () => {
    expect(countString('👍🏽 ok').characters).toBe(4)
    expect(countString('é').characters).toBe(1) // e + combining accent
  })

  it('splits words in languages without spaces', () => {
    expect(countString('日本語のテキスト', 'ja').words).toBeGreaterThan(1)
  })
})

describe('document counts', () => {
  it('blocks and line breaks separate words; separators are not characters', () => {
    const doc = parse('<p>uno</p><p>due<br>tre</p>')
    expect(countRange(doc)).toEqual({ words: 3, characters: 9, charactersNoSpaces: 9 })
  })

  it('counts the selection separately', () => {
    const doc = parse('<p>uno due tre</p>')
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1, 8) })
    expect(countState(state)).toEqual({
      document: { words: 3, characters: 11, charactersNoSpaces: 9 },
      selection: { words: 2, characters: 7, charactersNoSpaces: 6 },
    })
    expect(countState(EditorState.create({ doc })).selection).toBeNull()
  })
})
