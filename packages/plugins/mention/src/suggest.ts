import {
  CLOSE_HISTORY,
  Plugin,
  PluginKey,
  type Command,
  type EditorState,
  type KeyBindings,
  type Transaction,
} from '@scriba/core'
import type { EditorView, PluginView, ViewPluginProps } from '@scriba/view'

/** An entry of a suggestion list (from your source: checked by `clean`). */
export interface SuggestItem {
  readonly label: string
  /** Extra line in the list; never inserted in the text. */
  readonly detail?: string
}

export interface SuggestState<I extends SuggestItem = SuggestItem> {
  active: boolean
  /** Position of the trigger ("@", "{{") that opened the list. */
  from: number
  query: string
  /** Highlighted entry. */
  index: number
  /** Last results received (they stay visible while the next search runs). */
  results: readonly I[]
  /** Query of `results`; differs from `query` while a search is pending. */
  resultsFor: string | null
  /** The last search failed. */
  error: boolean
}

/** Finds entries for a query (`""` right after the trigger); `signal` aborts when it is stale. */
export type SuggestSearch<I> = (
  query: string,
  signal: AbortSignal,
) => Promise<readonly I[]> | readonly I[]

export interface SuggestConfig<I extends SuggestItem> {
  /** Plugin key name (one per kind of suggestion); also prefixes the list's DOM ids. */
  readonly name: string
  /** A key made by the caller (to read the state without the instance), else a new one. */
  readonly key?: PluginKey<SuggestState<I>>
  /** Text that opens the list ("@", "{{"). */
  readonly trigger: string
  /** Extra condition to open at `from` (node allowed there, not in code…). */
  canOpen(state: EditorState, from: number): boolean
  /** Whether the text typed after the trigger is still a query (else the list closes). */
  isQuery(query: string): boolean
  /** Keeps only well-formed entries, at most `max` (the source is outside the editor). */
  clean(raw: unknown, max: number): I[]
  /** Replaces trigger + query, [from, to), with the chosen entry. */
  insert(state: EditorState, from: number, to: number, item: I): Transaction | null
  search: SuggestSearch<I>
  /** Accessible name of the list and status messages (already translated). */
  readonly texts: { list: string; loading: string; none: string; error: string }
  /** Extra class of the list (styling). */
  readonly className?: string
  debounce?: number
  maxResults?: number
  timeout?: number
}

export interface Suggestion<I extends SuggestItem> {
  readonly key: PluginKey<SuggestState<I>>
  readonly plugin: Plugin<SuggestState<I>>
  getState(state: EditorState): SuggestState<I>
  close(tr: Transaction): Transaction
  choose(view: EditorView, item: I): boolean
  /** Arrows move, Enter or Tab choose, Escape closes; a space after a query with no results closes. */
  keymap(): KeyBindings
}

const CLOSED: SuggestState<never> = {
  active: false,
  from: 0,
  query: '',
  index: 0,
  results: [],
  resultsFor: null,
  error: false,
}
export const MAX_QUERY = 50

/** A search is still running for the current query. */
export function isLoading(s: SuggestState): boolean {
  return s.active && s.resultsFor !== s.query
}

let ids = 0

/**
 * A suggestion list opened by typing a trigger: the list is a listbox under
 * the trigger while the focus stays in the text (`aria-controls`,
 * `aria-activedescendant` on the editor). Searches run one at a time: a newer
 * query aborts the older one, late answers are ignored; results are shown as
 * text only. Used by mentions ("@") and merge tags ("{{").
 */
