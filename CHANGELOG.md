**English** · [Italiano](CHANGELOG.it.md)

# Changelog

All notable changes to Scriba are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/). While the packages stay at version
`0.x`, the public API may change even between minor versions: every breaking change is still
flagged here in the **Changed** section, marked **breaking**.

## Unreleased

### Changed

- **Documentation:** now in English and Italian. English is the main language (`README.md`,
  `docs/`, every package README, `SECURITY.md`, `CHANGELOG.md`); the Italian text is next to it
  (`*.it.md`, `docs/it/`). Each file links to the other language at the top.

## 0.1.1 — 2026-11-16

### Fixed

- **view:** a selection made right before leaving the editor (for example Shift+Home and then
  straight to the menu or the toolbar with the keyboard) is no longer lost: the command acted on
  the old cursor, and bold stayed "pending" instead of being applied to the selected text.
  The editor now reads the selection even when it loses focus.
- **text-style:** Backspace at the start of an indented block removes one level of indentation,
  as in Word, Google Docs and TinyMCE. Before, on a heading at the start of the document, it
  removed both indentation and heading in one go (it became a paragraph). New command
  `outdentAtStart`, already included in `textStyleKeymap`.
- **core:** when Backspace turns the first block of the document into a paragraph, the paragraph
  keeps the attributes it shares with the previous block (alignment, indentation, direction).

### Changed

- **Dependencies:** `parse5` 8.1.0 (`sanitize-server`), `ws` 8.22.1 (`collab-server`), `docx` 9.15.3
  (`plugin-file`).
- **Documentation:** the CDN examples have `integrity` (SRI) and `crossorigin`, and explain that
  `/js/editor.js` is a file of the site that uses Scriba.
- **Publishing:** the packages are published with npm's _Trusted Publisher_ (OIDC, no stored
  token) and with provenance.

## 0.1.0 — 2026-11-10

First public release. All `@scriba-editor/*` packages ship with the same version number.

### Added

#### Foundations (Phase 1)

- `@scriba-editor/core`
  - Schema with content expressions, immutable nodes and marks, integer positions, `Slice` and
    a schema-validated replace algorithm.
  - Invertible steps: `ReplaceStep`, `ReplaceAroundStep`, `AddMarkStep`, `RemoveMarkStep`,
    `SetAttrsStep`, node type change. Position mapping and `Transform`.
  - `EditorState`, `Transaction`, selections (text, node), plugins, commands
    `(state, dispatch?, view?) => boolean`, DOM-free keymaps with priority.
  - History (undo/redo) with time-based grouping.
  - HTML parser on a `DOMLike` interface and serializer with text and attribute escaping.
  - Typed styles: property whitelist with strict validators, `withStyle` helper.
  - `insertContent`: adapts pasted content to the insertion point.
  - `serialize: false` option for marks: visible in the editor, excluded from the HTML.
- `@scriba-editor/view`
  - `contentEditable` controlled via `beforeinput`, per-node reconciliation, selection
    synchronized in both directions, IME composition.
  - Sanitized clipboard; paste as plain text with Ctrl/Cmd+Shift+V.
  - Inline decorations (visual only: not saved, not undoable, not shared).
  - Plugin node views; `posAtCoords`, `coordsAtPos`, `subscribe()`.
  - Hooks: `transformPastedDOM`, `handleDrop`, `handlePasteFiles`, `handlePasteContent`,
    `handleDoubleClickNode`, `handleTextInput`.
- `@scriba-editor/sanitize-server`: the same schema as the core, on the server (Node, `parse5`).
- `@scriba-editor/ui`
  - `<scriba-toolbar>` Web Component without Shadow DOM, WAI-ARIA toolbar pattern.
  - Named groups, menus that show the current value, submenus and "More options" when space
    runs out, `menuitemcheckbox` items, SVG icons.
  - Generic dialog with focus trap and focus return.
  - `toolbarGroup`, `historyItems`, `markItems`, `blockStyleMenu` API.
- `@scriba-editor/vue`: `<ScribaEditor v-model>` (HTML or JSON) and the `useScriba()` composable.
- `@scriba-editor/i18n`: typed messages in Italian and English, with fallback and overrides.
- `@scriba-editor/themes`: `scriba.css` with CSS variables, light and dark themes, WCAG contrast
  verified by tests.

#### TinyMCE parity (Phase 2)

- `@scriba-editor/plugin-list`: nested bulleted and numbered lists, Tab/Shift+Tab, Ctrl+Shift+8/7.
- `@scriba-editor/plugin-blockquote`: blockquotes.
- `@scriba-editor/plugin-link`: link mark with URL whitelist, accessible dialog, Ctrl+K.
- `@scriba-editor/plugin-text-style`: alignment, indentation, text color, highlight, font and
  size.
- `@scriba-editor/plugin-code-block`: code blocks with syntax highlighting (`lowlight`
  turned into decorations) and language selection.
- `@scriba-editor/plugin-paste-clean`: clean paste from Word, Google Docs and web pages.
- `@scriba-editor/plugin-image`: images with file picker, drag and drop, paste, resizing,
  alt text and alignment. The upload is an integrator callback.
- `@scriba-editor/plugin-table`: tables with cell selection, merge and split, header rows and
  columns, column resizing, caption, table and cell properties, insertion grid, copy and paste
  of cells.
- `@scriba-editor/plugin-word-count`: word and character count with `Intl.Segmenter`.
- `@scriba-editor/plugin-fullscreen`: fullscreen (Ctrl+Shift+F).
- `@scriba-editor/plugin-source`: HTML source view and editing.
- `@scriba-editor/plugin-find-replace`: find and replace, regex included.
- `@scriba-editor/plugin-charmap`: special characters and emoji with search in Italian and English.

