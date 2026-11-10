// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, Schema, basicSchemaSpec, type Transaction } from '@scriba-editor/core'
import {
  FULLSCREEN_META,
  Fullscreen,
  fullscreenKeymap,
  fullscreenToolbarItem,
} from '../src/index.js'

function setup() {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const fs = new Fullscreen(target)
  let state = EditorState.create({ schema: new Schema(basicSchemaSpec) })
  const metas: unknown[] = []
  let focused = 0
  const view = {
    get state() {
      return state
    },
    dispatch(tr: Transaction) {
      metas.push(tr.getMeta(FULLSCREEN_META))
      state = state.apply(tr)
    },
    focus: () => focused++,
  }
  return { target, fs, view, metas, focus: () => focused }
}

describe('fullscreen', () => {
  it('toggles classes, refreshes the toolbar and keeps focus', () => {
    const { target, fs, view, metas, focus } = setup()
    fs.toggle(view)
    expect(fs.active).toBe(true)
    expect(target.classList.contains('scriba-fullscreen')).toBe(true)
    expect(document.documentElement.classList.contains('scriba-fullscreen-open')).toBe(true)
    fs.toggle(view)
    expect(target.classList.contains('scriba-fullscreen')).toBe(false)
    expect(document.documentElement.classList.contains('scriba-fullscreen-open')).toBe(false)
    expect(metas).toEqual([true, false])
    expect(focus()).toBe(2)
  })

  it('Escape leaves fullscreen only when it is on; the shortcut toggles', () => {
    const { fs, view } = setup()
    const keys = fullscreenKeymap(fs)
    expect(keys['Escape']!(view.state, view.dispatch, view)).toBe(false)
    expect(keys['Mod-Shift-f']!(view.state, view.dispatch, view)).toBe(true)
    expect(fs.active).toBe(true)
    expect(keys['Escape']!(view.state, view.dispatch, view)).toBe(true)
    expect(fs.active).toBe(false)
  })

  it('the toolbar button shows the state', () => {
    const { fs, view } = setup()
    const item = fullscreenToolbarItem(fs)
    expect(item.isActive!(view.state)).toBe(false)
    fs.toggle(view)
    expect(item.isActive!(view.state)).toBe(true)
  })
})
