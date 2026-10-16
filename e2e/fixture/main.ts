/// <reference types="vite/client" />
import {
  EditorState,
  Schema,
  baseKeymap,
  basicSchemaSpec,
  formatKeymap,
  history,
  historyKeymap,
  keymap,
  serializeHTML,
  parseHTML,
} from '@scriba/core'
import { EditorView, parseInertHTML } from '@scriba/view'
import { createTranslator } from '@scriba/i18n'
import {
  blockStyleMenu,
  defineScribaMenubar,
  defineScribaToolbar,
  historyItems,
  clearFormatItem,
  selectAllItem,
  type ToolbarButton,
  markItems,
  toolbarGroup,
} from '@scriba/ui'
import {
  listIndentCommands,
  listKeymap,
  listNodes,
  listToolbarItems,
  toggleList,
} from '@scriba/plugin-list'
import {
  blockquoteNodes,
  blockquoteToolbarItems,
  toggleBlockquote,
} from '@scriba/plugin-blockquote'
import {
  alignmentMenu,
  colorItems,
  fontItems,
  indentItems,
  textStyleKeymap,
  textStyleMarks,
  withBlockStyles,
} from '@scriba/plugin-text-style'
import { linkKeymap, linkMarks, linkToolbarItems } from '@scriba/plugin-link'
import {
  codeBlockKeymap,
  toggleCodeBlock,
  codeBlockNodes,
  codeBlockToolbarItems,
  codeHighlight,
} from '@scriba/plugin-code-block'
import { common, createLowlight } from 'lowlight'
import { pasteClean } from '@scriba/plugin-paste-clean'
import {
  imageKeymap,
  openImageDialog,
  imageNodes,
  imagePlugins,
  imageToolbarItems,
  type ImageUploadOptions,
} from '@scriba/plugin-image'
import {
  insertTable,
  tableKeymap,
  tableNodes,
  tablePlugins,
  tableToolbarItems,
} from '@scriba/plugin-table'
import { Fullscreen, fullscreenKeymap, fullscreenToolbarItem } from '@scriba/plugin-fullscreen'
import { createWordCountStatus, openWordCountDialog } from '@scriba/plugin-word-count'
import { sourceToolbarItem } from '@scriba/plugin-source'
import { charmapToolbarItem, openCharmapDialog } from '@scriba/plugin-charmap'
import { basicSlashItems, slashCommands, slashKeymap, type SlashItem } from '@scriba/plugin-slash'
import { mentionKeymap, mentionNodes, mentions, type MentionSearch } from '@scriba/plugin-mention'
import { blockPermissions, withBlockIds } from '@scriba/plugin-permissions'
import { taskKeymap, taskNodes, taskSlashItem, taskToolbarItem } from '@scriba/plugin-task'
import { calloutNodes, calloutSlashItem, calloutToolbarItem } from '@scriba/plugin-callout'
import { fileKeymap, fileMenu, filePlugin, type FileOptions } from '@scriba/plugin-file'
import { CalloutView, TaskView, vueNodeView } from '@scriba/vue'
import { bubbleKeymap, bubbleMenu } from '@scriba/plugin-bubble'
import { collab, collabCommentStore, collabStatusElement } from '@scriba/plugin-collab'
import {
  commentMarks,
  commentToolbarItem,
  commentsKeymap,
  commentsPanel,
  commentsPlugin,
  createMemoryCommentStore,
  suggestToolbarItem,
  suggestionMarks,
  suggestionsPlugin,
} from '@scriba/plugin-comments'
import { markdownShortcuts, parseMarkdown, serializeMarkdown } from '@scriba/plugin-markdown'
import {
  aiAssistant,
  aiKeymap,
  aiToolbarItem,
  openAiMenu,
  type AiComplete,
  type AiOptions,
} from '@scriba/plugin-ai'
import {
  findReplaceKeymap,
  findReplacePlugins,
  findReplaceToolbarItem,
} from '@scriba/plugin-find-replace'
import '../../packages/themes/scriba.css'

// Test fixture only: exposes the view so specs can read the model.
const t = createTranslator('it')

// Demo upload: a real app sends the file to its server and returns the URL.
// Here the file becomes a data: URL (allowed for PNG/JPEG/GIF/WebP within the size limit).
const images: ImageUploadOptions = {
  maxSize: 900_000,
  upload: (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    }),
}
// Demo people: a real app asks its server (with the user's session) and returns the matches.
const people = [
  { id: 'u-anna', label: 'Anna Rossi', detail: 'Redazione' },
  { id: 'u-bruno', label: 'Bruno Bianchi', detail: 'Grafica' },
  { id: 'u-carla', label: 'Carla Verdi' },
  { id: 'u-dario', label: 'Dario Neri', detail: 'Revisione' },
]
const searchPeople: MentionSearch = (query, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const q = query.toLowerCase()
      resolve(people.filter((p) => p.label.toLowerCase().includes(q)))
    }, 80)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