export function createSuggestion<I extends SuggestItem>(config: SuggestConfig<I>): Suggestion<I> {
  const key = config.key ?? new PluginKey<SuggestState<I>>(config.name)
  const closed = CLOSED as SuggestState<I>
  const trigger = config.trigger
  const getState = (state: EditorState) => key.getState(state) ?? closed
  const close = (tr: Transaction) => tr.setMeta(key, closed)

  /** The trigger + query still there and the cursor right after it? Otherwise the list closes. */
  const stillValid = (state: EditorState, s: SuggestState<I>): SuggestState<I> => {
    const { selection, doc } = state
    if (!selection.empty || s.from >= doc.content.size) return closed
    const head = selection.head
    if (head < s.from + trigger.length || !doc.resolve(s.from).sameParent(selection.$head))
      return closed
    if (doc.textBetween(s.from, s.from + trigger.length) !== trigger) return closed
    const query = doc.textBetween(s.from + trigger.length, head, '\n', '\n')
    if (query.includes('\n') || query.length > MAX_QUERY || !config.isQuery(query)) return closed
    return { ...s, query, index: query === s.query ? s.index : 0 }
  }

  /** Opens when the last character of the trigger is typed right after the rest of it. */
  const openOnTrigger = (view: EditorView, from: number, to: number, text: string): boolean => {
    if (text !== trigger.slice(-1) || from !== to) return false
    const state = view.state
    const $pos = state.doc.resolve(from)
    if (!$pos.parent.inlineContent || $pos.parent.type.spec.code) return false
    if ($pos.marks().some((m) => m.type.name === 'code')) return false
    const head = trigger.slice(0, -1)
    const start = from - head.length
    if (head && ($pos.parentOffset < head.length || state.doc.textBetween(start, from) !== head))
      return false
    if (!config.canOpen(state, start)) return false
    const tr = state.tr.insertText(text, from, to)
    view.dispatch(tr.setMeta(key, { ...closed, active: true, from: start, resultsFor: null }))
    return true
  }

  const choose = (view: EditorView, item: I): boolean => {
    const s = getState(view.state)
    if (!s.active) return false
    const tr = config.insert(view.state, s.from, view.state.selection.head, item)
    if (!tr) return false
    // its own undo step: Ctrl+Z right after brings the typed text back
    view.dispatch(close(tr).setMeta(CLOSE_HISTORY, true).scrollIntoView())
    view.focus()
    return true
  }

  const props: ViewPluginProps = {
    handleTextInput: openOnTrigger,
    pluginView: (view) => menuView(view),
  }
  const plugin = new Plugin<SuggestState<I>>({
    key,
    state: {
      init: () => closed,
      apply(tr, value, _old, state) {
        const meta = tr.getMeta<SuggestState<I>>(key)
        if (meta) return meta
        if (!value.active || (!tr.docChanged && !tr.selectionSet)) return value
        return stillValid(state, { ...value, from: tr.mapping.map(value.from, -1) })
      },
    },
    props: { ...props },
  })

  function menuView(view: EditorView): PluginView {
    const debounce = Math.max(0, config.debounce ?? 150)
    const max = Math.min(50, Math.max(1, config.maxResults ?? 8))
    const timeout = Math.max(1, config.timeout ?? 10_000)
    const doc = view.document
    const win = doc.defaultView
    const id = `scriba-${config.name}-${++ids}`

    const box = doc.createElement('div')
    box.className = `scriba-slash-menu${config.className ? ` ${config.className}` : ''}`
    box.hidden = true
    const status = doc.createElement('div')
    status.className = 'scriba-slash-empty'
    status.setAttribute('role', 'status')
    const list = doc.createElement('div')
    list.id = id
    list.setAttribute('role', 'listbox')
    list.setAttribute('aria-label', config.texts.list)
    box.append(list, status)
    doc.body.appendChild(box)

    /** Query (and trigger position) of the search scheduled or running. */
    let wanted: { from: number; query: string } | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | null = null

    const cancel = () => {
      clearTimeout(timer)
      controller?.abort()
      controller = null
      wanted = null
    }

    const deliver = (from: number, query: string, results: I[], error: boolean) => {
      const s = getState(view.state)
      if (!s.active || s.from !== from || s.query !== query) return // an old answer
      view.dispatch(view.state.tr.setMeta(key, { ...s, results, resultsFor: query, error }))
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
      let answer: Promise<readonly I[]>
      try {
        answer = Promise.resolve(config.search(query, current.signal))
      } catch (e) {
        answer = Promise.reject(e)
      }
      answer.then(
        (raw) => {
          clearTimeout(timeLimit)
          if (controller !== current) return
          controller = null
          deliver(from, query, config.clean(raw, max), false)
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
      const s = getState(view.state)
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
        option.id = `${id}-${i}` // never an id of the source: it is not ours to put in the DOM
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
        // keep the focus (and the typed query) in the editor while clicking
        option.addEventListener('mousedown', (e) => e.preventDefault())
        option.addEventListener('click', () => choose(view, item))
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
          : config.texts.loading
        : s.error
          ? config.texts.error
          : shown.length
            ? ''
            : config.texts.none
      if (status.textContent !== text) status.textContent = text
      status.hidden = !text

      view.dom.setAttribute('aria-controls', id)
      box.hidden = false
      // under the trigger (above it when there is no room below), inside the window
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

  const keymap = (): KeyBindings => {
    const move =
      (dir: 1 | -1): Command =>
      (state, dispatch) => {
        const s = getState(state)
        if (!s.active || !s.results.length) return false
        const n = s.results.length
        dispatch?.(state.tr.setMeta(key, { ...s, index: (Math.min(s.index, n - 1) + dir + n) % n }))
        return true
      }
    const pick: Command = (state, dispatch, view) => {
      const s = getState(state)
      if (!s.active || !s.results.length || !view) return false
      if (dispatch) choose(view as EditorView, s.results[Math.min(s.index, s.results.length - 1)]!)
      return true
    }
    const escape: Command = (state, dispatch) => {
      if (!getState(state).active) return false
      dispatch?.(close(state.tr))
      return true
    }
    const space: Command = (state, dispatch) => {
      const s = getState(state)
      if (!s.active || (s.query && (isLoading(s) || s.results.length))) return false
      dispatch?.(close(state.tr))
      return false // the space is typed as usual
    }
    return {
      ArrowDown: move(1),
      ArrowUp: move(-1),
      Enter: pick,
      Tab: pick,
      Escape: escape,
      ' ': space,
    }
  }

  return { key, plugin, getState, close, choose, keymap }
}
