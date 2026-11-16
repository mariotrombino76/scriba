**English** · [Italiano](it/plugin.md)

# Plugins

Every feature beyond basic text is a plugin, in a `@scriba-editor/plugin-*` package. A plugin
usually brings four things; take only the ones you need:

1. **Nodes or marks** to add to the **schema** (e.g. `tableNodes`, `linkMarks`);
2. **plugins** to add to the **state** (e.g. `tablePlugins()`);
3. **shortcuts** (`...Keymap`), to add with `keymap(...)`;
4. **UI items** for the toolbar, menu bar, "/" and right-click menu
   (`...ToolbarItems`, `...SlashItem`, `...ContextMenu`).

The complete example, with all the plugins together, is `demo/main.ts` (`pnpm dev`).

## Writing and structure

| Package             | What it is for                                                                                                                                      | Main exports                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin-list`       | Nested bulleted and numbered lists, Tab/Shift+Tab, styles (circle, square, a/A/i/I)                                                                 | `listNodes`, `listKeymap`, `listToolbarItems`, `listStyleMenus`, `toggleList`, `listIndentCommands`                                                                                                                     |
| `plugin-blockquote` | Blockquotes                                                                                                                                         | `blockquoteNodes`, `toggleBlockquote`, `blockquoteToolbarItems`                                                                                                                                                         |
| `plugin-code-block` | Code blocks with safe highlighting (lowlight → decorations)                                                                                         | `codeBlockNodes`, `codeHighlight`, `codeBlockKeymap`, `codeBlockToolbarItems`                                                                                                                                           |
| `plugin-text-style` | Alignment, indentation, line height, text direction (RTL), upper/lower case, styles using your site's classes, colors, font and size (typed styles) | `textStyleMarks`, `withBlockStyles`, `withBlockClasses`, `classMarks`, `classFormatsMenu`, `textStyleKeymap`, `alignmentMenu`, `lineHeightMenu`, `caseMenu`, `directionItems`, `indentItems`, `colorItems`, `fontItems` |
| `plugin-hr`         | Horizontal rule and page break                                                                                                                      | `hrNodes`, `hrPlugins`, `hrToolbarItems`, `hrSlashItems`                                                                                                                                                                |
| `plugin-callout`    | Callout boxes (info, tip, warning, danger)                                                                                                          | `calloutNodes`, `toggleCallout`, `calloutToolbarItem`, `calloutSlashItem`                                                                                                                                               |
| `plugin-task`       | Tasks with a checkbox and a due date (Vue view)                                                                                                     | `taskNodes`, `insertTask`, `taskKeymap`, `taskToolbarItem`                                                                                                                                                              |
| `plugin-details`    | Collapsible sections (accordion, `<details>`): title, open/close                                                                                    | `detailsNodes`, `detailsNodeView`, `detailsKeymap`, `detailsAutoOpen`, `detailsToolbarItem`, `detailsSlashItem`                                                                                                         |
| `plugin-footnotes`  | Automatically numbered footnotes, with the list at the end always in sync (Ctrl+Alt+F)                                                              | `footnoteNodes`, `footnotes`, `footnotesKeymap`, `insertFootnote`, `goToFootnote`, `footnoteToolbarItem`                                                                                                                |
| `plugin-toc`        | Table of contents kept up to date with the headings (with `withAnchors` on the headings)                                                            | `tocNodes`, `tableOfContents`, `insertTableOfContents`, `tocToolbarItem`, `tocSlashItem`                                                                                                                                |
| `plugin-math`       | Formulas: LaTeX in the document, MathML in the HTML (KaTeX, `trust` disabled), live preview                                                         | `createMathNodes(katex)`, `mathNodeView`, `mathPlugins`, `mathKeymap`, `insertMath`, `mathToolbarItem`, `mathSlashItem`                                                                                                 |
| `plugin-merge-tags` | Merge fields `{{customer.name}}`: menu, suggestions after `{{`, `fillMergeTags`                                                                     | `mergeTagNodes`, `mergeTags`, `mergeTagMenu`, `insertMergeTag`, `fillMergeTags`, `mergeTagsIn`                                                                                                                          |
| `plugin-template`   | Document templates with preview, also loaded from the server; placeholders `{{name}}`, `{{date}}`, `{{time}}`                                       | `templateToolbarItem`, `openTemplateDialog`, `parseTemplate`, `insertTemplate`, `fillPlaceholders`                                                                                                                      |
| `plugin-markdown`   | Markdown shortcuts as you type, import and export                                                                                                   | `markdownShortcuts`, `parseMarkdown`, `serializeMarkdown`                                                                                                                                                               |
| `plugin-datetime`   | Insert date and time                                                                                                                                | `dateTimeMenu`, `formatDateTime`                                                                                                                                                                                        |
| `plugin-charmap`    | Special characters and emoji                                                                                                                        | `charmapToolbarItem`, `openCharmapDialog`                                                                                                                                                                               |

The accordion is shown in the editor with its own view: pass
`nodeViews: { details: detailsNodeView(t) }` to the editor (the CDN script does this on its own)
and add `keymap(detailsKeymap(), { priority: 70 })` and `detailsAutoOpen()` to the plugins.
Without the view, the browser would use the native `<details>`, which opens and closes on its own
outside the document.

Saving: put `keymap(saveKeymap({ save }), { priority: 90 })` before the File menu's keymap, so
that Ctrl+S calls your function instead of downloading the file; `save(doc)` receives the document
(use `serializeHTML(doc)`), and the server must still pass it through
`@scriba-editor/sanitize-server`.

Your site's styles (Format ▸ Styles): list the classes once and use the same lists in the browser
schema and the server schema.

```ts
const BLOCK = ['margin-note', 'warning'],
  INLINE = ['highlight']
const schema = new Schema({
  nodes: withBlockClasses(withBlockStyles(nodes), BLOCK),
  marks: { ...marks, ...classMarks(INLINE) },
})
classFormatsMenu(schema, [{ label: 'Warning', class: 'warning', kind: 'block' }])
```

Other classes (Word's `MsoNormal`, those from web pages) are discarded; names can only be
`[a-z][a-z0-9-]*` and never `scriba-…`, which is reserved for the editor. The CSS for the classes
is yours.

Formulas: pass KaTeX to the schema, so you decide when to load it (even only when needed):

```ts
import katex from 'katex' // or: const katex = (await import('katex')).default
const schema = new Schema({ nodes: { ...nodes, ...createMathNodes(katex) }, marks })
// nodeViews: { math_inline: mathNodeView(t), math_display: mathNodeView(t) }
```

The HTML contains MathML, which browsers display on their own, without KaTeX's scripts or CSS.

| Package              | What it is for                                                                                                                                                                                                                              | Main exports                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin-link`        | Links with an accessible dialog; open, remove; automatic links as you type; anchors                                                                                                                                                         | `linkMarks`, `linkKeymap`, `linkToolbarItems`, `linkContextMenu`, `autolink`, `withAnchors`, `anchorToolbarItem`                                         |
| `plugin-image`       | Images: upload through your function, drag and paste, resize, alt text, photo editing                                                                                                                                                       | `imageNodes`, `imagePlugins`, `imageKeymap`, `imageToolbarItems`, `imageEditToolbarItems`, `imageContextMenu`                                            |
| `plugin-embed`       | Media like TinyMCE: YouTube (privacy-enhanced), Vimeo, Dailymotion, Spotify, Google Maps (iframe with `sandbox`, domain whitelist) and video/audio files (https or relative, upload through your function); cards and players in the editor | `embedNodes`, `mediaNodes`, `embedNodeView`, `mediaFileNodeView`, `embedPlugins`, `embedKeymap`, `embedToolbarItem`, `embedSlashItem`, `openMediaDialog` |
| `plugin-table`       | Tables: rows/columns, merge/split, headers, widths, cell selection, sorting by column                                                                                                                                                       | `tableNodes`, `tablePlugins`, `tableKeymap`, `tableToolbarItems`, `tableContextMenu`, `sortTable`                                                        |
| `plugin-mention`     | `@person` mentions with asynchronous search                                                                                                                                                                                                 | `mentionNodes`, `mentions`, `mentionKeymap`                                                                                                              |
| `plugin-paste-clean` | Cleans up pastes from Word, Google Docs, web pages                                                                                                                                                                                          | `pasteClean`                                                                                                                                             |

## Tools and UI

| Package                 | What it is for                                                                                         | Main exports                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `plugin-slash`          | "/" menu of blocks and actions                                                                         | `slashCommands`, `slashKeymap`, `basicSlashItems`                                        |
| `plugin-bubble`         | Formatting bar above the selected text                                                                 | `bubbleMenu`, `bubbleKeymap`                                                             |
| `plugin-find-replace`   | Find and replace, also with regex (in an interruptible Web Worker)                                     | `findReplacePlugins`, `findReplaceKeymap`, `findReplaceToolbarItem`                      |
| `plugin-source`         | HTML source view (what you edit goes through the schema again)                                         | `sourceToolbarItem`, `openSourceDialog`                                                  |
| `plugin-fullscreen`     | Fullscreen                                                                                             | `Fullscreen`, `fullscreenKeymap`, `fullscreenToolbarItem`                                |
| `plugin-word-count`     | Word and character count                                                                               | `createWordCountStatus`, `openWordCountDialog`                                           |
| `plugin-statusbar`      | Status bar: element path (`p › strong`) and a handle to resize the editor                              | `createElementPath`, `elementPath`, `createResizeHandle`                                 |
| `plugin-save`           | Save button and Ctrl+S with your function, active only with unsaved changes                            | `savePlugin`, `saveKeymap`, `saveItem`, `saveCommand`, `isDirty`, `markSaved`            |
| `plugin-file`           | File menu: new (or your own `onNewDocument`), open (.docx, .html, .md, .txt), download, preview, print | `filePlugin`, `fileKeymap`, `fileMenu`                                                   |
| `plugin-help`           | Help menu with the shortcuts (Alt+0)                                                                   | `helpItem`, `helpKeymap`, `shortcutsFromItems`                                           |
| `plugin-autosave`       | Draft saved in the browser while you type, "Restore last draft"                                        | `autosave`, `restoreDraftItem`, `restoreDraft`, `clearDraft`                             |
| `plugin-visual-aids`    | Shows blocks and invisible characters (only in the editor, the HTML does not change)                   | `visualAids`, `visualAidsItems`, `toggleVisualBlocks`, `toggleVisualChars`               |
| `plugin-format-painter` | Format painter: gives one text's formatting to another (Ctrl+Alt+C / Ctrl+Alt+V)                       | `formatPainter`, `formatPainterKeymap`, `formatPainterItem`, `copyFormat`, `pasteFormat` |
| `plugin-a11y-checker`   | Accessibility checker (WCAG 2.2 A/AA/AAA): one issue at a time, with explanation and fix               | `a11yChecker`, `a11yCheckerItem`, `openA11yDialog`, `checkAccessibility`, `a11yIssues`   |

From the UI package (`@scriba-editor/ui`): `<scriba-toolbar>`, `<scriba-menubar>`,
`contextMenu(view, { sections })` for the right-click menu, `clipboardItems` (cut, copy, paste),
`historyItems`, `markItems`, `blockStyleMenu`.

## Teamwork and AI

| Package              | What it is for                                                                                                                                   | Main exports                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `plugin-collab`      | Real-time collaboration (Yjs) with other users' cursors                                                                                          | `collab`, `collabCommentStore` — see [Collaboration](collaboration.md)                    |
| `plugin-comments`    | Comments with threads and proposed changes (track changes)                                                                                       | `commentMarks`, `commentsPlugin`, `commentsPanel`, `suggestionMarks`, `suggestionsPlugin` |
| `plugin-permissions` | Protected blocks (not editable by some users), also checked on the server; a selection that contains them deletes only the rest                  | `withBlockIds`, `blockPermissions`                                                        |
| `plugin-ai`          | AI assistant with your own backend: text, generated blocks, several versions                                                                     | see the [AI guide](../packages/plugins/ai/README.md)                                      |
| `plugin-revisions`   | Version history: list of the versions saved by your server, comparison with the current document (added/removed, word by word), undoable restore | `revisionsToolbarItem`, `openRevisionDialog`, `diffDocs`, `parseRevision`                 |

### Version history

The editor does not save versions on its own: your server keeps them (for example on every
save). You give it two functions:

```ts
import { revisionsToolbarItem } from '@scriba-editor/plugin-revisions'

const revisions = {
  locale: 'it',
  // the versions, most recent first
  revisions: () => fetch('/api/doc/42/versions').then((r) => r.json()),
  // the content of a version: HTML or the JSON from doc.toJSON()
  content: (v) => fetch(`/api/doc/42/versions/${v.id}`).then((r) => r.text()),
}
// in the File menu, next to Save
revisionsToolbarItem(t, revisions)
```

The dialog shows the versions as radio buttons (you choose with the arrow keys), and a preview
of the chosen one, compared with the current document: underlined in green is what was **added
since**, struck through in red is what was **removed since**. "Previous difference / Next
difference" steps through them and reads them out to screen readers. "Restore this version"
replaces the document in a single undo step (not available in read-only mode). The content of the
versions is untrusted input: it goes through the schema parser, like `setContent`.

## Shortcut order and priority

Several plugins can react to the same key (Enter in a list, in a table, in the "/" menu). Give
higher priorities to more specific contexts. The order used in the demo, from highest:

| Priority | Shortcuts                                                                         |
| -------- | --------------------------------------------------------------------------------- |
| 110      | "/" menu and mentions (when they are open)                                        |
| 90       | AI assistant                                                                      |
| 80       | file, find, fullscreen, comments, help (also in read-only mode: `readOnly: true`) |
| 70       | images, tasks                                                                     |
| 60       | code blocks                                                                       |
| 55       | tables                                                                            |
| 50       | lists                                                                             |
| default  | styles, links, history, formatting, `baseKeymap` (last)                           |

## Writing a plugin

A Scriba plugin is ordinary code that uses the same APIs as the built-in plugins: nodes or marks
for the schema, `(state, dispatch?) => boolean` commands, a `Plugin` for state and decorations,
and toolbar items that call the commands. The built-in plugins are the reference: `plugin-hr` and
`plugin-datetime` are the smallest ones to read. Remember the security rules: no `innerHTML`,
attributes validated in the schema, external content always through the parser.
