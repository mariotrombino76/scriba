/// <reference types="vite/client" />
import {
  EditorState,
  Slice,
  TextSelection,
  baseKeymap,
  Schema,
  basicSchemaSpec,
  formatKeymap,
  history,
  historyKeymap,
  keymap,
  parseHTML,
  redoDepth,
  serializeHTML,
  undoDepth,
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
  classFormatsMenu,
  classMarks,
  withBlockClasses,
  type ClassFormat,
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
import {
  footnoteGoToItem,
  footnoteNodes,
  footnotes,
  footnotesKeymap,
  footnoteSlashItem,
  footnoteToolbarItem,
} from '@scriba/plugin-footnotes'
import { mergeTagMenu, mergeTagNodes, mergeTags, type MergeTag } from '@scriba/plugin-merge-tags'
import { tableOfContents, tocNodes, tocSlashItem, tocToolbarItem } from '@scriba/plugin-toc'
import katex from 'katex'
import {
  createMathNodes,
  mathKeymap,
  mathNodeView,
  mathPlugins,
  mathSlashItem,
  mathToolbarItem,
} from '@scriba/plugin-math'
import { createElementPath, createResizeHandle } from '@scriba/plugin-statusbar'
import { saveItem, saveKeymap, savePlugin, type SaveOptions } from '@scriba/plugin-save'
import {
  formatPainter,
  formatPainterItem,
  formatPainterKeymap,
} from '@scriba/plugin-format-painter'
import { a11yChecker, a11yCheckerItem } from '@scriba/plugin-a11y-checker'
import { templateToolbarItem, type TemplateOptions } from '@scriba/plugin-template'
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
import { autosave, clearDraft, restoreDraftItem } from '@scriba/plugin-autosave'
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
import '../packages/themes/scriba.css'

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
// Styles (Format ▸ Styles): the classes this site styles; the same lists go to the server schema
const BLOCK_CLASSES = ['nota-margine', 'avviso']
const INLINE_CLASSES = ['evidenza']
const classFormats: ClassFormat[] = [
  { label: 'Nota a margine', class: 'nota-margine', kind: 'block' },
  { label: 'Avviso', class: 'avviso', kind: 'block' },
  { label: 'Evidenza', class: 'evidenza', kind: 'inline' },
]
// Merge tags (Insert ▸ Merge tag, or type "{{"): filled in later by the app
const tags: MergeTag[] = [
  { name: 'cliente.nome', label: 'Nome', group: 'Cliente' },
  { name: 'cliente.email', label: 'E-mail', group: 'Cliente' },
  { name: 'data_oggi', label: 'Data di oggi' },
]
// document templates (Inserisci ▸ Modello…): one loaded later, as from a server
const templateOptions: TemplateOptions = {
  locale: 'it-IT',
  values: { azienda: 'Ditta Esempio' },
  templates: [
    {
      title: 'Verbale di riunione',
      description: 'Titolo, data, partecipanti e decisioni.',
      content:
        '<h2>Verbale di riunione</h2><p><strong>Azienda:</strong> {{azienda}}</p><p><strong>Data:</strong> {{date}}</p><h3>Partecipanti</h3><ul><li><p></p></li></ul><h3>Decisioni</h3><ol><li><p></p></li></ol>',
    },
    {
      title: 'Lettera',
      description: 'Intestazione, oggetto e saluti finali.',
      content: () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                '<p>{{azienda}}</p><p>Oggetto: </p><p>Gentile cliente,</p><p></p><p>Cordiali saluti.</p>',
              ),
            300,
          ),
        ),
    },
    {
      title: 'Modello non disponibile',
      description: 'Il server non risponde.',
      content: () => Promise.reject(new Error('offline')),
    },
  ],
}
const schema = new Schema({
  nodes: withBlockIds(
    withAnchors(
      withBlockClasses(
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
          ...footnoteNodes,
          ...mergeTagNodes,
          ...tocNodes,
          ...createMathNodes(katex),
        }),
        BLOCK_CLASSES,
      ),
    ),
  ),
  marks: {
    ...linkMarks,
    ...basicSchemaSpec.marks,
    ...textStyleMarks,
    ...classMarks(INLINE_CLASSES),
    ...commentMarks,
    ...suggestionMarks,
  },
})

