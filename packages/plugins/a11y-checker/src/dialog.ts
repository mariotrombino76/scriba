import {
  NodeSelection,
  Selection,
  TextSelection,
  type Command,
  type EditorState,
} from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import { openDialog, type DialogHandle } from '@scriba/ui'
import type { EditorView } from '@scriba/view'
import { a11yIssues, ignoreIssue, setCurrentIssue } from './state.js'
import type { A11yIssue, A11yRepair, A11yTarget } from './types.js'

let dialogCount = 0

/** Where the W3C explains a success criterion. */
export const understandingUrl = (slug: string) =>
  `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`

function targetSelection(state: EditorState, target: A11yTarget): Selection {
  const { doc } = state
  if (target.kind === 'node') {
    const node = doc.nodeAt(target.pos)
    return node && NodeSelection.isSelectable(node)
      ? NodeSelection.create(doc, target.pos)
      : Selection.near(doc.resolve(target.pos + 1))
  }
  return TextSelection.between(doc.resolve(target.from), doc.resolve(target.to))
}

/**
 * The accessibility checker dialog (TinyMCE's): one issue at a time, selected
 * and highlighted in the text, with its explanation, the WCAG criterion and a
 * repair; Previous / Next / Ignore. Needs the `a11yChecker()` plugin. Built
 * with `createElement` and `textContent` only.
 */
