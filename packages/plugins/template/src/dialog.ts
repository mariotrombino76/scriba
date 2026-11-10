import { EditorState, type Node } from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import { openDialog, type DialogHandle } from '@scriba-editor/ui'
import { EditorView } from '@scriba-editor/view'
import {
  defaultTemplateValues,
  insertTemplate,
  parseTemplate,
  type Template,
  type TemplateOptions,
} from './content.js'

let dialogCount = 0

/**
 * The "Insert template" dialog (TinyMCE's): the templates as a radio list,
 * the selected one's description and a read-only preview rendered by an
 * `EditorView`, then Insert. Templates and their content may load
 * asynchronously; a slow answer for a template that is no longer selected is
 * ignored. Built with `createElement` and `textContent` only.
 */
export function openTemplateDialog(
  view: EditorView,
  t: Translate,
  options: TemplateOptions,
): DialogHandle {
  const doc = view.document
  const id = `scriba-template-${++dialogCount}`
  const values = { ...defaultTemplateValues(options.locale), ...options.values }
  /** Parsed content per template, so going back to one does not load it again. */
  const parsed = new Map<Template, Promise<Node>>()
  let preview: EditorView | null = null
  let current: Node | null = null
  let closed = false
  let focusFirst = () => {}

  const handle = openDialog(doc, {
    title: t('template.title'),
    returnFocus: () => {
      closed = true
      preview?.destroy()
      view.focus()
    },
    build(form, handle) {
      handle.dialog.classList.add('scriba-template')
      const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
        const e = doc.createElement(tag)
        if (cls) e.className = cls
        return e
      }

      const status = el('p', 'scriba-template-status')
      status.setAttribute('role', 'status')
      const body = el('div', 'scriba-template-body')
      const list = el('fieldset', 'scriba-radio-group scriba-template-list')
      const legend = el('legend')
      legend.textContent = t('template.list')
      list.appendChild(legend)
      const side = el('div', 'scriba-template-side')
      const description = el('p', 'scriba-template-description')
      description.id = `${id}-description`
      const box = el('div', 'scriba-template-preview')
      box.setAttribute('role', 'region')
      box.setAttribute('aria-label', t('template.preview'))
      side.append(description, box)
      body.append(list, side)
      const error = el('p', 'scriba-dialog-error')
      error.setAttribute('role', 'alert')
      const actions = el('div', 'scriba-dialog-actions')
      const cancel = el('button')
      cancel.type = 'button'
      cancel.textContent = t('template.cancel')
      cancel.addEventListener('click', () => handle.close())
      const insert = el('button')
      insert.type = 'submit'
      insert.textContent = t('template.apply')
      insert.disabled = true
      actions.append(cancel, insert)
      form.append(status, body, error, actions)

      form.addEventListener('submit', (e) => {
        e.preventDefault()
        if (!current || !view.editable) return
        if (insertTemplate(current.content)(view.state, (tr) => view.dispatch(tr), view))
          handle.close()
      })

      const showPreview = (content: Node | null) => {
        preview?.destroy()
        preview = null
        box.replaceChildren()
        current = content
        insert.disabled = !content || !view.editable
        if (!content) return
        preview = new EditorView(box, {
          state: EditorState.create({ doc: content }),
          editable: () => false,
          label: t('template.preview'),
          ...(view.options.nodeViews ? { nodeViews: view.options.nodeViews } : {}),
        })
      }

      const contentOf = (template: Template): Promise<Node> => {
        let result = parsed.get(template)
        if (!result) {
          const source = template.content
          result = (typeof source === 'string' ? Promise.resolve(source) : source()).then((html) =>
            parseTemplate(view.state.schema, html, values),
          )
          parsed.set(template, result)
          // a failed load can be tried again by selecting the template again
          result.catch(() => parsed.delete(template))
        }
        return result
      }

      let selection = 0
      const select = (template: Template) => {
        const ticket = ++selection
        description.textContent = template.description ?? ''
        error.textContent = ''
        showPreview(null)
        status.textContent = t('template.loading')
        contentOf(template).then(
          (content) => {
            if (closed || ticket !== selection) return
            status.textContent = ''
            showPreview(content)
          },
          () => {
            if (closed || ticket !== selection) return
            status.textContent = ''
            error.textContent = t('template.contentError', { title: template.title })
          },
        )
      }

      const fill = (templates: readonly Template[]) => {
        status.textContent = templates.length ? '' : t('template.none')
        const radios = templates.map((template, i) => {
          const radio = el('input')
          radio.type = 'radio'
          radio.name = `${id}-template`
          radio.value = String(i)
          radio.checked = i === 0
          radio.setAttribute('aria-describedby', description.id)
          radio.addEventListener('change', () => radio.checked && select(template))
          const label = el('label', 'scriba-check')
          label.append(radio, template.title)
          list.appendChild(label)
          return radio
        })
        list.hidden = !templates.length
        focusFirst = () => (radios[0] ?? cancel).focus()
        if (templates[0]) select(templates[0])
      }

      const source = options.templates
      if (typeof source !== 'function') fill(source)
      else {
        list.hidden = true
        status.textContent = t('template.loading')
        source().then(
          (templates) => {
            if (closed) return
            fill(templates)
            focusFirst()
          },
          () => {
            if (closed) return
            status.textContent = ''
            error.textContent = t('template.listError')
            cancel.focus()
          },
        )
      }
    },
  })
  // after showModal(), which focuses the first focusable element
  focusFirst()
  return handle
}
