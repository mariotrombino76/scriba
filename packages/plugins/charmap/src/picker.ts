import type { MessageKey, Translate } from '@scriba/i18n'
import { openDialog, type DialogHandle } from '@scriba/ui'
import type { EditorView } from '@scriba/view'
import { CHARACTERS, type CategoryId, type CharEntry } from './data.js'

export interface CharmapOptions {
  /** Language of the names ('it' or 'en'; default: the page language, else English). */
  locale?: string
  /** Characters per row in the grid (default 10). */
  columns?: number
}

const CATEGORY_KEYS: Record<CategoryId | 'recent', MessageKey> = {
  recent: 'charmap.cat.recent',
  currency: 'charmap.cat.currency',
  punctuation: 'charmap.cat.punctuation',
  math: 'charmap.cat.math',
  arrows: 'charmap.cat.arrows',
  latin: 'charmap.cat.latin',
  greek: 'charmap.cat.greek',
  symbols: 'charmap.cat.symbols',
  smileys: 'charmap.cat.smileys',
  people: 'charmap.cat.people',
  nature: 'charmap.cat.nature',
  food: 'charmap.cat.food',
  objects: 'charmap.cat.objects',
  emojiSymbols: 'charmap.cat.emojiSymbols',
}

/** Recently inserted characters (this page only, most recent first). */
const recent: CharEntry[] = []
const MAX_RECENT = 20

export function recentCharacters(): readonly CharEntry[] {
  return recent
}

/** Lowercase, without accents: "Caffè" matches "caffe". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Characters whose name (Italian or English) or the character itself match the search. */
export function searchCharacters(query: string): CharEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const out: CharEntry[] = []
  const seen = new Set<string>()
  for (const list of Object.values(CHARACTERS)) {
    for (const entry of list) {
      if (seen.has(entry.c)) continue
      const hay = `${fold(entry.it)} ${fold(entry.en)}`
      if (entry.c === query.trim() || words.every((w) => hay.includes(w))) {
        out.push(entry)
        seen.add(entry.c)
      }
    }
  }
  return out
}

/** "U+20AC" (each code point of an emoji sequence). */
export function codePoints(text: string): string {
  return [...text]
    .filter((ch) => ch !== '️' && ch !== '‍')
    .map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' ')
}

/** Inserts text at the selection as typed (stored marks kept), then remembers it. */
export function insertCharacter(view: EditorView, entry: CharEntry): void {
  view.dispatch(view.state.tr.insertText(entry.c).scrollIntoView())
  const i = recent.findIndex((e) => e.c === entry.c)
  if (i >= 0) recent.splice(i, 1)
  recent.unshift(entry)
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT
}

let ids = 0

/**
 * Special characters and emoji dialog: category tabs, a grid of characters
 * (arrow keys move in two dimensions, Enter inserts), search by name.
 */
