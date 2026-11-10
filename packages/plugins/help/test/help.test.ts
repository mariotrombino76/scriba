// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { EditorState } from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { historyItems, markItems, toolbarGroup, type ToolbarButton } from '@scriba-editor/ui'
import { EditorView } from '@scriba-editor/view'
import { doc, p, schema } from '../../../core/test/helpers/schema.js'
import {
  editingHelp,
  helpItem,
  helpKeymap,
  markdownHelp,
  navigationHelp,
  openHelpDialog,
  shortcutsFromItems,
  type HelpOptions,
} from '../src/index.js'

const t = createTranslator('it')

beforeAll(() => {
  // jsdom has no modal dialogs: enough of showModal/close for these tests
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal(this: HTMLDialogElement): void
    close(this: HTMLDialogElement): void
  }
  proto.showModal ??= function () {
    this.open = true
  }
  proto.close ??= function () {
    this.open = false
  }
})

function setup(options: Partial<HelpOptions> = {}) {
  document.body.textContent = ''
  const place = document.createElement('div')
  document.body.append(place)
  const view = new EditorView(place, { state: EditorState.create({ doc: doc(p('x')) }) })
  const all: HelpOptions = {
    t,
    mac: false,
    groups: [shortcutsFromItems(historyItems()), markdownHelp()],
    ...options,
  }
  return { view, options: all }
}

describe('shortcutsFromItems', () => {
  it('collects buttons, groups, menus and menu bar entries, each key once', () => {
    const extra: ToolbarButton = {
      type: 'button',
      id: 'again',
      label: () => 'Duplicato',
      shortcut: 'Mod-z',
      command: () => true,
    }
    const group = shortcutsFromItems([
      toolbarGroup('h', 'toolbar.group.history', historyItems()),
      '|',
      ...markItems(schema).slice(0, 1),
      extra,
    ])
    expect(group.title(t)).toBe('Comandi')
    expect(group.shortcuts.map((s) => [s.label(t), s.keys])).toEqual([
      ['Annulla', ['Mod-z']],
      ['Ripeti', ['Mod-y']],
      ['Grassetto', ['Mod-b']],
    ])
  })

  it('keys without a button are opt-in: "/" and "@" only when used', () => {
    expect(editingHelp().shortcuts.some((s) => s.typed?.(t) === '/')).toBe(false)
    expect(
      editingHelp({ slash: true, mentions: true }).shortcuts.map((s) => s.typed?.(t)),
    ).toContain('@')
    expect(navigationHelp().shortcuts.some((s) => s.keys?.includes('Shift-F10'))).toBe(false)
    expect(navigationHelp({ contextMenu: true }).shortcuts.at(-1)!.keys).toEqual(['Shift-F10'])
  })
})

describe('openHelpDialog', () => {
  it('one table per group, keys in the platform notation, typed text as code', () => {
    const { view, options } = setup()
    const handle = openHelpDialog(view, options)
    const dialog = handle.dialog
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent).toBe(
      'Scorciatoie da tastiera',
    )
    const tables = [...dialog.querySelectorAll('table')]
    expect(
      tables.map((tb) => document.getElementById(tb.getAttribute('aria-labelledby')!)!.textContent),
    ).toEqual(['Comandi', 'Markdown mentre scrivi'])
    const undo = tables[0]!.tBodies[0]!.rows[0]!
    expect(undo.cells[0]!.textContent).toBe('Annulla')
    expect(undo.cells[1]!.querySelector('kbd')!.textContent).toBe('Ctrl+Z')
    const bold = [...tables[1]!.tBodies[0]!.rows].find(
      (r) => r.cells[0]!.textContent === 'Grassetto',
    )!
    expect(bold.cells[1]!.querySelector('code')!.textContent).toBe('**testo**')
  })

  it('the search filters rows and groups; nothing found is said', () => {
    const { view, options } = setup()
    const { dialog } = openHelpDialog(view, options)
    const search = dialog.querySelector<HTMLInputElement>('input[type=search]')!
    expect(dialog.querySelector(`label[for="${search.id}"]`)!.textContent).toBe(
      'Cerca una scorciatoia',
    )
    const visibleRows = () =>
      [...dialog.querySelectorAll<HTMLTableRowElement>('tbody tr')]
        .filter((r) => !r.hidden && !r.closest<HTMLElement>('section')!.hidden)
        .map((r) => r.cells[0]!.textContent)
    search.value = 'ctrl+y'
    search.dispatchEvent(new Event('input'))
    expect(visibleRows()).toEqual(['Ripeti'])
    expect(dialog.querySelectorAll('section:not([hidden])')).toHaveLength(1)
    search.value = 'zzz'
    search.dispatchEvent(new Event('input'))
    expect(visibleRows()).toEqual([])
    expect(dialog.querySelector('[role=status]')!.textContent).toBe('Nessuna scorciatoia trovata')
    // Enter in the search field does not close the dialog
    const submit = new Event('submit', { cancelable: true })
    dialog.querySelector('form')!.dispatchEvent(submit)
    expect(submit.defaultPrevented).toBe(true)
  })

  it('labels are text, never markup', () => {
    const { view, options } = setup({
      groups: [
        {
          id: 'x',
          title: () => '<img src=x onerror=alert(1)>',
          shortcuts: [{ keys: ['Mod-b'], label: () => '<b>nope</b>' }],
        },
      ],
    })
    const { dialog } = openHelpDialog(view, options)
    expect(dialog.querySelector('img, b')).toBeNull()
    expect(dialog.querySelector('h3')!.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('"Chiudi" closes it and gives the focus back to the editor', () => {
    const { view, options } = setup()
    const { dialog } = openHelpDialog(view, options)
    ;[...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Chiudi')!.click()
    expect(dialog.isConnected).toBe(false)
    expect(document.activeElement).toBe(view.dom)
  })
})

describe('helpItem and helpKeymap', () => {
  it('the menu entry works read-only; Alt+0 opens the dialog', () => {
    const { view, options } = setup()
    const item = helpItem(options)
    expect([item.shortcut, item.readOnly, item.command(view.state)]).toEqual(['Alt-0', true, true])
    expect(helpKeymap(options)['Alt-0']!(view.state, undefined, view)).toBe(true)
    expect(document.querySelector('dialog.scriba-help')).not.toBeNull()
  })
})