#### Beyond TinyMCE (Phase 3)

- `@scriba-editor/plugin-markdown`: Markdown shortcuts while typing, `serializeMarkdown`
  (CommonMark + GFM tables), `parseMarkdown` and `markdownToHTML`.
- `@scriba-editor/plugin-slash`: slash commands with a filterable list and accessible combobox.
- `@scriba-editor/plugin-bubble`: compact toolbar above the selected text (Alt+F10).
- `@scriba-editor/plugin-collab`
  - `yBinding({ ydoc })`: document ↔ Yjs synchronization.
  - `collabCursors`: other users' cursors and selections.
  - `CollabProvider` and `collab({ url, documentName, token, user })`: WebSocket transport with
    reconnection and observable status; `collabStatusElement`.
  - `collabCommentStore(provider)`: comments shared through the server.
- `@scriba-editor/collab-server`: collaboration server compatible with `y-websocket`, with
  authentication, per-document permissions, limits and persistence (`attachCollabServer`,
  `listenCollabServer`, `documentFromYjs`).
- `@scriba-editor/plugin-ai`: `aiAssistant({ complete, parse, t, actions })`, streamed responses
  with Accept (a single undo step), Discard, Stop and Retry.
  - Generative UI in the document: actions that respond with blocks (`blockAiActions`: Create a
    table, Extract the tasks, Put in a callout). The model responds in NDJSON (one JSON node
    per line); `blocksParser` validates each line with the schema (`nodeFromJSON`) and with a
    whitelist (the action's top-level types; inside, only containers and text; formatting-only
    marks, no images, mentions, comments or links unless requested) and limits on blocks,
    nodes and depth. Blocks appear as soon as their lines are complete.
  - Several versions to choose from: an action with `variants` (2–5) makes one request per
    version (`variant`, `variants` in the request), shows the chosen one and the bar offers the
    "Version 1 · 2 · 3" picker (radio, arrow keys, keys 1–5); Accept keeps the one shown, Stop
    stops them all, a failed version does not block the others. `variantAiActions()` (Rewrite
    and Summarize with three proposals), `selectVariant`, `MAX_VARIANTS`.
  - For the backend: the request carries `output: "blocks"` and `blocks`; `aiBlocksPrompt` and
    `aiBlocksJsonSchema` describe the format to the model.
- `@scriba-editor/plugin-comments`
  - Comments with threads, replies, resolve/reopen and side panel (Ctrl/Cmd+Alt+M).
  - `CommentStore` and `createMemoryCommentStore`.
  - Suggested changes (track changes): `suggestionMarks`, `suggestionsPlugin`,
    `resolveSuggestion`, `resolveAllSuggestions`.
- `@scriba-editor/plugin-mention`: `@person` mentions with an asynchronous data source.
  - Inline, atomic `mention` node (`mentionNodes`), with `id` and `label`; in HTML
    `<span class="scriba-mention" data-mention-id="…">@Name</span>`, in Markdown `@Name`.
  - `mentions({ search, t, debounce, maxResults, timeout })` and `mentionKeymap()`: "@" at the
    start of a line or after a space opens the list; `search(query, signal)` belongs to the
    integrator, a newer search cancels the previous one and late responses are ignored.
  - Choosing a mention is an undo step of its own.
- `@scriba-editor/plugin-permissions`: locked blocks.
  - `withBlockIds`: optional block id (`data-block-id`), assigned by the integrator.
  - `blockPermissions({ canEdit, t, allowMarks, trusted, onRefused })`: a block with
    `canEdit(id) === false` cannot be edited, deleted or duplicated. Reading, selecting and
    commenting remain possible. A notice is read by screen readers; remote changes from
    collaboration go through.
  - Pasted ids are removed; when a block is split, the id stays with only one piece.
  - `checkBlockEdits(before, after, rules)` for the server, `transactionAllowed(tr, rules)`.
- Node views (nodes drawn by a component):
  - `@scriba-editor/view`: `nodeViews` option for atomic nodes (`dom`, `update`, `selectNode`,
    `deselectNode`, `stopEvent`, `destroy`) and `view.nodeDOM(pos)`. Mutations and events of the
    inner controls stay with the component. The HTML always comes from `toHTML`.
  - `@scriba-editor/vue`: `vueNodeView(Component, { t, appContext })`, `nodeViews` option of
    `useScriba` and of `<ScribaEditor>`, example component `TaskView`.
  - Node views with editable content: the node view provides `contentDOM`, where the editor
    draws and edits the node's content as anywhere else; the rest belongs to the component
    (`contenteditable="false"`). In Vue: `<NodeViewContent />`.
  - `@scriba-editor/ui`: `<scriba-menubar>` menu bar above the toolbar, like TinyMCE (File, Edit,
    View, Insert, Format, Tools, Table). WAI-ARIA menubar pattern; reuses the toolbar controls
    (menus become submenus, same permissions); `'|'` separates groups. New items
    `clearFormatItem` (clear formatting; links and comments stay) and `selectAllItem`.
  - Right-click menu like TinyMCE: `contextMenu(view, { sections })` in `@scriba-editor/ui`,
    sections `linkContextMenu` (edit, remove, open in new tab with `noopener`),
    `imageContextMenu` (right-click selects the image) and `tableContextMenu` (Cell, Row, Column
    submenus; table properties and delete table). Where no section applies, and with Ctrl (Cmd
    on macOS), the browser menu stays; the menu key and Shift+F10 open it at the cursor.
    `MenuPopup.openAt(x, y)`, `popupEntries`, `withoutPressed`.
  - Cut, Copy, Paste and Paste as text in the Edit menu, like TinyMCE (`clipboardItems`). Copy
    and cut use the browser's `copy` event (filled by the serializer), then the Clipboard API;
    Paste reads the clipboard with the Clipboard API (the browser may ask for permission) and,
    if the browser refuses, a message points to Ctrl+V.
