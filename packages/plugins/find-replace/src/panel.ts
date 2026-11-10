import { CLOSE_HISTORY, TextSelection, type Transaction } from '@scriba-editor/core'
import type { MessageKey, Translate } from '@scriba-editor/i18n'
import { createIcon } from '@scriba-editor/ui'
import type { EditorView } from '@scriba-editor/view'
import { SearchRunner, type SearchOutcome, type SearchRunnerOptions } from './runner.js'
import { expandReplacement, type SearchQuery } from './search.js'
import { blockTexts, findKey, getFindState, toMatches, type FindState } from './state.js'

export type FindReplaceOptions = SearchRunnerOptions

const panels = new WeakMap<EditorView, FindPanel>()

/** Opens (or focuses) the find and replace panel of a view. */
export function openFindPanel(
  view: EditorView,
  t: Translate,
  options: FindReplaceOptions = {},
): FindPanel {
  let panel = panels.get(view)
  if (!panel) {
    panel = new FindPanel(view, t, options)
    panels.set(view, panel)
  }
  panel.open()
  return panel
}

let ids = 0

/**
 * Find and replace panel: a non-modal dialog (the document stays visible and
 * editable), matches highlighted in the text. Enter / Shift+Enter: next /
 * previous; Escape closes and selects the current match in the editor.
 */
export class FindPanel {
  readonly el: HTMLDialogElement
  private readonly find: HTMLInputElement
  private readonly replace: HTMLInputElement
  private readonly status: HTMLElement
  private readonly options: Record<'caseSensitive' | 'wholeWord' | 'regex', HTMLInputElement>
  private readonly replaceButtons: HTMLButtonElement[]
  private readonly runner: SearchRunner
  private timer: ReturnType<typeof setTimeout> | undefined
  private searchedDoc: unknown = null
  private unsubscribe: (() => void) | null = null
  private message: MessageKey | null = null

  constructor(
    private readonly view: EditorView,
    private readonly t: Translate,
    options: FindReplaceOptions,
  ) {
    this.runner = new SearchRunner(options)
    const doc = view.document
    const id = `scriba-find-${++ids}`
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
      const e = doc.createElement(tag)
      if (cls) e.className = cls
      return e
    }
    const button = (key: MessageKey, onClick: () => void, icon?: 'close') => {
      const b = el('button')
      b.type = 'button'
      if (icon) {
        b.appendChild(createIcon(doc, icon, 16))
        b.setAttribute('aria-label', t(key))
        b.title = t(key)
      } else b.textContent = t(key)
      b.addEventListener('click', onClick)
      return b
    }
    const field = (key: MessageKey) => {
      const input = el('input')
      input.type = 'text'
      input.spellcheck = false
      input.autocomplete = 'off'
      const label = el('label', 'scriba-find-field')
      const text = el('span')
      text.textContent = t(key)
      label.append(text, input)
      return { label, input }
    }
    const check = (key: MessageKey) => {
      const input = el('input')
      input.type = 'checkbox'
      const label = el('label', 'scriba-check')
      label.append(input, t(key))
      input.addEventListener('change', () => this.schedule(0))
      return { label, input }
    }

    this.el = el('dialog', 'scriba-find-panel')
    this.el.setAttribute('aria-labelledby', `${id}-title`)
    const title = el('h2', 'scriba-find-title')
    title.id = `${id}-title`
    title.textContent = t('find.title')
    const close = button('find.close', () => this.close(), 'close')
    close.classList.add('scriba-find-close')

    const find = field('find.find')
    const replace = field('find.replace')
    this.find = find.input
    this.replace = replace.input
    this.status = el('p', 'scriba-find-status')
    this.status.id = `${id}-status`
    this.status.setAttribute('role', 'status') // polite live region: "3 of 12"
    this.find.setAttribute('aria-describedby', this.status.id)

    const caseSensitive = check('find.caseSensitive')
    const wholeWord = check('find.wholeWord')
    const regex = check('find.regex')
    this.options = {
      caseSensitive: caseSensitive.input,
      wholeWord: wholeWord.input,
      regex: regex.input,
    }
    const opts = el('div', 'scriba-find-options')
    opts.append(caseSensitive.label, wholeWord.label, regex.label)

    const nav = el('div', 'scriba-find-actions')
    nav.append(
      button('find.previous', () => this.move(-1)),
      button('find.next', () => this.move(1)),
    )
    const replaceOne = button('find.replaceOne', () => void this.replaceCurrent())
    const replaceAll = button('find.replaceAll', () => void this.replaceAll())
    this.replaceButtons = [replaceOne, replaceAll]
    const rep = el('div', 'scriba-find-actions')
    rep.append(replaceOne, replaceAll)

    this.el.append(title, close, find.label, this.status, opts, nav, replace.label, rep)

