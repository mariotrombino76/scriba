import { EditorState, Plugin, Selection, type Node } from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import { openDialog, type DialogHandle } from '@scriba/ui'
import { EditorView, type InlineDecoration } from '@scriba/view'
import {
  formatRevisionDate,
  parseRevision,
  type Revision,
  type RevisionOptions,
} from './content.js'
import { diffDocs, type Change, type DocDiff } from './diff.js'

let dialogCount = 0
const announcers = new WeakMap<EditorView, HTMLElement>()

/** Tells screen readers what happened once the dialog is closed (a polite live region). */
function announce(view: EditorView, message: string): void {
  let region = announcers.get(view)
  if (!region) {
    region = view.document.createElement('div')
    region.className = 'scriba-visually-hidden'
    region.setAttribute('role', 'status')
    view.dom.after(region)
    announcers.set(view, region)
  }
  region.textContent = message
}
/** Longest change text read out; the rest is cut with an ellipsis. */
const SAY_LENGTH = 120

/**
 * The "Version history" dialog (TinyMCE's Revision History): the saved
 * versions as a radio list; the selected one in a read-only preview, compared
 * with the current document (what was added since in green, what was removed
 * since struck through in red); Previous / Next change, read out for screen
 * readers; "Restore this version", one undoable step. Versions load when
 * selected; a slow answer for a version no longer selected is ignored.
 */
