import { TextSelection } from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import { openDialog, type DialogHandle } from '@scriba-editor/ui'
import type { EditorView } from '@scriba-editor/view'
import {
  addComment,
  commentsKey,
  deleteThread,
  focusThread,
  getComments,
  threadRange,
} from './comments.js'
import type { CommentStore, CommentThread } from './store.js'
import { listSuggestions, resolveSuggestion } from './suggestions.js'
import { MAX_COMMENT_LENGTH } from './store.js'

export interface CommentsPanelOptions {
  store: CommentStore
  t: Translate
  /** Where the panel goes (e.g. a sidebar next to the editor). */
  container: HTMLElement
  /** Locale for dates (default: the page language). */
  locale?: string
}

let ids = 0

/** Dialog to write a new comment on the selected text. */
export function openCommentDialog(
  view: EditorView,
  store: CommentStore,
  t: Translate,
): DialogHandle | null {
  if (view.state.selection.empty || !view.canAnnotate) return null
  return openDialog(view.document, {
    title: t('comments.new'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const doc = view.document
      const id = `scriba-comment-new-${++ids}`
      const label = doc.createElement('label')
      label.htmlFor = id
      label.textContent = t('comments.text')
      const area = doc.createElement('textarea')
      area.id = id
      area.rows = 4
      area.maxLength = MAX_COMMENT_LENGTH
      area.className = 'scriba-comment-input'
      const error = doc.createElement('p')
      error.className = 'scriba-dialog-error'
      error.setAttribute('aria-live', 'polite')
      const actions = doc.createElement('div')
      actions.className = 'scriba-dialog-actions'
      const cancel = doc.createElement('button')
      cancel.type = 'button'
      cancel.textContent = t('comments.cancel')
      cancel.addEventListener('click', () => handle.close())
      const save = doc.createElement('button')
      save.type = 'submit'
      save.textContent = t('comments.add')
      actions.append(cancel, save)
      form.append(label, area, error, actions)
      form.addEventListener('submit', async (e) => {
        e.preventDefault()
        if (!area.value.trim()) {
          area.setAttribute('aria-invalid', 'true')
          error.textContent = t('comments.empty')
          area.focus()
          return
        }
        save.disabled = true
        try {
          await addComment(view, store, area.value)
          handle.close()
        } catch {
          save.disabled = false
          error.textContent = t('comments.failed')
        }
      })
      queueMicrotask(() => area.focus())
    },
  })
}

/**
 * The comments sidebar: open threads (and resolved ones on request), each
 * with its quoted text, entries (author and date given by the store), a
 * reply box and actions. Everything user-written is shown as text.
 */