// File menu: open .docx/.html/.md/.txt, download, preview, print (all in the browser)
const fileOptions: FileOptions = { t }
const schema = new Schema({
  nodes: withBlockIds(
    withBlockStyles({
      ...basicSchemaSpec.nodes,
      ...blockquoteNodes,
      ...listNodes,
      ...codeBlockNodes,
      ...imageNodes,
      ...mentionNodes,
      ...taskNodes,
      ...calloutNodes,
      ...tableNodes,
    }),
  ),
  marks: {
    ...linkMarks,
    ...basicSchemaSpec.marks,
    ...textStyleMarks,
    ...commentMarks,
    ...suggestionMarks,
  },
})
// AI assistant with a FAKE backend (no network): a real app calls its own server here.
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    })
  })
const FAKE_ANSWERS: Record<string, string> = {
  continue: ' e vissero tutti **felici** e contenti.',
  improve: 'Un testo più chiaro e scorrevole',
  fix: 'Testo corretto',
  shorter: 'Più breve',
  longer: 'Un testo più lungo, con qualche dettaglio in più',
  summarize: 'In sintesi: il punto principale.',
  translate: 'Text in English',
}
const fakeAi: AiComplete = (req) =>
  (async function* () {
    const text =
      req.prompt === 'attacco'
        ? 'Ok **fatto** [qui](javascript:alert(1)) <img src=x onerror=alert(1)><script>alert(1)</script>'
        : req.prompt === 'errore'
          ? (() => {
              throw new Error('backend down')
            })()
          : req.prompt
            ? `Risposta a: ${req.prompt}`
            : (FAKE_ANSWERS[req.action] ?? 'Fatto.')
    for (const word of text.split(/(?<= )/)) {
      await wait(req.prompt === 'lento' ? 400 : 40, req.signal)
      yield word
    }
  })()
const aiOptions: AiOptions = {
  complete: fakeAi,
  parse: (text, s) => parseMarkdown(s, text).content,
  t,
}

// Slash menu: blocks and actions from the plugins in use.
const slashItems: SlashItem[] = [
  ...basicSlashItems(schema),
  taskSlashItem(schema),
  calloutSlashItem(schema),
  {
    id: 'bullet_list',
    label: (tr) => tr('list.bullet'),
    keywords: ['elenco', 'puntato', 'list', 'ul'],
    icon: 'bulletList',
    command: toggleList(schema.nodes['bullet_list']!, schema.nodes['list_item']!),
  },
  {
    id: 'ordered_list',
    label: (tr) => tr('list.ordered'),
    keywords: ['elenco', 'numerato', 'list', 'ol'],
    icon: 'orderedList',
    command: toggleList(schema.nodes['ordered_list']!, schema.nodes['list_item']!),
  },
  {
    id: 'quote',
    label: (tr) => tr('block.blockquote'),
    keywords: ['citazione', 'quote'],
    icon: 'quote',
    command: toggleBlockquote(schema),
  },
  {
    id: 'code',
    label: (tr) => tr('block.codeBlock'),
    keywords: ['codice', 'code'],
    icon: 'codeBlock',
    command: toggleCodeBlock,
  },
  {
    id: 'table',
    label: (tr) => tr('table.label'),
    keywords: ['tabella', 'table'],
    icon: 'table',
    command: insertTable(3, 3),
  },
  {
    id: 'image',
    label: (tr) => tr('image.label'),
    keywords: ['immagine', 'foto', 'image'],
    icon: 'image',
    run: (v) => openImageDialog(v, t, images),
  },
  {
    id: 'ai',
    label: (tr) => tr('ai.button'),
    keywords: ['ai', 'intelligenza', 'assistente', 'scrivi'],
    icon: 'sparkles',
    run: (v) => openAiMenu(v, aiOptions),
  },
  {
    id: 'charmap',
    label: (tr) => tr('charmap.button'),
    keywords: ['emoji', 'simbolo', 'carattere', 'symbol'],
    icon: 'smile',
    run: (v) => openCharmapDialog(v, t),
  },
]

