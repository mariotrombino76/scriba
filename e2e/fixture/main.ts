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
  contextMenu,
  defineScribaMenubar,
  defineScribaToolbar,
  historyItems,
  clearFormatItem,
  clipboardItems,
  nonBreakingSpaceItem,
  selectAllItem,
  type ToolbarButton,
  markItems,
  toolbarGroup,
} from '@scriba/ui'
import {
  listIndentCommands,
  listKeymap,
  listNodes,
  listStyleMenus,
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
  directionItems,
  caseMenu,
  lineHeightMenu,
  colorItems,
  fontItems,
  indentItems,
  textStyleKeymap,
  textStyleMarks,
  withBlockStyles,
} from '@scriba/plugin-text-style'
import {
  anchorToolbarItem,
  autolink,
  linkContextMenu,
  linkKeymap,
  linkMarks,
  linkToolbarItems,
  withAnchors,
} from '@scriba/plugin-link'
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
  imageContextMenu,
  imageToolbarItems,
  type ImageUploadOptions,
} from '@scriba/plugin-image'
import {
  insertTable,
  tableKeymap,
  tableNodes,
  tablePlugins,
  tableContextMenu,
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
import {
  detailsAutoOpen,
  detailsKeymap,
  detailsNodeView,
  detailsNodes,
  detailsSlashItem,
  detailsToggleItem,
  detailsToolbarItem,
} from '@scriba/plugin-details'
import { visualAids, visualAidsItems } from '@scriba/plugin-visual-aids'
import { createElementPath, createResizeHandle } from '@scriba/plugin-statusbar'
import { saveItem, saveKeymap, savePlugin, type SaveOptions } from '@scriba/plugin-save'
import {
  embedKeymap,
  embedNodeView,
  embedNodes,
  embedPlugins,
  embedSlashItem,
  embedToolbarItem,
  mediaFileNodeView,
  mediaNodes,
  type MediaOptions,
} from '@scriba/plugin-embed'
import { hrNodes, hrPlugins, hrSlashItems, hrToolbarItems } from '@scriba/plugin-hr'
import { dateTimeMenu } from '@scriba/plugin-datetime'
import { autosave, restoreDraftItem } from '@scriba/plugin-autosave'
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
  editingHelp,
  helpItem,
  helpKeymap,
  markdownHelp,
  navigationHelp,
  shortcutsFromItems,
  type HelpOptions,
} from '@scriba/plugin-help'
import {
  aiAssistant,
  aiKeymap,
  aiToolbarItem,
  blockAiActions,
  defaultAiActions,
  openAiMenu,
  variantAiActions,
  type AiComplete,
  type AiOptions,
  type AiRequest,
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
// Media upload (e2e): the file is not sent anywhere; a short silent WAV of the fixture
// stands for the URL the server would return (same origin, so the strict CSP allows it)
const silence = new URL('./media/silence.wav', import.meta.url).pathname
const mediaOptions: MediaOptions = { upload: () => Promise.resolve(silence) }
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
    withAnchors(
      withBlockStyles({
        ...basicSchemaSpec.nodes,
        ...blockquoteNodes,
        ...listNodes,
        ...codeBlockNodes,
        ...imageNodes,
        ...mentionNodes,
        ...taskNodes,
        ...calloutNodes,
        ...detailsNodes,
        ...embedNodes,
        ...mediaNodes,
        ...hrNodes,
        ...tableNodes,
      }),
    ),
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
/**
 * Generative blocks (output "blocks"): a real backend gives the model
 * aiBlocksPrompt(schema, req.blocks) and answers with its JSON lines. Here:
 * blocks built from the selected text; "ATTACCO" in it adds hostile lines.
 */
function fakeBlocks(req: AiRequest): string[] {
  const items = req.text
    .split(/[,.;\n]+|\s+e\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const text = (s: string) => ({ type: 'text', text: s })
  const para = (s: string) => ({ type: 'paragraph', content: s ? [text(s)] : [] })
  const cell = (s: string, type = 'table_cell') => ({ type, content: [para(s)] })
  const blocks: object[] =
    req.action === 'make_table'
      ? [
          {
            type: 'table',
            content: [
              {
                type: 'table_row',
                content: [cell('N.', 'table_header'), cell('Voce', 'table_header')],
              },
              ...items.map((s, i) => ({
                type: 'table_row',
                content: [cell(String(i + 1)), cell(s)],
              })),
            ],
          },
        ]
      : req.action === 'extract_tasks'
        ? items.map((s) => ({ type: 'task', attrs: { title: s } }))
        : [{ type: 'callout', attrs: { kind: 'info' }, content: [para(req.text)] }]
  if (req.text.includes('ATTACCO'))
    blocks.unshift(
      {
        type: 'paragraph',
        content: [{ type: 'image', attrs: { src: 'https://evil.example/x.png' } }],
      },
      { type: 'task', attrs: { title: 'x', onclick: 'alert(1)' } },
      { type: 'script', content: [text('alert(1)')] },
    )
  return blocks.map((b) => JSON.stringify(b) + '\n')
}
const fakeAi: AiComplete = (req) =>
  (async function* () {
    if (req.output === 'blocks') {
      for (const line of fakeBlocks(req)) {
        // half a line, then the rest: a block appears once its line is complete
        const half = Math.ceil(line.length / 2)
        for (const part of [line.slice(0, half), line.slice(half)]) {
          await wait(req.prompt === 'lento' ? 400 : 40, req.signal)
          yield part
        }
      }
      return
    }
    // several versions: a different answer for each (a real backend varies the request)
    const VARIANTS: Record<string, string[]> = {
      rewrite_variants: ['Versione formale', 'Versione colloquiale', 'Versione breve'],
      summarize_variants: [
        'Sintesi in una riga.',
        'Sintesi per punti.',
        'Sintesi per chi ha fretta.',
      ],
    }
    const text =
      req.variant !== undefined && VARIANTS[req.action]
        ? VARIANTS[req.action]![req.variant]!
        : req.prompt === 'attacco'
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
  actions: [...defaultAiActions, ...variantAiActions(), ...blockAiActions(schema)],
  parse: (text, s) => parseMarkdown(s, text).content,
  t,
}

// Slash menu: blocks and actions from the plugins in use.
const slashItems: SlashItem[] = [
  ...basicSlashItems(schema),
  taskSlashItem(schema),
  calloutSlashItem(schema),
  detailsSlashItem(schema),
  embedSlashItem(t, mediaOptions),
  ...hrSlashItems(schema),
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

// Help ▸ Keyboard shortcuts (Alt+0): the toolbar and menu shortcuts plus the keys without a button
const helpOptions: HelpOptions = {
  t,
  mac: false,
  groups: () => [
    shortcutsFromItems([...(toolbar.items ?? []), ...menubar.menus.flatMap((m) => m.items)]),
    editingHelp({ slash: true, mentions: true }),
    markdownHelp(),
    navigationHelp({ bubble: true, contextMenu: true }),
  ],
}
// drafts kept in this browser while writing (File ▸ Restore last draft)
const draftOptions = { key: 'scriba-e2e', delay: 300 }
// Save (Ctrl+S): the e2e tests read what was saved
const saved: string[] = []
const saveOptions: SaveOptions = { save: (doc) => void saved.push(serializeHTML(doc)) }
const state = EditorState.create({
  schema,
  plugins: [
    history(),
    filePlugin(fileOptions),
    savePlugin(),
    keymap(saveKeymap(saveOptions), { priority: 90 }),
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
    autosave(draftOptions),
    autolink(schema.marks['link']!),
    keymap(findReplaceKeymap(t), { priority: 80, readOnly: true }),
    keymap(fullscreenKeymap(fullscreen), { priority: 80, readOnly: true }),
    keymap(helpKeymap(helpOptions), { priority: 80, readOnly: true }),
    keymap(imageKeymap(t, images), { priority: 70 }),
    keymap(taskKeymap(), { priority: 70 }),
    keymap(detailsKeymap(), { priority: 70 }),
    keymap(embedKeymap(t, mediaOptions), { priority: 70 }),
    ...embedPlugins(t, mediaOptions),
    detailsAutoOpen(),
    visualAids(),
    codeHighlight({ lowlight: createLowlight(common) }),
    keymap(codeBlockKeymap(), { priority: 60 }),
    ...tablePlugins(),
    ...hrPlugins(t),
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
    details: detailsNodeView(t),
    embed: embedNodeView(t),
    video_file: mediaFileNodeView(t),
    audio_file: mediaFileNodeView(t),
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
      saveItem(saveOptions),
      restoreDraftItem(draftOptions),
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
    items: [
      ...historyItems(),
      '|',
      ...clipboardItems(t, { mac: false }),
      '|',
      selectAllItem(),
      '|',
      findReplaceToolbarItem(t),
    ],
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
      '|',
      ...visualAidsItems(),
    ],
  },
  {
    id: 'insert',
    label: 'menu.insert',
    items: [
      ...imageToolbarItems(schema, t, images),
      embedToolbarItem(t, mediaOptions),
      ...linkToolbarItems(schema, t),
      anchorToolbarItem(t),
      commentToolbarItem(comments, t),
      ...codeBlockToolbarItems(schema),
      '|',
      charmapToolbarItem(t),
      hrToolbarItems(schema)[0]!,
      nonBreakingSpaceItem(),
      '|',
      hrToolbarItems(schema)[1]!,
      '|',
      dateTimeMenu(),
      '|',
      taskToolbarItem(schema),
      calloutToolbarItem(schema),
      detailsToolbarItem(schema),
      detailsToggleItem(),
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
      caseMenu('it'),
      lineHeightMenu(),
      ...directionItems(),
      ...listStyleMenus(schema),
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
  { id: 'help', label: 'menu.help', items: [helpItem(helpOptions)] },
]
menubar.view = view
// right click on a link, an image or a table (elsewhere: the browser's menu), like TinyMCE
contextMenu(view, {
  translator: t,
  mac: false,
  sections: [
    linkContextMenu(schema, t),
    imageContextMenu(schema, t, images),
    tableContextMenu(schema, t),
  ],
})
toolbar.view = view
const sidebar = document.createElement('aside')
sidebar.className = 'comments-sidebar'
document.body.appendChild(sidebar)
commentsPanel(view, { store: comments, t, container: sidebar })
// status bar like TinyMCE's: element path, words, resize handle
const statusbar = document.createElement('div')
statusbar.className = 'scriba-statusbar'
statusbar.append(
  createElementPath(view, t).el,
  createWordCountStatus(view, t, { delay: 50 }).el,
  createResizeHandle(view, t).el,
)
app.appendChild(statusbar)

const cspViolations: string[] = []
document.addEventListener('securitypolicyviolation', (e) =>
  cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`),
)

Object.assign(window, {
  scriba: {
    view,
    html: () => serializeHTML(view.state.doc),
    saved,
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