    this.find.addEventListener('input', () => this.schedule(150))
    this.find.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      this.move(e.shiftKey ? -1 : 1)
    })
    this.replace.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      void this.replaceCurrent()
    })
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
      }
    })
    this.el.addEventListener('cancel', (e) => e.preventDefault())
    doc.body.appendChild(this.el)
  }

  get isOpen(): boolean {
    return this.el.open
  }

  open(): void {
    const { state } = this.view
    const { from, to, empty } = state.selection
    // the selected text (one line) becomes the search
    if (!empty && state.doc.resolve(from).sameParent(state.doc.resolve(to))) {
      this.find.value = state.doc.textBetween(from, to).slice(0, 500)
    }
    if (!this.el.open) {
      this.el.show()
      this.unsubscribe = this.view.subscribe(() => {
        if (this.view.state.doc !== this.searchedDoc) this.schedule(250)
        this.updateButtons()
      })
    }
    this.updateButtons()
    this.find.focus()
    this.find.select()
    this.schedule(0)
  }

  close(): void {
    if (!this.el.open) return
    clearTimeout(this.timer)
    this.unsubscribe?.()
    this.unsubscribe = null
    const { matches, current } = getFindState(this.view.state)
    const match = matches[current]
    const tr = this.view.state.tr.setMeta(findKey, { matches: [], current: -1 } satisfies FindState)
    if (match) tr.setSelection(TextSelection.create(tr.doc, match.from, match.to))
    this.view.dispatch(tr)
    this.el.close()
    this.view.focus()
  }

  private query(): SearchQuery {
    return {
      text: this.find.value,
      regex: this.options.regex.checked,
      caseSensitive: this.options.caseSensitive.checked,
      wholeWord: this.options.wholeWord.checked,
    }
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.search(), delay)
  }

  /** Runs the search; the current match is the first one after the cursor (or `keep`). */
  private async search(keep?: number): Promise<void> {
    const state = this.view.state
    const { starts, texts } = blockTexts(state.doc)
    const outcome: SearchOutcome = await this.runner.run(texts, this.query())
    if (outcome === 'cancelled' || this.view.state.doc !== state.doc) return // a newer search follows
    this.searchedDoc = state.doc
    let next: FindState = { matches: [], current: -1 }
    this.message = null
    if (outcome === 'timeout') this.message = 'find.error.timeout'
    else if (outcome === 'unsupported') this.message = 'find.error.unsupported'
    else if (outcome === 'invalid') this.message = 'find.error.invalid'
    else if (outcome === 'tooLong') this.message = 'find.error.tooLong'
    else if (outcome && outcome !== 'empty') {
      const matches = toMatches(outcome.matches, starts)
      let current = keep ?? matches.findIndex((m) => m.from >= state.selection.from)
      if (current < 0 || current >= matches.length) current = matches.length ? 0 : -1
      next = { matches, current }
      if (outcome.truncated) this.message = 'find.truncated'
    }
    this.view.dispatch(this.view.state.tr.setMeta(findKey, next))
    this.render()
  }

  private move(dir: 1 | -1): void {
    const { matches, current } = getFindState(this.view.state)
    if (!matches.length) return
    const next = (current + dir + matches.length) % matches.length
    this.view.dispatch(this.view.state.tr.setMeta(findKey, { matches, current: next }))
    this.render()
  }

  private async replaceCurrent(): Promise<void> {
    if (!this.view.editable) return
    const { matches, current } = getFindState(this.view.state)
    const match = matches[current]
    if (!match) return
    const state = this.view.state
    const text = expandReplacement(
      this.replace.value,
      state.doc.textBetween(match.from, match.to),
      match.groups,
      this.options.regex.checked,
    )
    this.view.dispatch(this.edit(state.tr.insertText(text, match.from, match.to)))
    await this.search(current) // the next match takes its place
  }

  private async replaceAll(): Promise<void> {
    if (!this.view.editable) return
    const { matches } = getFindState(this.view.state)
    if (!matches.length) return
    const state = this.view.state
    const tr = state.tr
    // from the end, so earlier positions stay valid; one undo step
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i]!
      const text = expandReplacement(
        this.replace.value,
        state.doc.textBetween(m.from, m.to),
        m.groups,
        this.options.regex.checked,
      )
      tr.insertText(text, m.from, m.to)
    }
    this.view.dispatch(this.edit(tr))
    const count = matches.length
    await this.search()
    this.status.textContent = this.t('find.replaced', { count })
  }

  /** Replacements are their own undo step, never merged with typing. */
  private edit(tr: Transaction): Transaction {
    return tr.setMeta(CLOSE_HISTORY, true)
  }

  private updateButtons(): void {
    for (const b of this.replaceButtons) b.disabled = !this.view.editable
    this.replace.readOnly = !this.view.editable
  }

  private render(): void {
    const { matches, current } = getFindState(this.view.state)
    const t = this.t
    let text = ''
    if (this.message && this.message !== 'find.truncated') text = t(this.message)
    else if (!this.find.value) text = ''
    else if (!matches.length) text = t('find.none')
    else text = t('find.position', { current: current + 1, total: matches.length })
    if (this.message === 'find.truncated') text += ` ${t('find.truncated')}`
    this.status.textContent = text
    if (this.message && this.message !== 'find.truncated')
      this.find.setAttribute('aria-invalid', 'true')
    else this.find.removeAttribute('aria-invalid')
    // bring the current match into view (inside the editor's scroll container)
    const win = this.view.document.defaultView
    win?.requestAnimationFrame(() => {
      this.view.dom.querySelector('.scriba-find-current')?.scrollIntoView({ block: 'nearest' })
    })
  }

  destroy(): void {
    this.close()
    this.runner.dispose()
    this.el.remove()
    panels.delete(this.view)
  }
}