- `@scriba-editor/view`: `view.clipboardContent()` and `view.paste({ html, text, files })`: same
  path as the `paste` event (inert document, plugin cleanup, schema parser).
- `@scriba-editor/plugin-hr`: horizontal rule (`<hr>`) and page break
  (`<hr class="scriba-page-break">`, new page when printing and in Word), like TinyMCE's hr and
  pagebreak plugins. Insert menu, "/" commands, Markdown `---`. No attributes: other classes
  and attributes of an `<hr>` are discarded, by `sanitize-server` too.
- `@scriba-editor/plugin-datetime`: Insert ▸ Date/time, like TinyMCE's insertdatetime: time, ISO
  date, long and short date in the page language, inserted as plain text. The items show the
  time at the moment the menu opens (`live` in `@scriba-editor/ui` menu items).
- `@scriba-editor/react`: React 18/19 wrapper, `<ScribaEditor value onChange>` (HTML or JSON,
  `editable`, `locale`, `toolbar`, `ref` with `getContent`/`setContent`/`focus`) and the
  `useScriba()` hook; works with `StrictMode`. Tested in jsdom and in the three browsers with
  the strict CSP (`e2e/react.spec.ts`).
- `@scriba-editor/view`: `parseContent`, `serializeContent` and `sameContent` (previously in the
  Vue wrapper, which still exports them), shared by Vue, React and the CDN build.
- `@scriba-editor/browser`: Scriba in any page without a framework or build step:
  `scriba.iife.js` (global `Scriba`, ~84 KB gzip with the full preset), `scriba.js` (ES module)
  and `scriba.css`; `Scriba.createEditor(target, { content, preset, toolbar, locale, onChange, upload })`.
  Tested in jsdom and in the three browsers with the strict CSP (`e2e/cdn.spec.ts`).
- Preparation for publishing on npm: `publishConfig.access: public` in all packages and the
  `RELEASING.md` guide (npm organization, 2FA, provenance from CI, checks, version).
