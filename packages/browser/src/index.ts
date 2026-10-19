/**
 * Scriba for a plain web page: one script (`scriba.iife.js`, global `Scriba`) or one ES
 * module (`scriba.js`), plus `scriba.css`. No framework, no build step:
 *
 *   const editor = Scriba.createEditor('#editor', { content: '<p>Ciao</p>', onChange: save })
 */
import '../../themes/scriba.css'
import {
  EditorState,
  Schema,
  baseKeymap,
  basicSchema,
  basicSchemaSpec,
  formatKeymap,
  history,
  historyKeymap,
  keymap,
  ADD_TO_HISTORY,
  type Plugin,
} from '@scriba/core'
import { createTranslator, type Messages } from '@scriba/i18n'
import {
  blockStyleMenu,
  clearFormatItem,
  contextMenu,
  defineScribaToolbar,
  historyItems,
  markItems,
  toolbarGroup,
  type ScribaToolbar,
  type ToolbarItem,
} from '@scriba/ui'
import {
  EditorView,
  parseContent,
  serializeContent,
  type Content,
  type ContentFormat,
} from '@scriba/view'
import { blockquoteNodes, blockquoteToolbarItems } from '@scriba/plugin-blockquote'
import { charmapToolbarItem } from '@scriba/plugin-charmap'
import { codeBlockKeymap, codeBlockNodes, codeBlockToolbarItems } from '@scriba/plugin-code-block'
import {
  findReplaceKeymap,
  findReplacePlugins,
  findReplaceToolbarItem,
} from '@scriba/plugin-find-replace'
import { Fullscreen, fullscreenKeymap, fullscreenToolbarItem } from '@scriba/plugin-fullscreen'
import { hrNodes, hrPlugins, hrToolbarItems } from '@scriba/plugin-hr'
import {
  imageContextMenu,
  imageKeymap,
  imageNodes,
  imagePlugins,
  imageToolbarItems,
  type ImageUploadOptions,
} from '@scriba/plugin-image'
import { linkContextMenu, linkKeymap, linkMarks, linkToolbarItems } from '@scriba/plugin-link'
import { listIndentCommands, listKeymap, listNodes, listToolbarItems } from '@scriba/plugin-list'
import { markdownShortcuts } from '@scriba/plugin-markdown'
import { pasteClean } from '@scriba/plugin-paste-clean'
import { sourceToolbarItem } from '@scriba/plugin-source'
import {
  tableContextMenu,
  tableKeymap,
  tableNodes,
  tablePlugins,
  tableToolbarItems,
} from '@scriba/plugin-table'
import {
  alignmentMenu,
  colorItems,
  fontItems,
  indentItems,
  textStyleKeymap,
  textStyleMarks,
  withBlockStyles,
} from '@scriba/plugin-text-style'

export interface CreateEditorOptions {
  /** Initial content: HTML (default) or JSON. Untrusted: it goes through the schema. */
  content?: Content | null
  format?: ContentFormat
  /**
   * `'full'` (default): headings, lists, links, images, tables, colors and fonts,
   * quotes, code, lines, find and replace, HTML source, full screen, Markdown shortcuts.
   * `'basic'`: paragraphs, headings and bold/italic/underline/strike/code.
   */
  preset?: 'full' | 'basic'
  /** Shows the toolbar (default true). */
  toolbar?: boolean
  /** Interface language: `'it'` (default), `'en'`, or a message object. */
  locale?: string | Messages
  /** Accessible name of the editing area. */
  label?: string
  editable?: boolean
  /** Called after every change by the user, with the content in `format`. */
  onChange?: (content: Content) => void
  /**
   * Image upload (full preset): your function sends the file to YOUR server and returns
   * its URL. Without it, images are inserted by address only.
   */
  upload?: ImageUploadOptions['upload']
}

export interface ScribaEditorHandle {
  readonly view: EditorView
  /** The container holding the toolbar and the editing area. */
  readonly element: HTMLElement
  getContent(): Content
  /** Replaces the document (untrusted input: parsed through the schema). Not undoable. */
  setContent(content: Content | null): void
  setEditable(editable: boolean): void
  focus(): void
  /** Removes the editor and its toolbar from the page. */
  destroy(): void
}

function fullSchema(): Schema {
  return new Schema({
    nodes: withBlockStyles({
      ...basicSchemaSpec.nodes,
      ...blockquoteNodes,
      ...listNodes,
      ...codeBlockNodes,
      ...imageNodes,
      ...hrNodes,
      ...tableNodes,
    }),
    marks: { ...linkMarks, ...basicSchemaSpec.marks, ...textStyleMarks },
  })
}

/**
 * Creates an editor inside `target` (an element or a CSS selector). The content and
 * anything pasted or dropped are untrusted: they go through the schema parser. Save the
 * HTML only after passing it through `@scriba/sanitize-server` on your server.
 */