const SAMPLE = `
<h1>Benvenuto in Scriba</h1>
<p>Questo è un editor <strong>rich text</strong> basato su uno <em>schema</em>:
ciò che lo schema non conosce viene <u>scartato</u>, mai eseguito.</p>
<h2>Cose da provare</h2>
<p>Scrivi, premi Invio, seleziona del testo e usa <code>Ctrl+B</code>.<br>Poi <s>annulla</s> con Ctrl+Z.</p>
<ul><li><p>Elenchi puntati e numerati: <code>Ctrl+Shift+8</code> / <code>Ctrl+Shift+7</code></p>
<ul><li><p>Tab per rientrare, Shift+Tab per tornare indietro</p></li></ul></li>
<li><p>Invio su un elemento vuoto per uscire dall'elenco</p></li></ul>
<pre><code class="language-typescript">// Blocchi di codice: Ctrl+Alt+Maiusc+C, tre Invio o Ctrl+Invio per uscire
function saluta(nome: string): string {
  return \`Ciao, \${nome}!\`
}</code></pre>
<blockquote><p>Citazioni dal pulsante ❝ — Backspace all'inizio per uscirne.</p></blockquote>
<table><tr><th><p>Funzione</p></th><th><p>Come</p></th></tr><tr><td><p>Tabelle</p></td><td><p>Tab per passare alla cella successiva, trascina per selezionare più celle, menu «Tabella» per righe, colonne, unione</p></td></tr><tr><td><p>Larghezza colonne</p></td><td><p>Trascina il bordo destro di una cella</p></td></tr></table>
<p>Incolla del testo da Word o Google Docs e guarda l'HTML a destra.</p>
<aside data-callout="tip"><p>Riquadro disegnato da un componente Vue: scegli il tipo in alto, il testo qui dentro si modifica come il resto.</p></aside>
<p data-block-id="lock-clausola">Blocco protetto: si legge, si commenta, ma non si modifica (data-block-id con permesso negato).</p>`

const XSS = `<p onclick="alert(1)">Testo <b>in grassetto</b><img src=x onerror="alert('xss')"><script>alert(1)</script> <a href="javascript:alert(1)">link</a></p>`

// File ▸ Save keeps the document in this browser (localStorage); a real app sends it to its
// server. At start it is read back as untrusted input, through the schema like any content.
const SAVED_KEY = 'scriba-demo-saved'
function savedHTML(): string | null {
  try {
    return localStorage.getItem(SAVED_KEY)
  } catch {
    return null // storage blocked (private mode, policy): start from the sample
  }
}
const doc = parseHTML(schema, parseInertHTML(savedHTML() ?? SAMPLE).body)
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
// Media: in this demo files are linked by address (a real app passes `upload`, which sends
// the file to its server and returns the https URL)
const mediaOptions: MediaOptions = {}
const mergeTagSuggest = mergeTags(tags, t)
const slashItems: SlashItem[] = [
  ...basicSlashItems(schema),
  taskSlashItem(schema),
  calloutSlashItem(schema),
  detailsSlashItem(schema),
  footnoteSlashItem(schema),
  tocSlashItem(schema),
  mathSlashItem(t),
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
const fullscreen = new Fullscreen(document.querySelector<HTMLElement>('.editor-area')!)
// Collaboration: open /?collab=<document>&token=tok-anna (and tok-bruno or tok-ospite
// in another browser) while `pnpm collab` runs the test server.
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
  groups: () => [
    shortcutsFromItems([...(toolbar.items ?? []), ...menubar.menus.flatMap((m) => m.items)]),
    editingHelp({ slash: true, mentions: true }),
    markdownHelp(),
    navigationHelp({ bubble: true, contextMenu: true }),
  ],
}
// drafts kept in this browser while writing (File ▸ Restore last draft)
const draftOptions = { key: 'scriba-demo', delay: 2000 }
// Save (Ctrl+S): here it waits a moment and drops the browser draft; your app sends the HTML
// to its server (which passes it through @scriba/sanitize-server)
const saveOptions: SaveOptions = {
  save: (doc) =>
    new Promise<void>((resolve) => setTimeout(resolve, 300)).then(() => {
      localStorage.setItem(SAVED_KEY, serializeHTML(doc)) // a failure leaves it "not saved"
      clearDraft(draftOptions)
    }),
}
const state = EditorState.create({
  doc,
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
    }),
    keymap(bubbleKeymap(), { priority: 80, readOnly: true }),
    keymap(slashKeymap(slashItems, t), { priority: 110 }),
    keymap(mentionKeymap(), { priority: 110 }),
    ...mergeTagSuggest.plugins,
    keymap(mergeTagSuggest.keymap(), { priority: 110 }),
    ...markdownShortcuts(schema),
    autosave(draftOptions),
    autolink(schema.marks['link']!),
    keymap(findReplaceKeymap(t), { priority: 80, readOnly: true }),
    keymap(fullscreenKeymap(fullscreen), { priority: 80, readOnly: true }),
    keymap(helpKeymap(helpOptions), { priority: 80, readOnly: true }),
    keymap(imageKeymap(t, images), { priority: 70 }),
    keymap(taskKeymap(), { priority: 70 }),
    keymap(detailsKeymap(), { priority: 70 }),
    keymap(footnotesKeymap(schema), { priority: 70 }),
    footnotes(),
    tableOfContents(),
    formatPainter(t),
    keymap(formatPainterKeymap(), { priority: 85 }),
    a11yChecker(),
    keymap(mathKeymap(t), { priority: 70 }),
    ...mathPlugins(t),
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

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const outHTML = $('out-html')
const outJSON = $('out-json')
const outMd = $('out-md')
const status = $('status')
let readOnly = false
let canComment = false