- Formatting missing compared to TinyMCE (tags, attributes and values approved on 2026-10-19):
  - `@scriba-editor/core`: `superscript`/`subscript` marks (`<sup>`/`<sub>`, mutually
    exclusive), Ctrl/Cmd+. and Ctrl/Cmd+,; `insertNonBreakingSpace` (Ctrl/Cmd+Shift+Space);
    typed styles `line-height` (1, 1.15, 1.5, 2) and `list-style-type` (disc, circle, square).
  - `@scriba-editor/plugin-text-style`: line height (`lineHeightMenu`, `setLineHeight`) and text
    direction (`directionItems`, `setTextDirection`: `dir="rtl"`; left to right is the default
    and does not write the attribute, so Google Docs' `dir="ltr"` does not clutter the HTML).
  - `@scriba-editor/plugin-list`: list styles like advlist (`listStyleMenus`, `setListStyle`):
    bulleted disc/circle/square, numbered 1/a/A/i/I (`type` attribute), also read from Word
    styles.
  - `@scriba-editor/ui`: Superscript and Subscript buttons in `markItems`, `nonBreakingSpaceItem`.
  - `@scriba-editor/plugin-file`: superscript and subscript in the Word export too.
  - `@scriba-editor/plugin-link`: anchors like TinyMCE's anchor (`withAnchors`,
    `anchorToolbarItem`, `setAnchor`): `id="anchor-<name>"` on paragraphs and headings, only
    with the fixed prefix and a safe name (against DOM clobbering); name unique in the
    document; links point to `#anchor-<name>`.
  - `@scriba-editor/plugin-autosave` (new): draft saved in the browser while you type, like
    TinyMCE's autosave (`autosave`, only after the first change, per-document key, size limit);
    "Restore last draft" in the File menu (`restoreDraftItem`, undoable); the draft comes back
    only through `nodeFromJSON` (untrusted input); `clearDraft` after the real save.
  - `@scriba-editor/plugin-link`: automatic links like TinyMCE's autolink (`autolink`): after a
    space or Enter, `https://…`, `www.…` and email addresses become links (URL whitelist; never
    other protocols, never in code); Ctrl+Z after the space removes the link and keeps the text.
  - `@scriba-editor/plugin-details` (new): collapsible sections like TinyMCE's accordion
    (`<details>`/`<summary>`, only the `open` attribute): `detailsNodes`, `insertDetails`,
    `removeDetails`, `toggleDetailsOpen`, `detailsToolbarItem`, `detailsSlashItem`. In the
    editor, a view (`detailsNodeView`) with the open/close button; Enter in the title moves to
    the content, Backspace in an empty section removes it, `detailsAutoOpen` opens the section
    when the cursor enters the hidden content (search, undo). Included in the
    `@scriba-editor/browser` preset.
  - `@scriba-editor/plugin-visual-aids` (new): "Show blocks" and "Show invisible characters" like
    TinyMCE's visualblocks and visualchars (`visualAids`, `visualAidsItems`), only in the
    editor: the HTML does not change.
  - `@scriba-editor/plugin-embed` (new): media like TinyMCE's media plugin, with a whitelist.
    - Services in an `<iframe>` (`embedNodes`): YouTube in privacy-enhanced mode, Vimeo,
      Dailymotion, Spotify (tracks, albums, playlists, episodes) and Google Maps; only the exact
      player address, rebuilt from the checked reference, with fixed `sandbox`,
      `referrerpolicy` and `loading`. In the editor, a card (`embedNodeView`): the player is not
      loaded while you type.
    - Video and audio files (`mediaNodes`: `<video controls>`, `<audio controls>`), https or
      relative address; never `autoplay`, `poster`, `data:`, `blob:`. In the editor, the real
      player (`mediaFileNodeView`).
    - Single Insert ▸ Media dialog (`openMediaDialog`): accepts the usual links (youtube.com/watch,
      youtu.be, vimeo.com, dai.ly, open.spotify.com), the Google Maps «Embed» code, a file
      address, or uploads a file with your `upload` function.
  - `@scriba-editor/plugin-statusbar` (new): status bar like TinyMCE's: element path
    (`createElementPath`, one button per block that selects it) and resize handle
    (`createResizeHandle`: dragging, arrow keys, Esc for automatic height; height set via
    CSSOM).
  - `@scriba-editor/plugin-save` (new): Save button and Ctrl/Cmd+S like TinyMCE's save plugin
    (`savePlugin`, `saveKeymap`, `saveItem`): calls your function, active only with unsaved
    changes, never two saves at once; an error leaves the document "unsaved".
  - `@scriba-editor/plugin-text-style`: upper and lower case like TinyMCE's Case Change
    (`caseMenu`, `changeCase`: lowercase, UPPERCASE, Title Case, Sentence case), with the
    language's rules, formatting preserved and one undo step each.
  - `@scriba-editor/plugin-text-style`: styles with the site's classes like TinyMCE's
    style_formats (`withBlockClasses`, `classMarks`, `classFormatsMenu`, `setBlockClass`): only
    the classes listed by the integrator (approved on 2026-10-26), one per block or per text.
  - `@scriba-editor/plugin-footnotes` (new): footnotes like TinyMCE's Footnotes: references
    `<sup><a href="#fn-N" id="fnref-N">`, list `<ol class="scriba-footnotes">` at the end;
    numbers in reading order and notes kept in sync automatically (also after paste, undo,
    collaboration), Ctrl+Alt+F, go to the note and back.
  - `@scriba-editor/plugin-toc` (new): table of contents like TinyMCE's Table of Contents
    (`<ol class="scriba-toc">` of links to the headings' anchors), updated with the headings;
    headings without an anchor get one, existing ones do not change.
  - `@scriba-editor/plugin-merge-tags` (new): merge fields like TinyMCE's Merge Tags
    (`<span data-merge-tag="name">{{name}}</span>`): menu, suggestions after `{{`,
    `fillMergeTags` for the merge (values as text), `mergeTagsIn`.
  - `@scriba-editor/plugin-mention`: the suggestion menu is now a generic engine
    (`createSuggestion`), used by `@` and by `{{`; mentions API unchanged.
  - `@scriba-editor/core`: `withAttr` and `withClass` to decorate the output of other nodes
    (previously copied into several plugins); when a rule's node cannot fit at that point, the
    parser tries the next rule (no text lost).
  - `@scriba-editor/plugin-math` (new): formulas like TinyMCE's math plugin: LaTeX in the
    document, MathML in the HTML generated by KaTeX 0.19.0 (approved on 2026-10-26; passed in by
    the integrator with `createMathNodes(katex)`), `trust: false`, limits against recursive
    macros, cache of already rendered formulas. From incoming HTML only the LaTeX annotation is
    read. Dialog with live preview, inline or on a line of its own; in the editor, the real
    MathML.
  - `@scriba-editor/sanitize-server`: the parse5 adapter exposes MathML elements like the
    browser DOM (the parser reads from a `<math>` only the LaTeX annotation, if the schema has
    formulas; otherwise it discards it).
  - `@scriba-editor/core`: the parser accepts `<iframe>`, `<video>`, `<audio>` and `<math>` only
    as a leaf node of a schema that has a rule for them (without reading their content as
    text); `media` URL rule (https or relative only); the serializer never writes `srcdoc` or
    `autoplay` and refuses an `<iframe>` without `sandbox`.
  - `@scriba-editor/plugin-format-painter` (new): copy formatting like TinyMCE's Format Painter.
    The button copies the formatting at the cursor and applies it on the next click or
    selection (once; Esc or the button again to cancel); Ctrl+Alt+C copies, Ctrl+Alt+V
    applies. It copies formatting marks (not links or comments) and, for fully selected
    blocks, type (paragraph/heading and level), alignment, indentation, line height,
    direction and class; never `id`. One undo step; theme cursor and a screen reader message
    while it waits. Also in the full CDN preset.
  - `@scriba-editor/ui`: `isFormattingMark`, the same criterion as "Clear formatting".
  - `@scriba-editor/plugin-a11y-checker` (new): accessibility check like TinyMCE's Accessibility
    Checker, against WCAG 2.2 level A, AA (default) or AAA. Tools ▸ "Check accessibility…"
    (also in read-only mode, without fixes) opens a dialog with one issue at a time: selected
    and highlighted in the text, plain explanation, WCAG criterion with the link to the W3C
    page, fix; Previous / Next / Ignore (for the session). Checks: image without alt text (or
    with a file name or a generic word, or too long), link without text or with generic text
    ("click here"), two identical links next to each other, empty heading or skipped heading
    level, bold paragraph used as a heading, hand-written list ("- one", "1. two"), table
    without headers, empty header, table without caption, video or map without title, contrast
    of colored text (also on highlight or cell background; large text at 3:1) with a suggested
    color of the same hue, justified text (AAA). Fixes in one click or with a field, each one
    an undo step. `checkAccessibility(doc, options)` is pure and DOM-free: it also works on
    the server, for example to refuse to save a document with errors. Also in the full CDN
    preset (toolbar button).
  - `@scriba-editor/plugin-image`: photo editing like TinyMCE's Enhanced Image Editing. Image
    context menu ▸ "Edit photo…" (or the `imageEditToolbarItems` contextual button) opens a
    dialog with a preview: rotate left/right, flip horizontally/vertically, crop by dragging
    the frame or its handles (mouse, pen, fingers) or by typing position and size in pixels
    (from the keyboard), with free, original, square, 4:3 or 16:9 aspect ratios; brightness,
    contrast and saturation. Drawn with the native canvas, no dependencies. The result is a
    new file (JPEG and WebP stay as they are, the rest becomes PNG) that goes through the
    `upload` function; without `upload` it becomes a `data:` URL within the schema limit. A
    single undo step; the width shown in the document keeps the scale. Images from other sites
    can be edited only if served with CORS; otherwise the dialog explains it.
    `openImageEditor`; pure functions `rotate`, `flip`, `aspectCrop`, `resizeCrop`,
    `editMatrix`, `adjustPixels`, `outputType`.
  - `@scriba-editor/plugin-table`: sorting rows by the cursor's column, ascending or
    descending, like TinyMCE's advanced tables (Table menu and context menu ▸ Column). Header
    rows at the top stay; numbers read in the content language (`lang` around the editor:
    1.234,5 in Italian), text in alphabetical order ignoring case and accents ("2" before
    "10"); empty cells always at the bottom; equal values in their previous order. Each row
    moves whole with its formatting; the cursor follows its row; one undo step. Not available
    with cells merged across rows. `sortTable`, `compareCellText`, `parseLocaleNumber`.
  - `@scriba-editor/i18n`: UI in French (`fr`), German (`de`) and Spanish (`es`), with local key
    names (Strg, Umschalt, Maj, Mayús…). They are imported as objects
    (`createTranslator(fr)`, `locale: fr` in the components), so unused languages stay out of
    the bundle; `createTranslator('it' | 'en')` still works by name. `@scriba-editor/browser`
    also recognizes them by name (`locale: 'fr'`, `'de-AT'`…). A test checks keys,
    `{name}` placeholders and absence of markup for every language.
  - Inline mode like TinyMCE's: `inline` option of `createEditor` (`@scriba-editor/browser`) and
    of the Vue and React components, `inlineToolbar(container, toolbar)` in
    `@scriba-editor/ui`. The text takes the page's styles (no frame, dashed border only with
    focus); the bar appears only while the editor has focus (also in its menus), above the
    text, below it if there is no room above, pinned to the top of the window when the text
    is taller than the screen and scrolls. Alt+F10 from the text enters the bar, Esc returns
    to the text. Positions via CSSOM (strict CSP).
  - Touch use (phones and tablets): tapping outside a menu closes it; a long press on text
    leaves the system menu (select, copy, paste) and opens the context menu only on images
    and other elements; after a tap the bubble menu goes below the selection, leaving room
    above for the system menu; a cell border can be dragged with a finger (wider grab area,
    even just past the border) without scrolling the page; the inline bar follows the visible
    part of the window (on-screen keyboard, zoom); element path and status bar handle at least
    2rem tall with touch.
  - A `README.md` for each package (in Italian): installation, usage example, what it exports,
    shortcuts, security and accessibility notes. The examples were compiled with `tsc` against
    the real APIs.
  - Automatic accessibility check (`e2e/a11y.spec.ts`, axe-core, development only): WCAG 2.2
    A/AA on the editor, menus, every dialog, dark theme and inline/CDN/React pages in the three
    browsers.
  - Toolbar pinned to the top while the text scrolls, like TinyMCE's `toolbar_sticky`:
    `stickyToolbar` option of `createEditor` or the `scriba-sticky` class on the container
    (Vue: `class`, React: `className`); `--scriba-sticky-offset` leaves room for a fixed page
    header.
  - `@scriba-editor/plugin-revisions` (new): version history like TinyMCE's Revision History.
    File ▸ "Version history…" opens a dialog with the versions saved by your server (date,
    author, label; newest first) and the preview of the chosen one, compared with the current
    document: matched blocks, then word by word inside paragraphs, also in lists and tables
    (whole rows); added in green underlined, removed in red strikethrough (not color alone).
    Previous / next difference, read to screen readers; a checkbox to see the version as it
    was. "Restore this version" replaces the document in one undo step; disabled in read-only
    mode, where the comparison stays available. HTML or JSON content, untrusted input (schema
    parser, length limit); versions loaded when chosen, slow responses ignored. Pure functions
    `diffDocs`, `diffSequence`, `slideEdits`, `parseRevision`. The demo keeps the last 20
    versions saved in the browser.
  - `@scriba-editor/plugin-template` (new): document templates like TinyMCE's template plugin.
    Insert ▸ "Template…" opens a dialog with the list of templates (radio buttons, chosen with
    the arrow keys), the description and a read-only preview drawn by an `EditorView`; Enter or
    "Insert" puts it at the cursor. The template's blocks stay whole (the paragraph at the
    cursor is split; an empty paragraph, an empty document or a full selection are replaced);
    where they do not fit (cell, code block) the content adapts like a paste. One undo step.
    List and contents can also be asynchronous (loaded from the server when needed, with
    loading and error messages; a slow response for a template no longer chosen is ignored).
    `{{name}}` placeholders in the text, with `date` and `time` ready-made in the chosen
    language: values always go in as text, never as markup, and do not touch attributes. The
    templates' HTML is untrusted input: inert document and schema parser, at most
    `MAX_TEMPLATE_LENGTH` characters. `parseTemplate`, `insertTemplate`, `fillPlaceholders`,
    `templateToolbarItem`, `openTemplateDialog`. In the full CDN preset with the `templates`
    option; `template` icon in `@scriba-editor/ui`.