export function createEditor(
  target: HTMLElement | string,
  options: CreateEditorOptions = {},
): ScribaEditorHandle {
  const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
  if (!host) throw new Error(`Scriba.createEditor: no element for ${String(target)}`)
  const full = (options.preset ?? 'full') === 'full'
  const format = options.format ?? 'html'
  const t = createTranslator(options.locale ?? 'it')
  const schema = full ? fullSchema() : basicSchema
  const images: ImageUploadOptions = options.upload ? { upload: options.upload } : {}

  const element = document.createElement('div')
  element.className = 'scriba'
  host.appendChild(element)
  const fullscreen = new Fullscreen(element)
  const plugins: Plugin[] = full
    ? [
        history(),
        pasteClean(),
        ...imagePlugins(t, images),
        ...tablePlugins(),
        ...hrPlugins(t),
        ...findReplacePlugins(),
        ...markdownShortcuts(schema),
        keymap(findReplaceKeymap(t), { priority: 80, readOnly: true }),
        keymap(fullscreenKeymap(fullscreen), { priority: 80, readOnly: true }),
        keymap(imageKeymap(t, images), { priority: 70 }),
        keymap(codeBlockKeymap(), { priority: 60 }),
        keymap(tableKeymap(), { priority: 55 }),
        keymap(listKeymap(schema), { priority: 50 }),
        keymap(textStyleKeymap({ indent: listIndentCommands(schema) })),
        keymap(linkKeymap(t)),
        keymap(historyKeymap),
        keymap(formatKeymap(schema)),
        keymap(baseKeymap),
      ]
    : [history(), keymap(historyKeymap), keymap(formatKeymap(schema)), keymap(baseKeymap)]

  let editable = options.editable ?? true
  let toolbar: ScribaToolbar | null = null
  if (options.toolbar !== false) {
    defineScribaToolbar()
    toolbar = document.createElement('scriba-toolbar')
    element.appendChild(toolbar)
  }
  const mount = document.createElement('div')
  mount.className = 'scriba-mount'
  element.appendChild(mount)

  const view: EditorView = new EditorView(mount, {
    state: EditorState.create({ doc: parseContent(schema, options.content, format), plugins }),
    label: options.label ?? t('editor.label'),
    editable: () => editable,
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr))
      if (tr.docChanged && tr.getMeta('scribaSetContent') !== true)
        options.onChange?.(serializeContent(view.state.doc, format))
    },
  })
  const menu = full
    ? contextMenu(view, {
        translator: t,
        sections: [
          linkContextMenu(schema, t),
          imageContextMenu(schema, t, images),
          tableContextMenu(schema, t),
        ],
      })
    : null

  if (toolbar) {
    const style = blockStyleMenu(schema)
    const items: ToolbarItem[] = [
      toolbarGroup('history', 'toolbar.group.history', historyItems(), 3),
      ...(style ? [toolbarGroup('text-style', 'toolbar.group.textStyle', [style], 3)] : []),
      toolbarGroup('format', 'toolbar.group.format', markItems(schema), 2),
    ]
    if (full) {
      items.push(
        toolbarGroup('fonts', 'toolbar.group.textStyle', fontItems(schema)),
        toolbarGroup('colors', 'toolbar.group.colors', colorItems(schema)),
        toolbarGroup(
          'insert',
          'toolbar.group.insert',
          [
            ...linkToolbarItems(schema, t),
            ...imageToolbarItems(schema, t, images),
            ...tableToolbarItems(schema, t),
            ...hrToolbarItems(schema),
            charmapToolbarItem(t),
          ],
          2,
        ),
        toolbarGroup('lists', 'toolbar.group.lists', [
          ...listToolbarItems(schema, { indent: false }),
          ...indentItems({ indent: listIndentCommands(schema) }),
          alignmentMenu(),
        ]),
        toolbarGroup('blocks', 'toolbar.group.blocks', [
          ...blockquoteToolbarItems(schema),
          ...codeBlockToolbarItems(schema),
          clearFormatItem(),
        ]),
        toolbarGroup('view', 'toolbar.group.view', [
          findReplaceToolbarItem(t),
          sourceToolbarItem(t),
          fullscreenToolbarItem(fullscreen),
        ]),
      )
    }
    toolbar.translator = t
    toolbar.items = items
    toolbar.view = view
  }

  return {
    view,
    element,
    getContent: () => serializeContent(view.state.doc, format),
    setContent(content) {
      const doc = parseContent(schema, content, format)
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content)
      view.dispatch(tr.setMeta(ADD_TO_HISTORY, false).setMeta('scribaSetContent', true))
    },
    setEditable(value) {
      editable = value
      view.updateState(view.state)
    },
    focus: () => view.focus(),
    destroy() {
      menu?.destroy()
      if (toolbar) toolbar.view = null
      view.destroy()
      element.remove()
    },
  }
}

/** The building blocks, for pages that compose their own editor. */
export * as core from '@scriba/core'
export * as view from '@scriba/view'
export * as ui from '@scriba/ui'
export { createTranslator } from '@scriba/i18n'