const view: EditorView = new EditorView($('editor'), {
  state,
  label: 'Testo del documento',
  // example node view: tasks drawn by a Vue component
  nodeViews: {
    task: vueNodeView(TaskView, { t }),
    callout: vueNodeView(CalloutView, { t }),
    details: detailsNodeView(t),
    embed: embedNodeView(t),
    video_file: mediaFileNodeView(t),
    audio_file: mediaFileNodeView(t),
    math_inline: mathNodeView(t),
    math_display: mathNodeView(t),
  },
  editable: () =>
    !readOnly && (!shared || (shared.provider.status === 'connected' && shared.provider.canWrite)),
  // commenters: read-only but may comment (locally with ?comment, or as the server says)
  canAnnotate: () =>
    canComment ||
    (!!shared && shared.provider.status === 'connected' && shared.provider.canComment),
  dispatchTransaction(tr) {
    view.updateState(view.state.apply(tr))
    refresh()
  },
})

// File ▸ New document: a new, empty document with its own (empty) history. A real app
// creates the document on its server, with its own id and permissions, and opens it.
// With collaboration the room is the document: no new document here.
if (!shared)
  fileOptions.onNewDocument = (v) => {
    v.updateState(EditorState.create({ schema: v.state.schema, plugins: v.state.plugins }))
    v.focus()
    refresh()
  }

