import type { Translate } from '@scriba-editor/i18n'
import { openDialog, type DialogHandle } from '@scriba-editor/ui'
import type { EditorView } from '@scriba-editor/view'
import { countState, countWords, rangeText, type TextCount } from './count.js'

export interface WordCountOptions {
  /** Locale for word boundaries and number format (default: the page language). */
  locale?: string
  /** Idle time (ms) before recounting after a change; keeps typing fast in big documents. Default 300. */
  delay?: number
}

const localeOf = (view: EditorView, options: WordCountOptions) =>
  options.locale || view.document.documentElement.lang || undefined

function wordsLabel(t: Translate, count: number, locale?: string): string {
  const n = new Intl.NumberFormat(locale).format(count)
  return t(count === 1 ? 'wordcount.words.one' : 'wordcount.words.other', { count: n })
}

/**
 * Status bar counter: a button showing the document's words (updated when
 * typing pauses), opening the full count dialog. Put `el` under the editor.
 */
export function createWordCountStatus(
  view: EditorView,
  t: Translate,
  options: WordCountOptions = {},
): { el: HTMLButtonElement; destroy(): void } {
  const doc = view.document
  const el = doc.createElement('button')
  el.type = 'button'
  el.className = 'scriba-word-count'
  el.title = t('wordcount.title')
  let counted = view.state.doc
  let timer: ReturnType<typeof setTimeout> | undefined
  const render = () => {
    counted = view.state.doc
    const locale = localeOf(view, options)
    el.textContent = wordsLabel(t, countWords(rangeText(counted), locale), locale)
  }
  render()
  const unsubscribe = view.subscribe(() => {
    if (view.state.doc === counted) return
    clearTimeout(timer)
    timer = setTimeout(render, options.delay ?? 300)
  })
  el.addEventListener('click', () => openWordCountDialog(view, t, options))
  return {
    el,
    destroy() {
      clearTimeout(timer)
      unsubscribe()
      el.remove()
    },
  }
}

/** Dialog with words and characters of the document and of the selection. */
export function openWordCountDialog(
  view: EditorView,
  t: Translate,
  options: WordCountOptions = {},
): DialogHandle {
  const doc = view.document
  const locale = localeOf(view, options)
  const counts = countState(view.state, locale)
  const fmt = new Intl.NumberFormat(locale)
  return openDialog(doc, {
    title: t('wordcount.title'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const table = doc.createElement('table')
      table.className = 'scriba-count-table'
      const head = table.createTHead().insertRow()
      // the empty corner is a data cell: an empty header would name nothing
      head.appendChild(doc.createElement('td'))
      for (const key of ['wordcount.document', 'wordcount.selection'] as const) {
        const th = doc.createElement('th')
        th.scope = 'col'
        th.textContent = t(key)
        head.appendChild(th)
      }
      const body = table.createTBody()
      const rows: [Parameters<Translate>[0], keyof TextCount][] = [
        ['wordcount.wordsLabel', 'words'],
        ['wordcount.characters', 'characters'],
        ['wordcount.charactersNoSpaces', 'charactersNoSpaces'],
      ]
      for (const [label, field] of rows) {
        const tr = body.insertRow()
        const th = doc.createElement('th')
        th.scope = 'row'
        th.textContent = t(label)
        tr.appendChild(th)
        tr.insertCell().textContent = fmt.format(counts.document[field])
        tr.insertCell().textContent = counts.selection ? fmt.format(counts.selection[field]) : '—'
      }
      const actions = doc.createElement('div')
      actions.className = 'scriba-dialog-actions'
      const close = doc.createElement('button')
      close.type = 'submit'
      close.textContent = t('wordcount.close')
      actions.appendChild(close)
      form.append(table, actions)
      form.addEventListener('submit', (event) => {
        event.preventDefault()
        handle.close()
      })
      queueMicrotask(() => close.focus())
    },
  })
}
