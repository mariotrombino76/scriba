import { BORDER_STYLES, normalizeColor, type Node } from '@scriba/core'
import type { MessageKey, Translate } from '@scriba/i18n'
import { openDialog, type DialogHandle } from '@scriba/ui'
import type { EditorView } from '@scriba/view'
import {
  selectedRect,
  setCellProps,
  setTableProps,
  type CellProps,
  type TableProps,
} from './commands.js'
import { MAX_BORDER_WIDTH, MAX_CAPTION_LENGTH } from './nodes.js'

let ids = 0

interface PaletteColor {
  name: MessageKey
  value: string
}

/** Light backgrounds (dark text stays readable on them). */
const BACKGROUNDS: readonly PaletteColor[] = [
  { name: 'color.name.gray', value: '#f3f4f6' },
  { name: 'color.name.yellow', value: '#fef9c3' },
  { name: 'color.name.green', value: '#dcfce7' },
  { name: 'color.name.teal', value: '#ccfbf1' },
  { name: 'color.name.blue', value: '#dbeafe' },
  { name: 'color.name.purple', value: '#f3e8ff' },
  { name: 'color.name.pink', value: '#fce7f3' },
  { name: 'color.name.red', value: '#fee2e2' },
  { name: 'color.name.orange', value: '#ffedd5' },
]

const BORDERS: readonly PaletteColor[] = [
  { name: 'color.name.black', value: '#000000' },
  { name: 'color.name.gray', value: '#9ca3af' },
  { name: 'color.name.red', value: '#b91c1c' },
  { name: 'color.name.orange', value: '#c2410c' },
  { name: 'color.name.green', value: '#15803d' },
  { name: 'color.name.blue', value: '#1d4ed8' },
  { name: 'color.name.purple', value: '#7e22ce' },
]

interface FormKit {
  doc: Document
  id: string
  el: <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => HTMLElementTagNameMap[K]
  field: (labelKey: MessageKey, input: HTMLElement) => HTMLLabelElement
  choice: (
    legendKey: MessageKey,
    options: readonly [string, MessageKey][],
    value: string,
  ) => { group: HTMLElement; readonly value: string }
  color: (
    labelKey: MessageKey,
    value: string | null,
    palette: readonly PaletteColor[],
  ) => { group: HTMLElement; read: () => string | null | false }
}