// Fullscreen covers the editor container (toolbar, editing area, status bar).
const fullscreen = new Fullscreen(document.getElementById('app')!)
// Collaboration (e2e only): ?collab=<document>&token=<token> joins the test server.
const params = new URLSearchParams(location.search)
const collabDoc = params.get('collab')
const shared = collabDoc
  ? collab({
      url: 'ws://localhost:4174',
      documentName: collabDoc,
      token: params.get('token') ?? '',
    })
  : null

// Comments: through the collaboration server when connected (authors set by the server),
// otherwise kept in this page only.
const comments = shared
  ? collabCommentStore(shared.provider)
  : createMemoryCommentStore({ id: 'local', name: 'Tu' })

const state = EditorState.create({
  schema,
  plugins: [
    history(),
    filePlugin(fileOptions),
    keymap(fileKeymap(fileOptions), { priority: 80, readOnly: true }),
    // protected blocks: ids starting with "lock" (a real app asks its server)
    ...blockPermissions({ canEdit: (id) => !id.startsWith('lock'), t }),
    ...(shared?.plugins ?? []),
    commentsPlugin(comments),
    suggestionsPlugin({ store: comments, t }),
    keymap(commentsKeymap(comments, t), { priority: 80, readOnly: true }),
    pasteClean(),
    ...imagePlugins(t, images),
    ...findReplacePlugins(),
    ...slashCommands(slashItems, t),
    ...mentions({ search: searchPeople, t }),
    ...aiAssistant(aiOptions),
    keymap(aiKeymap(aiOptions), { priority: 90 }),
    bubbleMenu({
      items: [
        ...markItems(schema),
        ...linkToolbarItems(schema, t),
        commentToolbarItem(comments, t),
        aiToolbarItem(aiOptions),
      ],
      t,
      mac: false,
    }),
    keymap(bubbleKeymap(), { priority: 80, readOnly: true }),
    keymap(slashKeymap(slashItems, t), { priority: 110 }),
    keymap(mentionKeymap(), { priority: 110 }),
    ...markdownShortcuts(schema),
    keymap(findReplaceKeymap(t), { priority: 80, readOnly: true }),
    keymap(fullscreenKeymap(fullscreen), { priority: 80, readOnly: true }),
    keymap(imageKeymap(t, images), { priority: 70 }),
    keymap(taskKeymap(), { priority: 70 }),
    codeHighlight({ lowlight: createLowlight(common) }),
    keymap(codeBlockKeymap(), { priority: 60 }),
    ...tablePlugins(),
    keymap(tableKeymap(), { priority: 55 }),
    keymap(listKeymap(schema), { priority: 50 }),
    keymap(textStyleKeymap({ indent: listIndentCommands(schema) })),
    keymap(linkKeymap(t)),
    keymap(historyKeymap),
    keymap(formatKeymap(schema)),
    keymap(baseKeymap),
  ],
})
defineScribaToolbar()
defineScribaMenubar()
const app = document.getElementById('app')!
const menubar = document.createElement('scriba-menubar')
app.appendChild(menubar)
const toolbar = document.createElement('scriba-toolbar')
app.appendChild(toolbar)
// read-only mode: ?readonly in the URL or window.scriba.setReadOnly()
let readOnly = new URLSearchParams(location.search).has('readonly')
let canComment = new URLSearchParams(location.search).has('comment')
const view = new EditorView(app, {
  state,
  label: 'Editor di prova',
  // example node view: tasks drawn by a Vue component
  nodeViews: {
    task: vueNodeView(TaskView, { t }),
    callout: vueNodeView(CalloutView, { t }),
  },
  // collaborative: editable only once the server allows writing
  editable: () =>
    !readOnly && (!shared || (shared.provider.status === 'connected' && shared.provider.canWrite)),
  // commenters: read-only but may comment (locally with ?comment, or as the server says)
  canAnnotate: () =>
    canComment ||
    (!!shared && shared.provider.status === 'connected' && shared.provider.canComment),
})
if (shared) {
  app.appendChild(collabStatusElement(document, shared.provider, t))
  shared.provider.onStatus(() => view.updateState(view.state))
}
toolbar.mac = false
toolbar.translator = t
const styleMenu = blockStyleMenu(schema)
toolbar.items = [
  toolbarGroup('history', 'toolbar.group.history', historyItems(), 3),
  toolbarGroup('text-style', 'toolbar.group.textStyle', [
    ...(styleMenu ? [{ ...styleMenu, priority: 3 }] : []),
    ...fontItems(schema),
  ]),
  toolbarGroup('format', 'toolbar.group.format', markItems(schema), 2),
  toolbarGroup('colors', 'toolbar.group.colors', colorItems(schema)),
  toolbarGroup(
    'insert',
    'toolbar.group.insert',
    [
      ...linkToolbarItems(schema, t),
      ...imageToolbarItems(schema, t, images),
      ...tableToolbarItems(schema, t),
      charmapToolbarItem(t),
      commentToolbarItem(comments, t),
      aiToolbarItem(aiOptions),
    ],
    2,
  ),
  toolbarGroup('lists', 'toolbar.group.lists', [
    ...listToolbarItems(schema, { indent: false }).map((item) => ({ ...item, priority: 2 })),
    ...indentItems({ indent: listIndentCommands(schema) }),
    alignmentMenu(),
  ]),
  toolbarGroup('blocks', 'toolbar.group.blocks', [
    ...blockquoteToolbarItems(schema),
    ...codeBlockToolbarItems(schema),
  ]),
  toolbarGroup('view', 'toolbar.group.view', [
    suggestToolbarItem(),
    findReplaceToolbarItem(t),
    sourceToolbarItem(t),
    fullscreenToolbarItem(fullscreen),
  ]),
]
// --- Menu bar like TinyMCE's (file edit view insert format tools table), '|' between groups ---
menubar.translator = t
const fileEntries = fileMenu(fileOptions).entries
const fileEntry = (id: string) => fileEntries.find((e) => e.id === id)!
const wordCountItem: ToolbarButton = {
  type: 'button',
  id: 'wordcount',
  label: (tr) => tr('wordcount.title'),
  command: () => true,
  readOnly: true,
  run: (v) => void openWordCountDialog(v, t),
}
menubar.menus = [
  {
    id: 'file',
    label: 'menu.file',
    items: [
      fileEntry('new'),
      fileEntry('open'),
      '|',
      fileEntry('preview'),
      '|',
      fileEntry('save-html'),
      fileEntry('save-docx'),
      fileEntry('save-markdown'),
      fileEntry('save-text'),
      '|',
      fileEntry('print'),
    ],
  },
  {
    id: 'edit',
    label: 'menu.edit',
    items: [...historyItems(), '|', selectAllItem(), '|', findReplaceToolbarItem(t)],
  },
  {
    id: 'view',
    label: 'menu.view',
    items: [
      sourceToolbarItem(t),
      suggestToolbarItem(),
      '|',
      fileEntry('preview'),
      fullscreenToolbarItem(fullscreen),
    ],
  },
  {
    id: 'insert',
    label: 'menu.insert',
    items: [
      ...imageToolbarItems(schema, t, images),
      ...linkToolbarItems(schema, t),
      commentToolbarItem(comments, t),
      ...codeBlockToolbarItems(schema),
      '|',
      charmapToolbarItem(t),
      '|',
      taskToolbarItem(schema),
      calloutToolbarItem(schema),
      ...blockquoteToolbarItems(schema),
    ],
  },
  {
    id: 'format',
    label: 'menu.format',
    items: [
      ...markItems(schema),
      '|',
      ...(styleMenu ? [styleMenu] : []),
      ...fontItems(schema),
      alignmentMenu(),
      '|',
      ...colorItems(schema),
      '|',
      clearFormatItem(),
    ],
  },
  {
    id: 'tools',
    label: 'menu.tools',
    items: [aiToolbarItem(aiOptions), '|', wordCountItem],
  },
  { id: 'table', label: 'menu.table', items: tableToolbarItems(schema, t) },
]
menubar.view = view
toolbar.view = view
const sidebar = document.createElement('aside')
sidebar.className = 'comments-sidebar'
document.body.appendChild(sidebar)
commentsPanel(view, { store: comments, t, container: sidebar })
app.appendChild(createWordCountStatus(view, t, { delay: 50 }).el)

const cspViolations: string[] = []
document.addEventListener('securitypolicyviolation', (e) =>
  cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`),
)

Object.assign(window, {
  scriba: {
    view,
    html: () => serializeHTML(view.state.doc),
    markdown: () => serializeMarkdown(view.state.doc),
    json: () => view.state.doc.toJSON(),
    selection: () => ({ from: view.state.selection.from, to: view.state.selection.to }),
    cspViolations,
    /** Loads HTML as the integrator would (setContent): ids included. */
    setHTML(source: string) {
      const doc = parseHTML(schema, parseInertHTML(source).body)
      view.updateState(EditorState.create({ schema, doc, plugins: view.state.plugins }))
    },
    setCanComment(on: boolean) {
      canComment = on
      view.updateState(view.state)
    },
    setReadOnly(on: boolean) {
      readOnly = on
      view.updateState(view.state)
    },
  },
})