- `@scriba-editor/plugin-help`: "Help" menu with the keyboard shortcuts, like TinyMCE's help
  plugin (Alt+0, also in read-only mode). `helpItem`, `helpKeymap`, `openHelpDialog`; groups
  `shortcutsFromItems` (the toolbar and menu shortcuts, with their labels), `editingHelp`,
  `markdownHelp`, `navigationHelp`. Dialog with one table per group and search.
- `@scriba-editor/plugin-file`: "File" menu as in TinyMCE, all in the browser.
  - Open (.docx, .html, .md, .txt), also by dragging the file; it first asks for confirmation if
    there are unsaved changes.
  - Download as HTML, Word (.docx), Markdown and text; preview and print (from which, PDF).
  - New document; Ctrl/Cmd+O, Ctrl/Cmd+S, Ctrl/Cmd+P.
  - New dependencies of the plugin only, loaded when needed: `mammoth` 1.13.0 (reading .docx),
    `docx` 9.8.1 (writing .docx), `jszip` 3.10.2. Override `mammoth>argparse` 2.0.1: argparse is
    only needed by mammoth's command line and removes `sprintf-js` (GHSA-hp3w-g68c-fv3c).
- `@scriba-editor/plugin-callout`: callout (`<aside class="scriba-callout" data-callout>`, types
  info, tip, warning, danger), `toggleCallout`, toolbar item and slash item; example component
  `CalloutView` in `@scriba-editor/vue`, with the type chosen from a group of radio buttons.
  - `@scriba-editor/plugin-task`: `task` node (title, done, due date), `insertTask`, `taskKeymap`
    (Enter goes into the fields, Space marks as done), toolbar item and slash item.