export function openA11yDialog(view: EditorView, t: Translate): DialogHandle {
  const doc = view.document
  const id = `scriba-a11y-${++dialogCount}`
  let issues: A11yIssue[] = []
  let index = 0

  const run = (command: Command) => command(view.state, (tr) => view.dispatch(tr), view)
  let focusIssue = () => {}

  const handle = openDialog(doc, {
    title: t('a11y.title'),
    returnFocus: () => {
      run(setCurrentIssue(null))
      view.focus()
    },
    build(form, handle) {
      handle.dialog.classList.add('scriba-a11y')
      const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
        const e = doc.createElement(tag)
        if (cls) e.className = cls
        return e
      }
      const button = (label: string, onClick: () => void) => {
        const b = el('button')
        b.type = 'button'
        b.textContent = label
        b.addEventListener('click', onClick)
        return b
      }

      const status = el('p', 'scriba-a11y-status')
      status.setAttribute('role', 'status')
      const section = el('div', 'scriba-a11y-issue')
      const error = el('p', 'scriba-dialog-error')
      error.setAttribute('role', 'alert')
      const nav = el('div', 'scriba-dialog-actions scriba-a11y-nav')
      const previous = button(t('a11y.previous'), () => go(index - 1))
      const next = button(t('a11y.next'), () => go(index + 1))
      const ignore = button(t('a11y.ignore'), () => {
        const issue = issues[index]
        if (issue && run(ignoreIssue(issue))) refresh(t('a11y.ignored'))
      })
      const close = button(t('a11y.close'), () => handle.close())
      nav.append(previous, next, ignore, close)
      form.append(status, section, error, nav)

      /** What the field-based repairs do on Enter or with the "Fix" button. */
      let submit: (() => void) | null = null
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        submit?.()
      })

      const apply = (command: Command) => {
        if (run(command)) refresh(t('a11y.repaired'))
        else error.textContent = t('a11y.repairFailed')
      }

      const repairUI = (repair: A11yRepair, describedBy: string): HTMLElement => {
        const box = el('fieldset', 'scriba-a11y-repair')
        const legend = el('legend')
        legend.textContent = t('a11y.repair')
        box.appendChild(legend)
        if (repair.kind === 'actions') {
          const row = el('div', 'scriba-a11y-actions')
          for (const action of repair.actions) {
            const b = button(t(`a11y.action.${action.id}`, action.params), () =>
              apply(action.command),
            )
            b.setAttribute('aria-describedby', describedBy)
            row.appendChild(b)
          }
          box.appendChild(row)
          return box
        }
        const fix = el('button')
        fix.type = 'submit'
        fix.textContent = t('a11y.apply')
        const fixRow = el('div', 'scriba-dialog-actions')
        fixRow.appendChild(fix)
        if (repair.kind === 'heading') {
          // radio buttons, not a <select>: WebKit styles its parts inline, refused under a strict CSP
          const group = el('fieldset', 'scriba-radio-group')
          const legend = el('legend')
          legend.textContent = t('a11y.field.level')
          group.appendChild(legend)
          const radios = repair.levels.map((level, i) => {
            const radio = el('input')
            radio.type = 'radio'
            radio.name = `${id}-level`
            radio.value = String(level)
            radio.checked = i === 0
            radio.setAttribute('aria-describedby', describedBy)
            const label = el('label', 'scriba-check')
            label.append(radio, t('block.heading', { level }))
            group.appendChild(label)
            return radio
          })
          box.append(group, fixRow)
          submit = () => {
            const chosen = radios.find((r) => r.checked)
            if (chosen) apply(repair.apply(Number(chosen.value)))
          }
          return box
        }
        const input = el('input')
        input.type = 'text'
        input.id = `${id}-${repair.field}`
        input.maxLength = repair.maxLength
        input.value = repair.value
        input.setAttribute('aria-describedby', describedBy)
        const label = el('label')
        label.append(t(`a11y.field.${repair.field}`), input)
        box.appendChild(label)
        let decorative: HTMLInputElement | null = null
        if (repair.decorative) {
          const check = el('input')
          check.type = 'checkbox'
          check.addEventListener('change', () => {
            input.disabled = check.checked
            input.removeAttribute('aria-invalid')
          })
          const checkLabel = el('label', 'scriba-check')
          checkLabel.append(check, t('a11y.decorative'))
          box.appendChild(checkLabel)
          decorative = check
        }
        box.appendChild(fixRow)
        submit = () => {
          if (decorative?.checked) return apply(repair.apply(null))
          if (!input.value.trim()) {
            input.setAttribute('aria-invalid', 'true')
            error.textContent = t('a11y.required')
            input.focus()
            return
          }
          apply(repair.apply(input.value))
        }
        return box
      }

      const render = () => {
        section.replaceChildren()
        error.textContent = ''
        submit = null
        const issue = issues[index]
        previous.hidden = next.hidden = ignore.hidden = !issue
        if (!issue) {
          const none = el('p', 'scriba-a11y-none')
          none.textContent = t('a11y.none')
          section.appendChild(none)
          run(setCurrentIssue(null))
          return
        }
        previous.disabled = index === 0
        next.disabled = index === issues.length - 1

        const head = el('div', 'scriba-a11y-head')
        const severity = el('span', 'scriba-a11y-severity')
        severity.dataset['severity'] = issue.severity
        severity.textContent = t(`a11y.severity.${issue.severity}`)
        const title = el('h3', 'scriba-a11y-rule')
        title.id = `${id}-rule`
        title.tabIndex = -1
        title.textContent = t(`a11y.rule.${issue.rule}.title`)
        head.append(severity, title)
        const description = el('p', 'scriba-a11y-description')
        description.id = `${id}-description`
        description.textContent = t(`a11y.rule.${issue.rule}.description`, issue.params)
        section.append(head, description)

        if (issue.repair && view.editable)
          section.appendChild(repairUI(issue.repair, description.id))
        else if (issue.repair) {
          const note = el('p', 'scriba-dialog-hint')
          note.textContent = t('a11y.readOnly')
          section.appendChild(note)
        }

        const criterion = el('p', 'scriba-a11y-wcag')
        const link = el('a')
        link.href = understandingUrl(issue.criterion.slug)
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.textContent = t('a11y.wcag', {
          id: issue.criterion.id,
          level: issue.criterion.level,
          name: t(`a11y.criterion.${issue.criterion.slug}`),
        })
        criterion.appendChild(link)
        section.appendChild(criterion)

        // select and highlight the issue in the text (selection only: nothing to undo)
        view.dispatch(
          view.state.tr
            .setSelection(targetSelection(view.state, issue.target))
            .setMeta('addToHistory', false)
            .scrollIntoView(),
        )
        run(setCurrentIssue(issue.target))
      }

      const announce = (prefix?: string) => {
        const where = issues.length
          ? t('a11y.position', { n: index + 1, total: issues.length })
          : t('a11y.none')
        status.textContent = prefix ? `${prefix} ${where}` : where
      }

      const go = (to: number) => {
        if (to < 0 || to >= issues.length) return
        index = to
        render()
        announce()
      }

      /** After a repair or an ignore: check again, stay at the same place in the list. */
      const refresh = (prefix: string) => {
        issues = a11yIssues(view.state)
        index = Math.min(index, Math.max(issues.length - 1, 0))
        render()
        announce(prefix)
        focusIssue()
      }

      /** Focus on the repair (its description is read with it), else on the issue's title. */
      focusIssue = () => {
        const first = section.querySelector<HTMLElement>(
          'input[type="text"]:not([disabled]), input:checked, fieldset button',
        )
        ;(issues.length ? (first ?? section.querySelector<HTMLElement>('h3')) : close)?.focus()
      }

      issues = a11yIssues(view.state)
      render()
      announce()
    },
  })
  // after showModal(), which focuses the first focusable element (the title)
  focusIssue()
  return handle
}