function formKit(doc: Document, t: Translate): FormKit {
  const id = `scriba-table-props-${++ids}`
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
    const e = doc.createElement(tag)
    if (cls) e.className = cls
    return e
  }
  let fields = 0
  /** A labelled control (the name is just the label text, never the control's value). */
  const field = (labelKey: MessageKey, input: HTMLElement) => {
    const label = el('label')
    const text = el('span')
    text.id = `${id}-label-${++fields}`
    text.textContent = t(labelKey)
    input.setAttribute('aria-labelledby', text.id)
    label.append(text, input)
    return label
  }
  let choices = 0
  /**
   * A choice as a radio group (no <select>: WebKit's native list needs an
   * inline stylesheet, refused under a strict CSP).
   */
  const choice = (
    legendKey: MessageKey,
    options: readonly [string, MessageKey][],
    value: string,
  ) => {
    const group = el('fieldset', 'scriba-radio-group')
    const legend = el('legend')
    legend.textContent = t(legendKey)
    group.appendChild(legend)
    const name = `${id}-choice-${++choices}`
    const radios = options.map(([v, key]) => {
      const input = el('input')
      input.type = 'radio'
      input.name = name
      input.value = v
      input.checked = v === value
      const label = el('label', 'scriba-check')
      label.append(input, t(key))
      group.appendChild(label)
      return input
    })
    return {
      group,
      get value() {
        return radios.find((r) => r.checked)?.value ?? ''
      },
    }
  }
  let colors = 0
  /**
   * A color: radio buttons "none", palette swatches and "custom" (a #rrggbb
   * field). No native color input: its picker needs inline styles, refused
   * under a strict CSP (WebKit). `read` gives the color, null, or false when invalid.
   */
  const color = (labelKey: MessageKey, value: string | null, palette: readonly PaletteColor[]) => {
    const group = el('fieldset', 'scriba-radio-group scriba-color-field')
    const legend = el('legend')
    legend.textContent = t(labelKey)
    group.appendChild(legend)
    const name = `${id}-color-${++colors}`
    const radio = (label: string, swatch: string | null) => {
      const input = el('input')
      input.type = 'radio'
      input.name = name
      const wrap = el('label', swatch ? 'scriba-color-option' : 'scriba-check')
      wrap.title = label
      input.setAttribute('aria-label', label)
      wrap.appendChild(input)
      if (swatch) {
        const chip = el('span', 'scriba-swatch')
        chip.setAttribute('aria-hidden', 'true')
        chip.style.backgroundColor = swatch // CSSOM, palette color
        wrap.appendChild(chip)
      } else {
        const text = el('span')
        text.textContent = label
        text.setAttribute('aria-hidden', 'true')
        wrap.appendChild(text)
      }
      group.appendChild(wrap)
      return input
    }
    const none = radio(t('table.color.none'), null)
    const options = palette.map((c) => ({ value: c.value, input: radio(t(c.name), c.value) }))
    const custom = radio(t('table.color.custom'), null)
    const hex = el('input')
    hex.type = 'text'
    hex.spellcheck = false
    hex.maxLength = 7
    hex.placeholder = '#rrggbb'
    hex.setAttribute('aria-label', t('table.color.hex'))
    group.appendChild(hex)
    const match = options.find((o) => o.value === value)
    if (!value) none.checked = true
    else if (match) match.input.checked = true
    else {
      custom.checked = true
      hex.value = value
    }
    hex.addEventListener('input', () => (custom.checked = true))
    const read = (): string | null | false => {
      if (none.checked) return null
      const chosen = options.find((o) => o.input.checked)
      if (chosen) return chosen.value
      const v = normalizeColor(hex.value)
      if (v) {
        hex.removeAttribute('aria-invalid')
        return v
      }
      hex.setAttribute('aria-invalid', 'true')
      hex.focus()
      return false
    }
    return { group, read }
  }
  return { doc, id, el, field, choice, color }
}

const STYLE_KEYS: Record<(typeof BORDER_STYLES)[number], MessageKey> = {
  solid: 'table.borderStyle.solid',
  dashed: 'table.borderStyle.dashed',
  dotted: 'table.borderStyle.dotted',
  double: 'table.borderStyle.double',
  none: 'table.borderStyle.none',
}

/** Border width/style/color fields; `read` returns the props, or null when the width is invalid. */
function borderFields(kit: FormKit, t: Translate, node: Node) {
  const group = kit.el('fieldset', 'scriba-radio-group')
  const legend = kit.el('legend')
  legend.textContent = t('table.border')
  const width = kit.el('input')
  width.type = 'number'
  width.min = '0'
  width.max = String(MAX_BORDER_WIDTH)
  width.step = '1'
  width.inputMode = 'numeric'
  const current = node.attrs['borderWidth'] as number | null
  if (current !== null) width.value = String(current)
  const style = kit.choice(
    'table.borderStyle',
    [
      ['', 'table.borderStyle.default'],
      ...BORDER_STYLES.map((s) => [s, STYLE_KEYS[s]] as [string, MessageKey]),
    ],
    (node.attrs['borderStyle'] as string | null) ?? '',
  )
  const color = kit.color('table.borderColor', node.attrs['borderColor'] as string | null, BORDERS)
  group.append(legend, kit.field('table.borderWidth', width), style.group, color.group)
  /** The border props, or the message key of the first invalid field. */
  const read = (): Pick<CellProps, 'borderWidth' | 'borderStyle' | 'borderColor'> | MessageKey => {
    const raw = width.value.trim()
    const w = raw === '' ? null : Number(raw)
    if (w !== null && !(Number.isInteger(w) && w >= 0 && w <= MAX_BORDER_WIDTH)) {
      width.setAttribute('aria-invalid', 'true')
      width.focus()
      return 'table.error.borderWidth'
    }
    width.removeAttribute('aria-invalid')
    const c = color.read()
    if (c === false) return 'table.error.color'
    // a width without a style would not show: solid is what is meant
    const s = style.value || (w ? 'solid' : null)
    return { borderWidth: w, borderStyle: s, borderColor: c }
  }
  return { group, read }
}