- `@scriba-editor/core`: `arrowAtom` in `baseKeymap`. With the arrow keys you enter an atomic
  block (it gets selected) and leave it toward the nearby text, instead of skipping it.
- `@scriba-editor/collab-server`: `canEditBlock` in `AuthResult` and `schema`/`field` options. An
  update that touches a locked block is reverted for everyone, sender included
  (`applyGuardedUpdate`).

- Performance (CLAUDE.md §7): core benchmarks on a 1 MB document in `packages/core/bench`
  (`pnpm bench`, with thresholds: typing, Enter, bold, undo; parsing, serialization, JSON),
  `pnpm test:perf` (Playwright, separate from the e2e suite: one keystroke in a 1 MB document
  under 16 ms, median, in the three browsers) and `pnpm size` (minified and gzip size; the
  core must stay under 60 KB gzip: today 25 KB, core + view 35.6 KB).

### Changed

- **Package names:** from `@scriba/*` to **`@scriba-editor/*`**, because the `@scriba` scope on
  npm belongs to another author. Only the name you install and import changes; the product is
  still called Scriba and the global of the CDN script is still `Scriba`.
- CI on GitHub Actions: checks and e2e on every push; publishing to npm with _provenance_ from a
  `v*` tag (`RELEASING.md`). Dependabot for dependencies and actions.
- **License:** from MIT to **Apache 2.0**. Every package now contains `LICENSE` and `NOTICE`.
  `NOTICE` attributes the project to Mario Trombino and must be kept in every redistribution or
  derivative work. `scriba.js` and `scriba.iife.js` (CDN) also carry the attribution at the
  top.
- Packages ready for npm, verified by installing the tarballs in a separate project (Vite, Vue,
  React, script, Node; TypeScript with `bundler` and `node16` resolution):
  - all `package.json` files have `repository`, `homepage` and `bugs` (GitHub);
  - `@scriba-editor/collab-server` and `@scriba-editor/sanitize-server` declare
    `engines.node >= 22`;
  - `@scriba-editor/browser` includes all the code in its own bundle, so it installs as
    dependencies only the packages referenced by its types (there were 25 before);
  - the types of `@scriba-editor/browser` no longer import the CSS;
  - the types of `@scriba-editor/vue` import `./ScribaEditor.vue.js` and also resolve with
    `moduleResolution: node16`;
  - `@scriba-editor/collab-server` declares `@types/ws` among its dependencies (its types use
    `ws`);
  - the source maps include the original TypeScript code (`inlineSources`): before, they
    pointed to unpublished `src/` files.
- `@scriba-editor/plugin-permissions`: a selection that contains locked blocks is no longer
  refused as a whole. Typing, Delete/Backspace, cut and paste delete everything else (a locked
  block that is only partly selected stays whole) and the text goes where the selection
  started, in a single undo step; Ctrl+A and then typing also works with a locked block.
  Functions `deleteKeepingLocked`, `deleteSelectionKeepingLocked`, `typeKeepingLocked`,
  `pasteKeepingLocked`. The final check is still `transactionAllowed`: if the result would touch
  a locked block, the change is refused as before (fuzz test in
  `permissions/test/edit.test.ts`, in the security suite).
- `@scriba-editor/plugin-permissions`: formatting too (bold, italic, colors…) of a selection
  that contains locked blocks is applied to the rest instead of being refused; pressing Ctrl+B
  a second time removes bold even if the locked text never had it. `marksAroundLocked`. A
  locked block on its own still cannot be formatted.
- `@scriba-editor/core`: new plugin hook `rewriteTransaction(tr, state)`: before filtering, a
  plugin can replace the transaction with an equivalent one it accepts (it inherits metadata
  and time and still goes through every `filterTransaction`). `toggleMark` tags its
  transaction with the `TOGGLE_MARK` metadata.
