import type { Translate } from '@scriba/i18n'
import { formatShortcut, isMac, openDialog, type DialogHandle } from '@scriba/ui'
import type { EditorView } from '@scriba/view'
import type { HelpGroup, HelpShortcut } from './shortcuts.js'

export interface HelpOptions {
  t: Translate
  /** The groups to show, in order (a function: read when the dialog opens). */
  groups: readonly HelpGroup[] | (() => readonly HelpGroup[])
  /** Key notation (default: detected). */
  mac?: boolean
}

let helpCount = 0

/** Readable form of one key binding (`Escape` as the key cap says it). */
function keyText(binding: string, t: Translate, mac: boolean): string {
  return binding === 'Escape' ? 'Esc' : formatShortcut(binding, t, mac)
}

/** The visible text of a shortcut's keys, also used for searching. */
function shortcutTexts(s: HelpShortcut, t: Translate, mac: boolean): string[] {
  return s.typed ? [s.typed(t)] : (s.keys ?? []).map((k) => keyText(k, t, mac))
}

/**
 * The keyboard shortcuts dialog (TinyMCE's Help): one table per group, a
 * search field filtering them, focus back to the editor on close. Built with
 * `createElement` and `textContent` only.
 */
export function openHelpDialog(view: EditorView, options: HelpOptions): DialogHandle {
  const { t } = options
  const mac = options.mac ?? isMac()
  const groups = typeof options.groups === 'function' ? options.groups() : options.groups
  const doc = view.document
  const id = `scriba-help-${++helpCount}`
  return openDialog(doc, {
    title: t('help.title'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      handle.dialog.classList.add('scriba-help')
      const search = doc.createElement('input')
      search.type = 'search'
      search.id = `${id}-search`
      search.autocomplete = 'off'
      const searchLabel = doc.createElement('label')
      searchLabel.htmlFor = search.id
      searchLabel.textContent = t('help.search')
      const list = doc.createElement('div')
      list.className = 'scriba-help-groups'
      list.id = `${id}-groups`
      search.setAttribute('aria-controls', list.id)
      const empty = doc.createElement('p')
      empty.className = 'scriba-help-empty'
      empty.setAttribute('role', 'status')

      const rows: { row: HTMLTableRowElement; text: string; section: HTMLElement }[] = []
      groups.forEach((group, g) => {
        if (!group.shortcuts.length) return
        const section = doc.createElement('section')
        const heading = doc.createElement('h3')
        heading.id = `${id}-group-${g}`
        heading.textContent = group.title(t)
        const table = doc.createElement('table')
        table.setAttribute('aria-labelledby', heading.id)
        const head = table.createTHead().insertRow()
        for (const text of [t('help.action'), t('help.keys')]) {
          const th = doc.createElement('th')
          th.scope = 'col'
          th.textContent = text
          head.appendChild(th)
        }
        const body = table.createTBody()
        for (const shortcut of group.shortcuts) {
          const row = body.insertRow()
          const label = shortcut.label(t)
          row.insertCell().textContent = label
          const keys = row.insertCell()
          const texts = shortcutTexts(shortcut, t, mac)
          texts.forEach((text, i) => {
            if (i) keys.append(` ${t('help.or')} `)
            const kbd = doc.createElement(shortcut.typed ? 'code' : 'kbd')
            kbd.textContent = text
            keys.appendChild(kbd)
          })
          rows.push({ row, text: [label, ...texts].join(' ').toLowerCase(), section })
        }
        section.append(heading, table)
        list.appendChild(section)
      })

      search.addEventListener('input', () => {
        const query = search.value.trim().toLowerCase()
        const shown = new Set<HTMLElement>()
        for (const { row, text, section } of rows) {
          row.hidden = !!query && !text.includes(query)
          if (!row.hidden) shown.add(section)
        }
        for (const section of list.children)
          (section as HTMLElement).hidden = !shown.has(section as HTMLElement)
        empty.textContent = shown.size ? '' : t('help.noResults')
      })

      const actions = doc.createElement('div')
      actions.className = 'scriba-dialog-actions'
      const close = doc.createElement('button')
      close.type = 'button'
      close.textContent = t('help.close')
      close.addEventListener('click', () => handle.close())
      actions.appendChild(close)
      form.append(searchLabel, search, list, empty, actions)
      form.addEventListener('submit', (e) => e.preventDefault()) // Enter in the search field
    },
  })
}
