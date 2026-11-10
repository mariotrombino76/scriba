// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection, serializeHTML } from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { MenuPopup } from '@scriba/ui'
import { EditorView } from '@scriba/view'
import { doc, p } from '../../../core/test/helpers/schema.js'
import { DEFAULT_FORMATS, dateTimeMenu, formatDateTime, insertText } from '../src/index.js'

const at = new Date(2026, 9, 19, 9, 5, 7) // 19 Oct 2026, 09:05:07 local time

describe('formatDateTime', () => {
  it('ISO forms and Intl formats in the given language', () => {
    expect(formatDateTime(at, 'iso-date')).toBe('2026-10-19')
    expect(formatDateTime(at, 'iso-time')).toBe('09:05:07')
    expect(formatDateTime(at, { dateStyle: 'long' }, 'it')).toBe('19 ottobre 2026')
    expect(formatDateTime(at, { timeStyle: 'medium' }, 'it')).toBe('09:05:07')
    expect(DEFAULT_FORMATS).toHaveLength(4)
  })
})

describe('insertText', () => {
  it('types plain text over the selection, only where text goes', () => {
    const d = doc(p('ab'))
    let state = EditorState.create({ doc: d, selection: TextSelection.create(d, 2, 3) })
    expect(insertText('2026-10-19')(state, (tr) => (state = state.apply(tr)))).toBe(true)
    expect(serializeHTML(state.doc)).toBe('<p>a2026-10-19</p>')
    expect(insertText('')(state)).toBe(false)
  })
})

describe('dateTimeMenu', () => {
  it('one entry per format, showing the time when the menu opens', () => {
    let now = at
    const menu = dateTimeMenu({ locale: 'it', now: () => now })
    expect(menu.entries.map((e) => e.label(createTranslator('it')))).toEqual([
      '09:05:07',
      '2026-10-19',
      '19 ottobre 2026',
      '19/10/26',
    ])
    // in a popup: labels computed again at each opening
    document.body.textContent = ''
    const place = document.createElement('div')
    const button = document.createElement('button')
    document.body.append(button, place)
    const d = doc(p('x'))
    const view = new EditorView(place, {
      state: EditorState.create({ doc: d, selection: TextSelection.create(d, 2) }),
    })
    const popup = new MenuPopup(menu, button, createTranslator('it'), () => view)
    document.body.append(popup.el)
    popup.open()
    const first = () => popup.el.querySelector('[data-entry=datetime_0]')!
    expect(first().textContent).toBe('09:05:07')
    popup.close(false)
    now = new Date(2026, 9, 19, 9, 6, 0)
    popup.open()
    expect(first().textContent).toBe('09:06:00')
    ;(first() as HTMLButtonElement).click()
    expect(serializeHTML(view.state.doc)).toBe('<p>x09:06:00</p>')
  })
})