- `@scriba-editor/view`: new plugin prop `handleDeleteSelection(view)`, called before deleting a
  selection on cut or on a browser input event.
- **Breaking** — `@scriba-editor/plugin-image`: the `alt` attribute of images is `null` when the
  alt text is missing and `''` when the image is decorative. Before, an image without `alt`
  became `alt=""` (decorative) and nobody noticed; now it stays without `alt` in the HTML until
  someone describes it, and the accessibility check flags it. An upload without alt text also
  leaves `alt` as `null`.
- `@scriba-editor/view`: the selected node gets `scriba-selected-node` even when the editor does
  not have focus (for example if a dialog selects it).
- `@scriba-editor/themes`: `--scriba-warning` variable (AA contrast in light and dark).

- Performance with large documents (one keystroke in 1 MB of text, medians: Chromium ~10 ms,
  Firefox from ~14–22 to ~11 ms, WebKit from ~15–17 to ~12 ms):
  - `@scriba-editor/view`: reconciliation skips identical blocks at the start and end and works
    only on the changed part; highlighting the selected node no longer searches the whole
    document; `contenteditable` and `aria-readonly` are rewritten only when they change.
  - `@scriba-editor/ui`: the toolbar writes attributes, texts and `tabIndex` only when they
    change.
  - `@scriba-editor/core`: `canReplace` for expressions like `"block+"` checks only the new nodes
    and the count, not all children (the list/blockquote/code buttons update on every
    keystroke); same result as the full comparison.

- "Commenter" role (read-only, but can comment):
  - `@scriba-editor/core`: `annotation` option for marks (the comment mark uses it),
    `isAnnotationOnly(tr)`, `runKeymaps(..., { readOnly, canAnnotate })`.
  - `@scriba-editor/view`: `canAnnotate` option. Commenters have the cursor (keyboard selection)
    with `aria-readonly`; in read-only mode no text written by the browser (IME, spell checker)
    changes the document.
  - `@scriba-editor/ui`: `annotates` items, active for commenters; only transactions that touch
    annotations go through.
  - `@scriba-editor/collab-server`: `canComment` in `AuthResult`; `comment` level communicated to
    the client (`provider.canComment`); commenters' updates accepted only if they touch
    annotations (`applyAnnotationUpdate`), otherwise reverted for everyone; comments channel
    open to commenters.
- Read-only (`editable: () => false`):
  - `@scriba-editor/core`: `readOnly` option of `keymap()` and of `runKeymaps()`. In read-only
    mode only keymaps marked `readOnly: true` run, and no transaction that changes the document.
  - `@scriba-editor/ui`: `readOnly` items for buttons and menus (find, fullscreen, source),
    active in read-only mode too.
  - `@scriba-editor/view`: the area stays reachable with Tab (`tabindex="0"`).
  - To register with `readOnly: true`: `findReplaceKeymap` and `fullscreenKeymap`.
- `@scriba-editor/plugin-markdown`: inline leaves with `leafText` (e.g. mentions) are output as
  text.
- `@scriba-editor/core`: `textBetween` also separates atomic blocks (e.g. tasks) from nearby
  text.
- `@scriba-editor/core`, history: transactions appended by plugins (`appendTransaction`) are part
  of the same undo step as the transaction that generated them. Example: a keystroke turned
  into a suggestion is undone with a single Ctrl+Z.
- `@scriba-editor/core`, history: replacing whole blocks (rebuilt table, document from the source
  view) is always an undo step of its own, never merged with typing.
- `@scriba-editor/plugin-statusbar`, theme: the handle for resizing the editor has the class
  `scriba-statusbar-resize` (previously `scriba-resize-handle`, the same as the image handles).
  **Breaking** for anyone who restyled it.
- `@scriba-editor/ui`: menus close on `pointerdown` outside them (previously `mousedown`, which
  after a tap arrives late or not at all).
- `@scriba-editor/plugin-code-block`: the shortcut is Ctrl+Alt+Shift+C, because Ctrl+Alt+C in
  Chrome opens the developer tools.

### Fixed

- `@scriba-editor/plugin-autosave`: "Restore last draft" did nothing in a document with locked
  blocks, because it replaced the whole document. Now it changes only the blocks that differ
  (`draftTransaction`); if the draft really changes a locked block, with the translator
  (`restoreDraftItem(options, t)`) a dialog explains why it cannot be restored. The draft is
  now also written immediately when the page is reloaded or closed (`pagehide`) or hidden
  (`visibilitychange`): before, the changes of the last moments were lost.
- `@scriba-editor/plugin-file`: "New document" and "Open" in a document with locked blocks
  (`blockPermissions`) did nothing after "Continue without saving": the replacement was
  silently refused. Now the editor checks this before asking and shows a dialog that explains
  why the document cannot be replaced.
  New `onNewDocument` option of `FileOptions`: "New document" calls it (after the confirmation
  about unsaved changes) instead of emptying the document, so the application creates a truly
  new document, with its own id and permissions. The demo uses it with a new `EditorState`.
- Dependencies: `markdown-it` 15.0.3 in `@scriba-editor/plugin-markdown` (two denial-of-service
  advisories on 15.0.0–15.0.2, one high) and `undici` 8.12.2 for jsdom, in tests only (three
  advisories on 8.0.0–8.12.1). `pnpm audit`: no known vulnerabilities.
- `@scriba-editor/sanitize-server`: the HTML was parsed as a fragment, while the editor parses it
  as a whole document (`DOMParser`); with a `<noscript>` at the start the two results diverged
  (the browser recovered the content, the server discarded it). Now the server also parses a
  document and reads its `<body>`: the same tree on both sides, a rule against mutation XSS.
