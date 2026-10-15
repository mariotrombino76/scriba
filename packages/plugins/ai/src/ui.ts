import type { MessageKey } from '@scriba/i18n'
import { createIcon } from '@scriba/ui'
import type { EditorView, PluginView } from '@scriba/view'
import { defaultAiActions, retryRequest, runAi, stopAi, type AiOptions } from './run.js'
import { acceptPending, discardPending, getPending } from './session.js'

let ids = 0
const menus = new WeakMap<EditorView, HTMLElement>()

/** Places a fixed element under (or above) a document position. */
function placeNear(view: EditorView, el: HTMLElement, pos: number): void {
  const at = view.coordsAtPos(Math.min(pos, view.state.doc.content.size))
  const win = view.document.defaultView
  const vh = win?.innerHeight ?? 0
  const vw = win?.innerWidth ?? 0
  let top = at.bottom + 6
  if (vh && top + el.offsetHeight > vh - 8) top = Math.max(8, at.top - el.offsetHeight - 6)
  el.style.top = `${Math.round(top)}px` // CSSOM (strict CSP)
  el.style.left = `${Math.round(Math.max(8, Math.min(at.left, vw - el.offsetWidth - 8)))}px`
}

export function closeAiMenu(view: EditorView, focusEditor = true): void {
  const menu = menus.get(view)
  if (!menu) return
  menu.remove()
  menus.delete(view)
  if (focusEditor) view.focus()
}

/**
 * The assistant's menu (non-modal, next to the selection): a free prompt and
 * the actions. Nothing is sent until the user picks one (§5.9).
 */
export function openAiMenu(view: EditorView, options: AiOptions): void {
  if (getPending(view.state) || !view.editable) return
  closeAiMenu(view, false)
  const doc = view.document
  const t = options.t
  const id = `scriba-ai-${++ids}`
  const menu = doc.createElement('div')
  menu.className = 'scriba-ai-menu'
  menu.setAttribute('role', 'dialog')
  menu.setAttribute('aria-labelledby', `${id}-title`)
  const title = doc.createElement('h2')
  title.id = `${id}-title`
  title.className = 'scriba-ai-title'
  title.textContent = t('ai.title')

  const form = doc.createElement('form')
  const input = doc.createElement('input')
  input.type = 'text'
  input.setAttribute('aria-label', t('ai.prompt'))
  input.placeholder = t('ai.prompt')
  input.maxLength = 2000
  const send = doc.createElement('button')
  send.type = 'submit'
  send.textContent = t('ai.send')
  form.append(input, send)
  const empty = view.state.selection.empty
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const prompt = input.value.trim()
    if (!prompt) return
    closeAiMenu(view)
    void runAi(view, options, { action: 'custom', prompt, mode: empty ? 'cursor' : 'replace' })
  })

  const list = doc.createElement('div')
  list.className = 'scriba-ai-actions'
  list.setAttribute('role', 'group')
  list.setAttribute('aria-label', t('ai.actions'))
  const buttons: HTMLButtonElement[] = []
  for (const a of options.actions ?? defaultAiActions) {
    const b = doc.createElement('button')
    b.type = 'button'
    if (a.icon) b.appendChild(createIcon(doc, a.icon, 16))
    b.append(a.label(t))
    const disabled = !!a.needsSelection && empty
    b.disabled = disabled
    if (disabled) b.title = t('ai.needsSelection')
    b.addEventListener('click', () => {
      closeAiMenu(view)
      void runAi(view, options, { action: a.id, mode: a.mode })
    })
    list.appendChild(b)
    buttons.push(b)
  }
  const note = doc.createElement('p')
  note.className = 'scriba-ai-note'
  note.textContent = t('ai.privacy')

  menu.append(title, form, list, note)
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeAiMenu(view)
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target !== input) {
      // arrows move between the actions
      const enabled = buttons.filter((b) => !b.disabled)
      const i = enabled.indexOf(e.target as HTMLButtonElement)
      if (i < 0) return
      e.preventDefault()
      enabled[(i + (e.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]!.focus()
    }
  })
  menu.addEventListener('focusout', () =>
    setTimeout(() => {
      if (menus.get(view) === menu && !menu.contains(doc.activeElement)) closeAiMenu(view, false)
    }, 0),
  )
  doc.body.appendChild(menu)
  menus.set(view, menu)
  placeNear(view, menu, view.state.selection.to)
  input.focus()
}

const STATUS: Record<string, MessageKey> = {
  streaming: 'ai.streaming',
  done: 'ai.done',
  stopped: 'ai.stopped',
  error: 'ai.error',
}

/** The bar under a pending answer: status (live region), Stop / Accept / Discard / Try again. */
export function aiBarView(view: EditorView, options: AiOptions): PluginView {
  const doc = view.document
  const t = options.t
  const bar = doc.createElement('div')
  bar.className = 'scriba-ai-bar'
  bar.setAttribute('role', 'group')
  bar.setAttribute('aria-label', t('ai.title'))
  bar.hidden = true
  const status = doc.createElement('span')
  status.className = 'scriba-ai-status'
  status.setAttribute('role', 'status')
  const button = (key: MessageKey, onClick: () => void) => {
    const b = doc.createElement('button')
    b.type = 'button'
    b.textContent = t(key)
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', onClick)
    return b
  }
  const stop = button('ai.stop', () => stopAi(view))
  const accept = button('ai.accept', () => {
    acceptPending(view)
    view.focus()
  })
  const discard = button('ai.discard', () => {
    discardPending(view)
    view.focus()
  })
  const retry = button('ai.retry', () => {
    const request = retryRequest(view)
    if (!request) return
    discardPending(view)
    void runAi(view, options, request)
  })
  accept.classList.add('scriba-ai-primary')
  bar.append(status, stop, accept, discard, retry)
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    if (getPending(view.state)?.status === 'streaming') stopAi(view)
    else {
      discardPending(view)
      view.focus()
    }
  })
  doc.body.appendChild(bar)

  let last = ''
  const update = () => {
    const p = getPending(view.state)
    if (!p) {
      if (!bar.hidden && bar.contains(doc.activeElement)) view.focus()
      bar.hidden = true
      last = ''
      return
    }
    const streaming = p.status === 'streaming'
    stop.hidden = !streaming
    accept.hidden = streaming || p.status === 'error'
    discard.hidden = streaming
    retry.hidden = streaming
    const text = t(STATUS[p.status]!)
    if (status.textContent !== text) status.textContent = text
    bar.hidden = false
    placeNear(view, bar, p.to)
    // when the answer is complete, the focus goes to the choices
    if (p.status !== last && !streaming) (p.status === 'error' ? retry : accept).focus()
    else if (p.status !== last && streaming && !last) stop.focus()
    last = p.status
  }
  update()
  return {
    update,
    destroy() {
      stopAi(view)
      bar.remove()
      closeAiMenu(view, false)
    },
  }
}
