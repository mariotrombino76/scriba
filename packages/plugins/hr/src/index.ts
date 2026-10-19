import {
  Fragment,
  Plugin,
  Selection,
  insertContent,
  type Command,
  type DOMLikeElement,
  type NodeSpec,
  type NodeType,
  type Schema,
} from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import type { IconName, ToolbarButton } from '@scriba/ui'
import type { EditorView, ViewPluginProps } from '@scriba/view'

/** The one class a page break carries in HTML (fixed: no class comes from outside). */
export const PAGE_BREAK_CLASS = 'scriba-page-break'

const isPageBreak = (el: DOMLikeElement) =>
  (el.getAttribute('class') ?? '').split(/\s+/).includes(PAGE_BREAK_CLASS)

/**
 * Node specs: a horizontal line (`<hr>`) and a page break
 * (`<hr class="scriba-page-break">`: any viewer shows a line; the theme's
 * print styles start a new page there). Neither has attributes; other
 * classes and attributes of an `<hr>` are dropped.
 */
export const hrNodes = {
  horizontal_rule: {
    group: 'block',
    parseHTML: [{ tag: 'hr' }],
    toHTML: () => ['hr'],
  },
  page_break: {
    group: 'block',
    parseHTML: [{ tag: 'hr', priority: 60, getAttrs: (el) => (isPageBreak(el) ? null : false) }],
    toHTML: () => ['hr', { class: PAGE_BREAK_CLASS }],
  },
} satisfies Record<string, NodeSpec>

function nodeType(schema: Schema, name: 'horizontal_rule' | 'page_break'): NodeType {
  const type = schema.nodes[name]
  if (!type) throw new RangeError(`The schema has no "${name}" node (add hrNodes)`)
  return type
}

/**
 * Inserts a block leaf where the cursor is: the paragraph is split there (in
 * an empty paragraph, it takes its place) and the cursor goes to the text
 * after it, adding an empty paragraph when nothing follows.
 */
function insertBlockLeaf(name: 'horizontal_rule' | 'page_break'): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes[name]
    const paragraph = state.schema.nodes['paragraph']
    if (!type) return false
    const { $from, from, to } = state.selection
    let depth = $from.depth
    while (depth >= 0 && !$from.node(depth).type.canContain(type)) depth--
    if (depth < 0 || $from.parent.type.spec.code) return false
    if (!dispatch) return true
    const tr = state.tr
    const end = insertContent(tr, from, to, Fragment.from(type.create()))
    if (end === null) return false
    let after = end
    // the leaf may have replaced an empty paragraph, or split one: find what follows it
    const $end = tr.doc.resolve(Math.min(after, tr.doc.content.size))
    if (!$end.nodeAfter?.isTextblock && paragraph && $end.parent.type.canContain(paragraph))
      tr.insert(after, paragraph.create())
    else if ($end.nodeAfter?.isTextblock) after = $end.pos
    tr.setSelection(Selection.near(tr.doc.resolve(after + 1), 1))
    dispatch(tr.scrollIntoView())
    return true
  }
}

/** Inserts a horizontal line at the cursor. */
export const insertHorizontalRule: Command = insertBlockLeaf('horizontal_rule')

/** Inserts a page break at the cursor (a new page when printing). */
export const insertPageBreak: Command = insertBlockLeaf('page_break')

/**
 * Names the page breaks for screen readers in the editor (an `<hr>` alone is
 * just "separator"). Only the editor's DOM: the saved HTML stays plain.
 */
export function hrPlugins(t: Translate): Plugin[] {
  const props: ViewPluginProps = {
    pluginView: (view: EditorView) => {
      const label = (v: EditorView) =>
        v.domChange(() => {
          for (const hr of v.dom.querySelectorAll<HTMLElement>(`hr.${PAGE_BREAK_CLASS}`))
            if (hr.getAttribute('aria-label') !== t('pagebreak.label'))
              hr.setAttribute('aria-label', t('pagebreak.label'))
        })
      label(view)
      return { update: label }
    },
  }
  return [new Plugin({ props: { ...props } })]
}

function button(
  id: string,
  icon: IconName,
  label: 'hr.label' | 'pagebreak.label',
  command: Command,
): ToolbarButton {
  return { type: 'button', id, icon, label: (t) => t(label), command }
}

/** Toolbar / menu buttons: horizontal line and page break (Insert menu, like TinyMCE). */
export function hrToolbarItems(schema: Schema): ToolbarButton[] {
  nodeType(schema, 'horizontal_rule')
  nodeType(schema, 'page_break')
  return [
    button('hr', 'hr', 'hr.label', insertHorizontalRule),
    button('pagebreak', 'pageBreak', 'pagebreak.label', insertPageBreak),
  ]
}

/** Slash menu entries ("/linea", "/interruzione"). */
export function hrSlashItems(schema: Schema): {
  id: string
  label: (t: Translate) => string
  keywords: string[]
  icon: IconName
  command: Command
}[] {
  nodeType(schema, 'horizontal_rule')
  nodeType(schema, 'page_break')
  return [
    {
      id: 'hr',
      label: (t) => t('hr.label'),
      keywords: ['linea', 'separatore', 'hr', 'line', 'divider', 'rule'],
      icon: 'hr',
      command: insertHorizontalRule,
    },
    {
      id: 'pagebreak',
      label: (t) => t('pagebreak.label'),
      keywords: ['interruzione', 'pagina', 'stampa', 'page', 'break', 'print'],
      icon: 'pageBreak',
      command: insertPageBreak,
    },
  ]
}