export function openCharmapDialog(
  view: EditorView,
  t: Translate,
  options: CharmapOptions = {},
): DialogHandle {
  const doc = view.document
  const lang = (options.locale ?? doc.documentElement.lang ?? 'en').slice(0, 2)
  const nameOf = (e: CharEntry) => (lang === 'it' ? e.it : e.en)
  const columns = Math.max(4, options.columns ?? 10)
  const id = `scriba-charmap-${++ids}`

  return openDialog(doc, {
    title: t('charmap.title'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
        const e = doc.createElement(tag)
        if (cls) e.className = cls
        return e
      }
      form.classList.add('scriba-charmap')

      // --- Search ---
      const search = el('input')
      search.type = 'text'
      search.spellcheck = false
      search.autocomplete = 'off'
      const searchLabel = el('label', 'scriba-find-field')
      const searchText = el('span')
      searchText.textContent = t('charmap.search')
      searchLabel.append(searchText, search)

      // --- Category tabs ---
      const tabs = el('div', 'scriba-charmap-tabs')
      tabs.setAttribute('role', 'tablist')
      tabs.setAttribute('aria-label', t('charmap.categories'))
      const panel = el('div', 'scriba-charmap-panel')
      panel.id = `${id}-panel`
      panel.setAttribute('role', 'tabpanel')
      const grid = el('div', 'scriba-charmap-grid')
      grid.style.gridTemplateColumns = `repeat(${columns}, 2.4em)` // CSSOM
      const empty = el('p', 'scriba-dialog-hint')
      empty.textContent = t('charmap.none')
      empty.hidden = true
      panel.append(grid, empty)

      // --- Preview (visible name and code of the focused character) ---
      const preview = el('div', 'scriba-charmap-preview')
      preview.setAttribute('aria-hidden', 'true') // the buttons carry the names
      const big = el('span', 'scriba-charmap-big')
      const info = el('span')
      preview.append(big, info)

      const categories: (CategoryId | 'recent')[] = [
        ...(recent.length ? (['recent'] as const) : []),
        ...(Object.keys(CHARACTERS) as CategoryId[]),
      ]
      const tabButtons = categories.map((cat, i) => {
        const tab = el('button')
        tab.type = 'button'
        tab.setAttribute('role', 'tab')
        tab.id = `${id}-tab-${cat}`
        tab.setAttribute('aria-controls', panel.id)
        tab.textContent = t(CATEGORY_KEYS[cat])
        tab.tabIndex = i === 0 ? 0 : -1
        tab.addEventListener('click', () => select(i))
        tabs.appendChild(tab)
        return tab
      })

      let cells: HTMLButtonElement[] = []
      let active = 0
      const show = (entries: readonly CharEntry[], labelledBy: string | null, label?: string) => {
        grid.replaceChildren()
        if (labelledBy) {
          panel.setAttribute('aria-labelledby', labelledBy)
          panel.removeAttribute('aria-label')
        } else {
          panel.removeAttribute('aria-labelledby')
          panel.setAttribute('aria-label', label ?? '')
        }
        cells = entries.map((entry, i) => {
          const b = el('button', 'scriba-charmap-cell')
          b.type = 'button'
          b.textContent = entry.c.trim() ? entry.c : '␣' // invisible characters get a visible stand-in
          b.setAttribute('aria-label', nameOf(entry))
          b.title = `${nameOf(entry)} (${codePoints(entry.c)})`
          b.tabIndex = i === 0 ? 0 : -1
          b.addEventListener('focus', () => {
            active = i
            big.textContent = b.textContent
            info.textContent = `${nameOf(entry)} · ${codePoints(entry.c)}`
          })
          b.addEventListener('click', () => {
            handle.close()
            insertCharacter(view, entry)
          })
          grid.appendChild(b)
          return b
        })
        active = 0
        empty.hidden = cells.length > 0
        big.textContent = ''
        info.textContent = ''
      }
      const select = (i: number, focus = false) => {
        tabButtons.forEach((tab, j) => {
          tab.setAttribute('aria-selected', String(i === j))
          tab.tabIndex = i === j ? 0 : -1
        })
        const cat = categories[i]!
        show(cat === 'recent' ? recent : CHARACTERS[cat], tabButtons[i]!.id)
        if (focus) tabButtons[i]!.focus()
      }

      tabs.addEventListener('keydown', (e) => {
        const i = tabButtons.indexOf(e.target as HTMLButtonElement)
        if (i < 0) return
        const next =
          e.key === 'ArrowRight'
            ? i + 1
            : e.key === 'ArrowLeft'
              ? i - 1
              : e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? tabButtons.length - 1
                  : null
        if (next === null) return
        e.preventDefault()
        select((next + tabButtons.length) % tabButtons.length, true)
      })
      grid.addEventListener('keydown', (e) => {
        const moves: Record<string, number> = {
          ArrowRight: 1,
          ArrowLeft: -1,
          ArrowDown: columns,
          ArrowUp: -columns,
        }
        let next: number | null = e.key in moves ? active + moves[e.key]! : null
        if (e.key === 'Home') next = 0
        if (e.key === 'End') next = cells.length - 1
        if (next === null || next < 0 || next >= cells.length) return
        e.preventDefault()
        cells[active]!.tabIndex = -1
        cells[next]!.tabIndex = 0
        cells[next]!.focus()
      })
      search.addEventListener('input', () => {
        const q = search.value.trim()
        tabs.hidden = !!q
        if (q) show(searchCharacters(q), null, t('charmap.results'))
        else select(0)
      })
      search.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' && cells.length) {
          e.preventDefault()
          cells[0]!.focus()
        }
      })

      const actions = el('div', 'scriba-dialog-actions')
      const close = el('button')
      close.type = 'button'
      close.textContent = t('charmap.close')
      close.addEventListener('click', () => handle.close())
      actions.appendChild(close)
      form.addEventListener('submit', (e) => e.preventDefault())

      form.append(searchLabel, tabs, panel, preview, actions)
      select(0)
      queueMicrotask(() => search.focus())
    },
  })
}