- `@scriba-editor/ui`: scrolling inside a menu (e.g. a long Format menu) closed the submenu that
  had just opened; now scrolling inside a menu does not close the others, scrolling the page
  does.
- `@scriba-editor/core` (HTML parser): loose text inside a node that starts with a required
  title (e.g. `<details>`) ended up in a second title and was discarded; now it goes into a
  paragraph. A node missing its required first child (e.g. `<details>` without `<summary>`)
  lost all its content; now it gets an empty title and keeps the content.

- `@scriba-editor/view`: after selecting a block or an image (by clicking on it), a click in the
  text did not move the selection: what you typed next replaced the node. Now the click moves
  the cursor.
- `@scriba-editor/view`: typing with a block selected (rule, table…) put the text in the
  previous paragraph; now the block becomes a paragraph with the text, in its place.
- `@scriba-editor/core`: Enter with a block selected creates a paragraph after it (before it, if
  it is the first block: so you can type above a rule or a table at the top). New command
  `createParagraphNear` in `baseKeymap`.

- `@scriba-editor/plugin-ai`: Accept and Discard of a response made of blocks in the middle of a
  paragraph (which splits it) failed or stitched the text back badly; now the restore uses the
  whole blocks that contained it, mapped like the response range. The fallback for a block
  that cannot fit where it goes inserts the already validated text, never the raw response.

- In read-only mode the comments panel allowed accepting or rejecting suggested changes and
  deleting threads. Now accept and reject require edit permission, and comment actions require
  permission to comment.
- Markdown shortcuts, `/` and `@` did not work with IME and with Android keyboards, which write
  the text themselves. Now that text goes through `handleTextInput` like typed text.
- IME: several characters read together (two close compositions, for example `" @"`) go
  through `handleTextInput` one at a time, as if they were typed.
- IME: a composition that started right after another one (space, then a letter) was
  interrupted. The view re-read and redrew the block while the IME was still writing into it.
- `@scriba-editor/core`: `lift` (and therefore `toggleWrap`/`toggleBlockquote`) threw a
  `TypeError` with a selection across two blocks; now it uses the range boundaries.
- Firefox: the first click in an unfocused editor put the cursor at the previous position
  instead of the clicked point.
- In read-only mode the items of the "More options" menu (narrow toolbar) were active and
  modified the document.
- Backspace and Delete no longer join text across a table border; a selection that enters a
  cell does not move text into or out of the table.
- Enter on an empty block inside a blockquote exits it.
- Keys, copy, cut and paste right after a quick cursor move act on the current position and
  not on the previous one.
- Toolbar menus no longer cut off; the toolbar no longer scrolls when a menu takes focus.
- Size of small image files shown in bytes.
- `@scriba-editor/plugin-image`: the resize handles did not appear for an image in the middle
  of a line of text; with the status bar they also looked like its handle.
- Accessibility (review with axe-core):
  - `@scriba-editor/ui`: menu items take their name from the visible text (previously an
    `aria-label` that did not include the displayed shortcut, WCAG 2.5.3); menu
    `aria-keyshortcuts` in ARIA format (`Control+K`, previously `Mod-k`).
  - Theme: links in the text readable in the dark theme (previously the browser blue on a dark
    background); comments panel and status bar with the theme background; checkboxes and radio
    buttons in dialogs at 18px (2.5.8); with the sticky toolbar the cursor no longer ends up
    under it.
  - `@scriba-editor/plugin-help`: the scrolling list of shortcuts is reachable from the keyboard.
  - `@scriba-editor/plugin-word-count`: the table's empty corner cell is no longer a header.
- `@scriba-editor/ui`: "ResizeObserver loop" error in the console on narrow screens, when the
  toolbar (or the bubble menu) moved buttons into "More"; now the calculation happens on the
  next frame.

### Security

- Incoming HTML (paste, `setContent`, import, source view, drag and drop, Markdown, AI
  responses, remote updates) always parsed in an inert document and rebuilt through the
  schema: whatever the schema does not know is discarded.
- URL whitelist (`http:`, `https:`, `mailto:`, `tel:`, relative) with normalization; `data:`
  images only PNG, JPEG, GIF and WebP, never SVG.
- No free `style` attribute: only typed, validated styles, applied via CSSOM. Compatible with a
  strict CSP and Trusted Types (`scriba` and `scriba-worker` policies).
- JSON slices accept incomplete nodes only as partial content; `replace()` checks the inserted
  nodes in depth.
- Find and replace regexes run in a Web Worker terminated after 1 s.
- Collaboration: identity, author of comments and suggestions assigned by the server; remote
  updates validated against the schema; limits on messages, rate and document size.
- Opened files: untrusted input. HTML and Word go through an inert document and the schema
  parser with limits; .docx files are checked before decompressing them (declared size,
  number of entries) and `mammoth` never reads linked files (`externalFileAccess: false`).
- Callouts: only an `<aside>` with `data-callout` becomes a callout; the type comes from a
  closed list (an unknown value becomes `info`) and the content goes through the schema.
- Tasks: single-line title (no control characters), real `YYYY-MM-DD` date, boolean status; in
  the HTML only text and three fixed-form `data-` attributes.
- Locked blocks: the rule applies in the editor but must be repeated on the server with
  `checkBlockEdits` (the client is not trusted). A new block cannot take a locked id.
- Mentions: id and name validated (length, no spaces in the id, no control or direction
  characters); search results filtered and shown only as text. The name is only visible text:
  resolve the id on the server (current name, permissions, notifications).
- Comment and suggestion marks do not end up in the exported HTML and cannot be created with a
  paste.
- Security suite: known XSS payloads, round-trip, fuzzing with `fast-check`, parity between
  server and browser.
