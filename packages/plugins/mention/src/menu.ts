import type { Translate } from '@scriba/i18n'
import type { EditorView, PluginView } from '@scriba/view'
import {
  chooseMention,
  cleanResults,
  getMentionState,
  isLoading,
  mentionKey,
  type MentionItem,
} from './state.js'

/**
 * Finds people for a query (`""` right after the "@"). Call your backend here;
 * `signal` aborts when the user types on or closes the list.
 */
export type MentionSearch = (query: string, signal: AbortSignal) => Promise<readonly MentionItem[]>

export interface MentionMenuOptions {
  search: MentionSearch
  t: Translate
  /** Pause in typing before searching, in ms (default 150). */
  debounce?: number
  /** Most entries shown (default 8, at most 50). */
  maxResults?: number
  /** A search taking longer fails, in ms (default 10 000). */
  timeout?: number
}

let ids = 0

/**
 * The mention list: a listbox under the "@", while the focus stays in the
 * text (`aria-controls`, `aria-activedescendant` on the editor). Searches run
 * one at a time: a newer query aborts the older one, and late answers for an
 * old query are ignored. Results are shown as text only.
 */
export function mentionMenuView(view: EditorView, options: MentionMenuOptions): PluginView {
  const { search, t } = options
  const debounce = Math.max(0, options.debounce ?? 150)
  const max = Math.min(50, Math.max(1, options.maxResults ?? 8))
  const timeout = Math.max(1, options.timeout ?? 10_000)
  const doc = view.document
  const win = doc.defaultView
  const id = `scriba-mention-${++ids}`

  const box = doc.createElement('div')
  box.className = 'scriba-slash-menu scriba-mention-menu'
  box.hidden = true
  const status = doc.createElement('div')
  status.className = 'scriba-slash-empty'
  status.setAttribute('role', 'status')
  const list = doc.createElement('div')
  list.id = id
  list.setAttribute('role', 'listbox')
  list.setAttribute('aria-label', t('mention.label'))
  box.append(list, status)
  doc.body.appendChild(box)

  /** Query (and "@" position) of the search scheduled or running. */
  let wanted: { from: number; query: string } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | null = null

  const cancel = () => {
    clearTimeout(timer)
    controller?.abort()
    controller = null
    wanted = null
  }

  const deliver = (from: number, query: string, results: MentionItem[], error: boolean) => {
    const s = getMentionState(view.state)
    if (!s.active || s.from !== from || s.query !== query) return // an old answer
    view.dispatch(view.state.tr.setMeta(mentionKey, { ...s, results, resultsFor: query, error }))
  }

  const run = (from: number, query: string) => {
    const current = new AbortController()
    controller = current
    // a source ignoring the signal never settles: the time limit fails it anyway
    const timeLimit = setTimeout(() => {
      if (controller !== current) return
      controller = null
      current.abort()
      deliver(from, query, [], true)
    }, timeout)
    let answer: Promise<readonly MentionItem[]>
    try {
      answer = Promise.resolve(search(query, current.signal))
    } catch (e) {
      answer = Promise.reject(e)
    }
    answer.then(
      (raw) => {
        clearTimeout(timeLimit)
        if (controller !== current) return
        controller = null
        deliver(from, query, cleanResults(raw, max), false)
      },
      () => {
        clearTimeout(timeLimit)
        if (controller !== current) return // aborted by a newer query or by closing
        controller = null
        deliver(from, query, [], true)
      },
    )
  }

  const schedule = (from: number, query: string) => {
    if (wanted && wanted.from === from && wanted.query === query) return
    cancel()
    wanted = { from, query }
    timer = setTimeout(() => run(from, query), debounce)
  }

  const hide = () => {
    if (box.hidden) return
    box.hidden = true
    view.dom.removeAttribute('aria-controls')
    view.dom.removeAttribute('aria-activedescendant')
  }

  const update = () => {
    const s = getMentionState(view.state)
    if (!s.active) {
      cancel()
      return hide()
    }
    if (isLoading(s)) schedule(s.from, s.query)
    else wanted = null
    if (!view.hasFocus()) return hide()

    list.replaceChildren()
    const shown = s.results
    const index = Math.min(s.index, shown.length - 1)
    shown.forEach((item, i) => {
      const option = doc.createElement('div')
      option.className = 'scriba-slash-item scriba-mention-item'
      option.id = `${id}-${i}` // never the person's id: it is not ours to put in the DOM
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', String(i === index))
      const label = doc.createElement('span')
      label.textContent = item.label
      option.appendChild(label)
      if (item.detail) {
        const detail = doc.createElement('span')
        detail.className = 'scriba-mention-detail'
        detail.textContent = item.detail
        option.appendChild(detail)
      }
      // keep the focus (and the "@query") in the editor while clicking
      option.addEventListener('mousedown', (e) => e.preventDefault())
      option.addEventListener('click', () => chooseMention(view, item))
      list.appendChild(option)
      if (i === index) {
        view.dom.setAttribute('aria-activedescendant', option.id)
        option.scrollIntoView?.({ block: 'nearest' }) // (missing outside browsers)
      }
    })
    if (!shown.length) view.dom.removeAttribute('aria-activedescendant')
    list.setAttribute('aria-busy', String(isLoading(s)))

    const text = isLoading(s)
      ? shown.length
        ? ''
        : t('mention.loading')
      : s.error
        ? t('mention.error')
        : shown.length
          ? ''
          : t('mention.none')
    if (status.textContent !== text) status.textContent = text
    status.hidden = !text

    view.dom.setAttribute('aria-controls', id)
    box.hidden = false
    // under the "@" (above it when there is no room below), inside the window
    const at = view.coordsAtPos(s.from)
    const vh = win?.innerHeight ?? 0
    const vw = win?.innerWidth ?? 0
    const h = box.offsetHeight
    const w = box.offsetWidth
    let top = at.bottom + 4
    if (vh && top + h > vh - 8 && at.top - h - 4 > 8) top = at.top - h - 4
    box.style.top = `${Math.round(top)}px` // CSSOM (strict CSP)
    box.style.left = `${Math.round(Math.max(8, Math.min(at.left, vw - w - 8)))}px`
  }

  const onBlur = () => setTimeout(() => !view.hasFocus() && hide(), 0)
  view.dom.addEventListener('blur', onBlur)
  update()
  return {
    update,
    destroy() {
      cancel()
      view.dom.removeEventListener('blur', onBlur)
      hide()
      box.remove()
    },
  }
}