export function commentsPanel(
  view: EditorView,
  options: CommentsPanelOptions,
): { el: HTMLElement; destroy(): void } {
  const { store, t, container } = options
  const doc = view.document
  const locale = options.locale ?? (doc.documentElement.lang || undefined)
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' })
  const el = doc.createElement('section')
  el.className = 'scriba-comments'
  const titleId = `scriba-comments-${++ids}`
  el.setAttribute('aria-labelledby', titleId)
  const title = doc.createElement('h2')
  title.id = titleId
  title.textContent = t('comments.title')
  const showResolved = doc.createElement('input')
  showResolved.type = 'checkbox'
  const filter = doc.createElement('label')
  filter.className = 'scriba-check'
  filter.append(showResolved, t('comments.showResolved'))
  const empty = doc.createElement('p')
  empty.className = 'scriba-comments-empty'
  empty.textContent = t('comments.none')
  const list = doc.createElement('ol')
  list.className = 'scriba-thread-list'
  // suggested changes (track changes): one entry per proposal, with its author
  const suggestions = doc.createElement('div')
  suggestions.className = 'scriba-suggestions'
  const sTitle = doc.createElement('h3')
  sTitle.textContent = t('suggest.title')
  const all = doc.createElement('div')
  all.className = 'scriba-thread-actions'
  const acceptAll = doc.createElement('button')
  acceptAll.type = 'button'
  acceptAll.textContent = t('suggest.acceptAll')
  const rejectAll = doc.createElement('button')
  rejectAll.type = 'button'
  rejectAll.textContent = t('suggest.rejectAll')
  all.append(acceptAll, rejectAll)
  const sList = doc.createElement('ul')
  sList.className = 'scriba-suggestion-list'
  suggestions.append(sTitle, all, sList)
  const settle = (id: string | null, accept: boolean) => {
    if (!view.editable) return // accepting or rejecting changes the text
    const ids = id ? [id] : listSuggestions(view.state.doc).map((x) => x.id)
    resolveSuggestion(view, id, accept)
    for (const x of ids) void store.setResolved(x, true).catch(() => undefined) // keep the record
    view.focus()
  }
  acceptAll.classList.add('scriba-needs-edit')
  rejectAll.classList.add('scriba-needs-edit')
  acceptAll.addEventListener('click', () => settle(null, true))
  rejectAll.addEventListener('click', () => settle(null, false))
  el.append(title, filter, empty, list, suggestions)
  container.appendChild(el)

  const renderSuggestions = () => {
    const found = view.state.schema.marks['suggest_insert'] ? listSuggestions(view.state.doc) : []
    suggestions.hidden = !found.length
    sList.replaceChildren()
    const threads = getComments(view.state).threads
    for (const sug of found) {
      const li = doc.createElement('li')
      li.className = 'scriba-suggestion'
      const who = doc.createElement('strong')
      who.textContent = threads.find((th) => th.id === sug.id)?.author.name ?? '…' // from the store
      const what = doc.createElement('button')
      what.type = 'button'
      what.className = 'scriba-thread-quote'
      const short = (x: string) => (x.length > 60 ? `${x.slice(0, 60)}…` : x)
      what.textContent =
        sug.inserted && sug.deleted
          ? t('suggest.replace', { old: short(sug.deleted), text: short(sug.inserted) })
          : sug.inserted
            ? t('suggest.insert', { text: short(sug.inserted) })
            : t('suggest.delete', { text: short(sug.deleted) })
      what.addEventListener('click', () => {
        const at = Math.min(sug.from, view.state.doc.content.size)
        view.dispatch(
          view.state.tr
            .setSelection(TextSelection.near(view.state.doc.resolve(at)))
            .scrollIntoView(),
        )
        view.focus()
      })
      const accept = doc.createElement('button')
      accept.type = 'button'
      accept.textContent = t('suggest.accept')
      accept.addEventListener('click', () => settle(sug.id, true))
      const reject = doc.createElement('button')
      reject.type = 'button'
      reject.textContent = t('suggest.reject')
      reject.addEventListener('click', () => settle(sug.id, false))
      const actions = doc.createElement('div')
      actions.className = 'scriba-thread-actions'
      accept.classList.add('scriba-needs-edit')
      reject.classList.add('scriba-needs-edit')
      actions.append(accept, reject)
      li.append(who, ' ', what, actions)
      sList.appendChild(li)
    }
  }

  const items = new Map<string, { li: HTMLLIElement; thread: CommentThread }>()
  const message = doc.createElement('p')
  message.className = 'scriba-visually-hidden'
  message.setAttribute('role', 'status')
  el.appendChild(message)
  const fail = () => (message.textContent = t('comments.failed'))

  /** The commented text, as it is now. */
  const quoteOf = (id: string) => {
    const range = threadRange(view.state.doc, id)
    return range
      ? `“${view.state.doc.textBetween(range.from, range.to, ' ').slice(0, 120)}”`
      : t('comments.orphan')
  }

  const renderThread = (thread: CommentThread): HTMLLIElement => {
    const li = doc.createElement('li')
    li.className = 'scriba-thread'
    li.dataset['thread'] = thread.id
    const article = doc.createElement('article')
    const first = thread.comments[0]
    article.setAttribute(
      'aria-label',
      first ? t('comments.by', { name: first.author.name }) : t('comments.title'),
    )
    const quote = doc.createElement('button')
    quote.type = 'button'
    quote.className = 'scriba-thread-quote'
    quote.textContent = quoteOf(thread.id)
    quote.title = t('comments.goTo')
    quote.addEventListener('click', () => {
      focusThread(view, thread.id)
      view.focus()
    })
    article.appendChild(quote)
    for (const c of thread.comments) {
      const entry = doc.createElement('div')
      entry.className = 'scriba-comment-entry'
      const head = doc.createElement('p')
      head.className = 'scriba-comment-head'
      const who = doc.createElement('strong')
      who.textContent = c.author.name // text only
      const when = doc.createElement('time')
      when.dateTime = new Date(c.createdAt).toISOString()
      when.textContent = dates.format(c.createdAt)
      head.append(who, ' ', when)
      const body = doc.createElement('p')
      body.className = 'scriba-comment-text'
      body.textContent = c.text // text only, never HTML
      entry.append(head, body)
      if (store.userId && c.author.id === store.userId && thread.comments.length > 1) {
        const del = doc.createElement('button')
        del.type = 'button'
        del.className = 'scriba-comment-delete scriba-needs-comment'
        del.textContent = t('comments.deleteOne')
        del.addEventListener('click', () => void store.deleteComment(thread.id, c.id).catch(fail))
        entry.appendChild(del)
      }
      article.appendChild(entry)
    }
    // reply
    const form = doc.createElement('form')
    form.className = 'scriba-comment-reply'
    const area = doc.createElement('textarea')
    area.rows = 2
    area.maxLength = MAX_COMMENT_LENGTH
    area.setAttribute('aria-label', t('comments.reply'))
    area.placeholder = t('comments.reply')
    area.className = 'scriba-comment-input'
    const send = doc.createElement('button')
    send.type = 'submit'
    send.textContent = t('comments.send')
    area.classList.add('scriba-needs-comment')
    send.classList.add('scriba-needs-comment')
    form.append(area, send)
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      if (!area.value.trim() || !view.canAnnotate) return
      const text = area.value
      area.value = ''
      void store.reply(thread.id, text).catch(() => {
        area.value = text
        fail()
      })
    })
    const actions = doc.createElement('div')
    actions.className = 'scriba-thread-actions'
    const resolve = doc.createElement('button')
    resolve.type = 'button'
    resolve.textContent = t(thread.resolved ? 'comments.reopen' : 'comments.resolve')
    resolve.addEventListener(
      'click',
      () => void store.setResolved(thread.id, !thread.resolved).catch(fail),
    )
    const remove = doc.createElement('button')
    remove.type = 'button'
    remove.textContent = t('comments.delete')
    remove.addEventListener('click', () => void deleteThread(view, store, thread.id).catch(fail))
    resolve.classList.add('scriba-needs-comment')
    remove.classList.add('scriba-needs-comment')
    actions.append(resolve, remove)
    article.append(form, actions)
    li.appendChild(article)
    return li
  }

  const render = () => {
    const { threads, active } = getComments(view.state)
    const shown = threads.filter(
      (th) => th.kind === 'comment' && (showResolved.checked || !th.resolved),
    )
    const keep = new Set(shown.map((th) => th.id))
    for (const [id, item] of items)
      if (!keep.has(id)) {
        item.li.remove()
        items.delete(id)
      }
    // keep the document order of the anchors
    const order = shown
      .map((th) => ({
        th,
        at: threadRange(view.state.doc, th.id)?.from ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.at - b.at)
    let prev: HTMLLIElement | null = null
    for (const { th } of order) {
      let item = items.get(th.id)
      if (!item || item.thread !== th) {
        // rebuilt only when the thread changed; a reply being typed survives other updates
        const draft = item?.li.querySelector('textarea')?.value ?? ''
        const focused = !!item && item.li.contains(doc.activeElement)
        const li = renderThread(th)
        const area = li.querySelector('textarea')!
        area.value = draft
        if (item) item.li.replaceWith(li)
        item = { li, thread: th }
        items.set(th.id, item)
        if (focused) area.focus()
      }
      const quote = item.li.querySelector('.scriba-thread-quote')!
      const text = quoteOf(th.id)
      if (quote.textContent !== text) quote.textContent = text
      item.li.classList.toggle('scriba-thread-active', th.id === active)
      item.li.classList.toggle('scriba-thread-resolved', th.resolved)
      if (prev ? prev.nextSibling !== item.li : list.firstChild !== item.li) {
        if (prev) prev.after(item.li)
        else list.prepend(item.li)
      }
      prev = item.li
    }
    empty.hidden = shown.length > 0
    renderSuggestions()
    applyPermissions()
  }

  /** Readers see everything; commenters may comment; only editors accept or reject changes. */
  const applyPermissions = () => {
    for (const b of el.querySelectorAll<HTMLButtonElement | HTMLTextAreaElement>(
      '.scriba-needs-edit',
    ))
      b.disabled = !view.editable
    for (const b of el.querySelectorAll<HTMLButtonElement | HTMLTextAreaElement>(
      '.scriba-needs-comment',
    ))
      b.disabled = !view.canAnnotate
  }

  let lastState: unknown = null
  let lastDoc: unknown = null
  let frame = 0
  const win = doc.defaultView
  const later = () => {
    frame = 0
    lastDoc = view.state.doc
    render()
  }
  const unsubscribe = view.subscribe(() => {
    applyPermissions() // e.g. the editor became read-only
    const s = getComments(view.state)
    if (s === lastState) {
      // the text changed: quotes and order follow, once per frame
      if (view.state.doc !== lastDoc && !frame && win) frame = win.requestAnimationFrame(later)
      return
    }
    lastState = s
    lastDoc = view.state.doc
    render()
    const active = s.active ? items.get(s.active) : undefined
    active?.li.scrollIntoView?.({ block: 'nearest' })
  })
  showResolved.addEventListener('change', render)
  view.dispatch(view.state.tr.setMeta(commentsKey, {}))
  render()
  return {
    el,
    destroy() {
      unsubscribe()
      el.remove()
    },
  }
}