export function openRevisionDialog(
  view: EditorView,
  t: Translate,
  options: RevisionOptions,
): DialogHandle {
  const doc = view.document
  const id = `scriba-revisions-${++dialogCount}`
  const parsed = new Map<string, Promise<Node>>()
  let preview: EditorView | null = null
  let closed = false
  let focusFirst = () => {}

  const handle = openDialog(doc, {
    title: t('revisions.title'),
    returnFocus: () => {
      closed = true
      preview?.destroy()
      view.focus()
    },
    build(form, handle) {
      handle.dialog.classList.add('scriba-revisions')
      const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
        const e = doc.createElement(tag)
        if (cls) e.className = cls
        return e
      }
      const button = (key: Parameters<Translate>[0], onClick: () => void) => {
        const b = el('button')
        b.type = 'button'
        b.textContent = t(key)
        b.addEventListener('click', onClick)
        return b
      }

      const status = el('p', 'scriba-revisions-status')
      status.setAttribute('role', 'status')
      const body = el('div', 'scriba-revisions-body')
      const list = el('fieldset', 'scriba-radio-group scriba-revisions-list')
      const legend = el('legend')
      legend.textContent = t('revisions.list')
      list.append(legend)

      const side = el('div', 'scriba-revisions-side')
      const compareLabel = el('label', 'scriba-check')
      const compare = el('input')
      compare.type = 'checkbox'
      compare.checked = true
      compareLabel.append(compare, t('revisions.compare'))
      const legendBox = el('p', 'scriba-revisions-legend')
      const ins = el('span', 'scriba-diff-insert')
      ins.textContent = t('revisions.inserted')
      const del = el('span', 'scriba-diff-delete')
      del.textContent = t('revisions.deleted')
      legendBox.append(ins, ' ', del)
      const box = el('div', 'scriba-revisions-preview')
      box.setAttribute('role', 'region')
      box.setAttribute('aria-label', t('revisions.preview'))
      const nav = el('div', 'scriba-revisions-nav')
      const summary = el('span', 'scriba-revisions-summary')
      const prev = button('revisions.prev', () => go(-1))
      const next = button('revisions.next', () => go(1))
      nav.append(summary, prev, next)
      const say = el('p', 'scriba-revisions-current')
      say.setAttribute('aria-live', 'polite')
      side.append(compareLabel, legendBox, box, nav, say)
      body.append(list, side)

      const error = el('p', 'scriba-dialog-error')
      error.setAttribute('role', 'alert')
      const actions = el('div', 'scriba-dialog-actions')
      const close = button('revisions.close', () => handle.close())
      const restore = el('button')
      restore.type = 'submit'
      restore.textContent = t('revisions.restore')
      restore.disabled = true
      actions.append(close, restore)
      form.append(status, body, error, actions)

      // --- Preview ---
      let version: Node | null = null
      let diff: DocDiff | null = null
      let index = -1
      const decorations = (): InlineDecoration[] => {
        if (!diff || !compare.checked) return []
        const current = diff.changes[index]
        return diff.highlights.map((h) => ({
          from: h.from,
          to: h.to,
          class:
            `scriba-diff-${h.kind}` +
            (current && h.from >= current.from && h.to <= current.to ? ' scriba-diff-current' : ''),
        }))
      }
      const decorator = new Plugin({ props: { decorations } })

      const show = () => {
        preview?.destroy()
        preview = null
        box.replaceChildren()
        say.textContent = ''
        index = -1
        nav.hidden = legendBox.hidden = !version || !compare.checked
        restore.disabled = !version || !view.editable
        if (!version) return
        diff = compare.checked ? diffDocs(version, view.state.doc) : null
        preview = new EditorView(box, {
          state: EditorState.create({ doc: diff ? diff.doc : version, plugins: [decorator] }),
          editable: () => false,
          label: t('revisions.preview'),
          ...(view.options.nodeViews ? { nodeViews: view.options.nodeViews } : {}),
        })
        const count = diff?.changes.length ?? 0
        summary.textContent = count ? t('revisions.count', { count }) : t('revisions.none')
        prev.disabled = next.disabled = !count
      }
      compare.addEventListener('change', show)

      const describe = (change: Change, n: number, count: number) => {
        const kind = t(change.kind === 'insert' ? 'revisions.kind.insert' : 'revisions.kind.delete')
        const text = change.text.trim()
        if (!text) return t('revisions.currentEmpty', { n, count, kind })
        const cut = text.length > SAY_LENGTH ? `${text.slice(0, SAY_LENGTH)}…` : text
        return t('revisions.current', { n, count, kind, text: cut })
      }
      const go = (step: 1 | -1) => {
        if (!diff || !preview || !diff.changes.length) return
        const count = diff.changes.length
        index = index < 0 ? (step === 1 ? 0 : count - 1) : (index + step + count) % count
        const change = diff.changes[index]!
        // redraws the decorations and moves the (invisible) selection there for scrolling
        const state = preview.state
        const at = Math.min(change.from + 1, state.doc.content.size)
        preview.dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(at))))
        preview.dom
          .querySelector('.scriba-diff-current')
          ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
        say.textContent = describe(change, index + 1, count)
      }

      // --- Versions ---
      let selection = 0
      const contentOf = (revision: Revision): Promise<Node> => {
        let result = parsed.get(revision.id)
        if (!result) {
          result = options
            .content(revision)
            .then((source) => parseRevision(view.state.schema, source))
          parsed.set(revision.id, result)
          // a failed load can be tried again by selecting the version again
          result.catch(() => parsed.delete(revision.id))
        }
        return result
      }
      const select = (revision: Revision) => {
        const ticket = ++selection
        error.textContent = ''
        version = null
        show()
        status.textContent = t('revisions.loadingVersion')
        contentOf(revision).then(
          (content) => {
            if (closed || ticket !== selection) return
            status.textContent = ''
            version = content
            show()
          },
          () => {
            if (closed || ticket !== selection) return
            status.textContent = ''
            error.textContent = t('revisions.versionError')
          },
        )
      }

      const fill = (revisions: readonly Revision[]) => {
        status.textContent = revisions.length ? '' : t('revisions.empty')
        list.hidden = side.hidden = !revisions.length
        const radios = revisions.map((revision, i) => {
          const radio = el('input')
          radio.type = 'radio'
          radio.name = `${id}-version`
          radio.value = String(i)
          radio.checked = i === 0
          radio.addEventListener('change', () => radio.checked && select(revision))
          const label = el('label', 'scriba-check scriba-revisions-item')
          const text = el('span')
          const date = el('span', 'scriba-revisions-date')
          date.textContent = formatRevisionDate(revision.createdAt, options.locale)
          text.append(date)
          for (const extra of [revision.label, revision.author]) {
            if (!extra) continue
            const span = el('span', 'scriba-revisions-meta')
            // names come from the server: always text, never markup
            span.textContent = extra
            text.append(span)
          }
          label.append(radio, text)
          list.append(label)
          return radio
        })
        focusFirst = () => (radios[0] ?? close).focus()
        if (revisions[0]) select(revisions[0])
      }

      form.addEventListener('submit', (event) => {
        event.preventDefault()
        if (!version || !view.editable) return
        const state = view.state
        const tr = state.tr.replaceWith(0, state.doc.content.size, version.content)
        tr.setSelection(Selection.near(tr.doc.resolve(0)))
        view.dispatch(tr.scrollIntoView())
        handle.close()
        announce(view, t('revisions.restored'))
      })

      list.hidden = side.hidden = true
      status.textContent = t('revisions.loading')
      options.revisions().then(
        (revisions) => {
          if (closed) return
          fill(revisions)
          focusFirst()
        },
        () => {
          if (closed) return
          status.textContent = ''
          error.textContent = t('revisions.listError')
          close.focus()
        },
      )
    },
  })
  return handle
}