// --- Toolbar: the real <scriba-toolbar> from @scriba/ui ---
defineScribaToolbar()
defineScribaMenubar()
const menubar = document.createElement('scriba-menubar')
$('toolbar-slot').appendChild(menubar)
const toolbar = document.createElement('scriba-toolbar')
$('toolbar-slot').appendChild(toolbar)
toolbar.translator = t
const styleMenu = blockStyleMenu(schema)
toolbar.items = [
  toolbarGroup('history', 'toolbar.group.history', historyItems(), 3),
  toolbarGroup('text-style', 'toolbar.group.textStyle', [
    ...(styleMenu ? [{ ...styleMenu, priority: 3 }] : []),
    ...fontItems(schema),
  ]),
  toolbarGroup('format', 'toolbar.group.format', [...markItems(schema), formatPainterItem()], 2),
  toolbarGroup('colors', 'toolbar.group.colors', colorItems(schema)),
  toolbarGroup(
    'insert',
    'toolbar.group.insert',
    [
      ...linkToolbarItems(schema, t),
      ...imageToolbarItems(schema, t, images),
      ...tableToolbarItems(schema, t),
      charmapToolbarItem(t),
      taskToolbarItem(schema),
      calloutToolbarItem(schema),
      commentToolbarItem(comments, t),
      aiToolbarItem(aiOptions),
    ],
    2,
  ),
  toolbarGroup('lists', 'toolbar.group.lists', [
    ...listToolbarItems(schema, { indent: false }).map((item) => ({ ...item, priority: 2 })),
    ...listStyleMenus(schema),
    ...indentItems({ indent: listIndentCommands(schema) }),
    alignmentMenu(),
    lineHeightMenu(),
    ...directionItems(),
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
      ...clipboardItems(t),
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
      '|',
      footnoteToolbarItem(schema),
      footnoteGoToItem(),
      tocToolbarItem(schema),
      mathToolbarItem(t),
      mergeTagMenu(tags),
      templateToolbarItem(t, templateOptions),
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
      classFormatsMenu(schema, classFormats),
      caseMenu('it'),
      lineHeightMenu(),
      ...directionItems(),
      '|',
      ...colorItems(schema),
      '|',
      formatPainterItem(),
      clearFormatItem(),
    ],
  },
  {
    id: 'tools',
    label: 'menu.tools',
    items: [aiToolbarItem(aiOptions), '|', a11yCheckerItem(t), wordCountItem],
  },
  { id: 'table', label: 'menu.table', items: tableToolbarItems(schema, t) },
  { id: 'help', label: 'menu.help', items: [helpItem(helpOptions)] },
]
menubar.view = view
// right click on a link, an image or a table (elsewhere: the browser's menu), like TinyMCE
contextMenu(view, {
  translator: t,
  sections: [
    linkContextMenu(schema, t),
    imageContextMenu(schema, t, images),
    tableContextMenu(schema, t),
  ],
})
toolbar.view = view
commentsPanel(view, { store: comments, t, container: $('comments') })
// status bar like TinyMCE's: element path, words, (collaboration), resize handle
const statusbar = document.createElement('div')
statusbar.className = 'scriba-statusbar'
statusbar.append(createElementPath(view, t).el, createWordCountStatus(view, t).el)
status.before(statusbar)
if (shared) {
  statusbar.append(collabStatusElement(document, shared.provider, t))
  shared.provider.onStatus(() => view.updateState(view.state))
}
statusbar.append(createResizeHandle(view, t).el)

// demo: the role to try (editor, commenter = read-only but may comment, reader)
document.querySelector('.role-switch')!.addEventListener('change', (event) => {
  const role = (event.target as HTMLInputElement).value
  readOnly = role !== 'edit'
  canComment = role === 'comment'
  view.updateState(view.state)
  refresh()
})

function refresh(): void {
  const s = view.state
  outHTML.textContent = serializeHTML(s.doc)
  outJSON.textContent = JSON.stringify(s.doc.toJSON(), null, 2)
  outMd.textContent = serializeMarkdown(s.doc)
  status.textContent = `annulla: ${undoDepth(s)} · ripeti: ${redoDepth(s)}`
}

// --- Security demo: simulate pasting hostile HTML ---
$('xss-sample').textContent = XSS
// back to the sample document: forgets what was saved in this browser
$('reset-sample').addEventListener('click', () => {
  try {
    localStorage.removeItem(SAVED_KEY)
  } catch {
    // nothing saved
  }
  clearDraft(draftOptions)
  const sample = parseHTML(schema, parseInertHTML(SAMPLE).body)
  view.updateState(EditorState.create({ schema, doc: sample, plugins: view.state.plugins }))
  refresh()
  view.focus()
})

$('paste-xss').addEventListener('click', () => {
  const pasted = parseHTML(schema, parseInertHTML(XSS).body)
  const tr = view.state.tr.setSelection(
    TextSelection.create(view.state.doc, view.state.doc.content.size - 1),
  )
  tr.replaceSelection(Slice.maxOpen(pasted.content))
  view.dispatch(tr)
  view.focus()
})

refresh()
view.focus()