function actions(kit: FormKit, t: Translate, handle: DialogHandle): HTMLElement {
  const box = kit.el('div', 'scriba-dialog-actions')
  const cancel = kit.el('button')
  cancel.type = 'button'
  cancel.textContent = t('table.cancel')
  cancel.addEventListener('click', () => handle.close())
  const save = kit.el('button')
  save.type = 'submit'
  save.textContent = t('table.save')
  box.append(cancel, save)
  return box
}

/** Dialog for the selected cells: background, vertical alignment, border. */
export function openCellDialog(view: EditorView, t: Translate): DialogHandle | null {
  const ctx = selectedRect(view.state)
  if (!ctx) return null
  const node = ctx.cell.node
  return openDialog(view.document, {
    title: t('table.cellPropsTitle'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const kit = formKit(view.document, t)
      const background = kit.color(
        'table.background',
        node.attrs['background'] as string | null,
        BACKGROUNDS,
      )
      const valign = kit.choice(
        'table.valign',
        [
          ['', 'table.valign.default'],
          ['top', 'table.valign.top'],
          ['middle', 'table.valign.middle'],
          ['bottom', 'table.valign.bottom'],
        ],
        (node.attrs['valign'] as string | null) ?? '',
      )
      const border = borderFields(kit, t, node)
      const error = kit.el('p', 'scriba-dialog-error')
      error.setAttribute('aria-live', 'polite')
      form.append(background.group, valign.group, border.group, error, actions(kit, t, handle))
      form.addEventListener('submit', (event) => {
        event.preventDefault()
        const b = border.read()
        if (typeof b === 'string') {
          error.textContent = t(b)
          return
        }
        const bg = background.read()
        if (bg === false) {
          error.textContent = t('table.error.color')
          return
        }
        const props: CellProps = {
          background: bg,
          valign: (valign.value || null) as CellProps['valign'],
          ...b,
        }
        handle.close()
        setCellProps(props)(view.state, (tr) => view.dispatch(tr), view)
      })
      queueMicrotask(() => form.querySelector<HTMLElement>('input')?.focus())
    },
  })
}

/** Dialog for the table: caption, alignment, border (also applied to every cell). */
export function openTablePropsDialog(view: EditorView, t: Translate): DialogHandle | null {
  const ctx = selectedRect(view.state)
  if (!ctx) return null
  const node = ctx.table
  return openDialog(view.document, {
    title: t('table.propsTitle'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const kit = formKit(view.document, t)
      const caption = kit.el('input')
      caption.type = 'text'
      caption.maxLength = MAX_CAPTION_LENGTH
      caption.value = (node.attrs['caption'] as string | null) ?? ''
      const align = kit.choice(
        'table.align',
        [
          ['', 'table.align.left'],
          ['center', 'table.align.center'],
          ['right', 'table.align.right'],
        ],
        (node.attrs['align'] as string | null) ?? '',
      )
      const border = borderFields(kit, t, node)
      const error = kit.el('p', 'scriba-dialog-error')
      error.setAttribute('aria-live', 'polite')
      form.append(
        kit.field('table.caption', caption),
        align.group,
        border.group,
        error,
        actions(kit, t, handle),
      )
      form.addEventListener('submit', (event) => {
        event.preventDefault()
        const b = border.read()
        if (typeof b === 'string') {
          error.textContent = t(b)
          return
        }
        const text = caption.value.replace(/\s+/g, ' ').trim().slice(0, MAX_CAPTION_LENGTH)
        const props: TableProps = {
          caption: text || null,
          align: (align.value || null) as TableProps['align'],
        }
        // the border is copied to every cell only when it changed (cells may have their own)
        const changed = (Object.keys(b) as (keyof typeof b)[]).some((k) => b[k] !== node.attrs[k])
        if (changed) Object.assign(props, b)
        handle.close()
        setTableProps(props)(view.state, (tr) => view.dispatch(tr), view)
      })
      queueMicrotask(() => caption.focus())
    },
  })
}
