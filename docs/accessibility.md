**English** · [Italiano](it/accessibilita.md)

# Accessibility

Scriba targets WCAG 2.2 level AA: every feature can be reached from the keyboard and has a name
for screen readers.

## Roles and names

- The writing area has `role="textbox"`, `aria-multiline="true"` and a name (`label`, default
  "Rich text editor"); in read-only mode `aria-readonly="true"`.
- The toolbar has `role="toolbar"` with named groups; active buttons have `aria-pressed`, menus
  `aria-haspopup`/`aria-expanded`, and shortcuts appear in the tooltip.
- The menu bar follows the WAI-ARIA _menubar_ pattern; the right-click menu follows the _menu_
  pattern.
- Dialogs are true modals (`<dialog>`): focus stays inside and returns to where it was on close.
- Changing states (AI response, collaboration, word count) are announced with `role="status"`.
- A page break is read as "Page break"; images with alt text (or declared decorative).

## Keyboard

`Mod` is Ctrl on Windows/Linux and ⌘ on macOS. The full list, always up to date with the plugins
in use, is in the **Help ▸ Keyboard shortcuts** menu (Alt+0).

| Keys                    | Action                                                         |
| ----------------------- | -------------------------------------------------------------- |
| Mod+B / I / U           | Bold / italic / underline                                      |
| Mod+Shift+S, Mod+E      | Strikethrough, inline code                                     |
| Mod+. , Mod+,           | Superscript, subscript                                         |
| Mod+Shift+Space         | Non-breaking space                                             |
| Mod+Alt+C / Mod+Alt+V   | Copy format / apply it to the selection (Esc cancels the wait) |
| Mod+Alt+0 … 6           | Paragraph, Heading 1…6                                         |
| Mod+K                   | Link                                                           |
| Mod+S                   | Save (with `@scriba-editor/plugin-save`)                       |
| Mod+Z, Mod+Y            | Undo, redo                                                     |
| Shift+Enter             | Line break in the same paragraph                               |
| Tab, Shift+Tab          | Indentation in lists, next/previous cell in tables             |
| Mod+Shift+V             | Paste as plain text                                            |
| Mod+F, Mod+Shift+F      | Find and replace, fullscreen                                   |
| Mod+J                   | AI assistant                                                   |
| Alt+F10                 | Into the selection formatting bar                              |
| Shift+F10 (or menu key) | Context menu                                                   |
| Alt+0                   | Keyboard shortcuts                                             |
| Esc                     | Closes menus and windows                                       |

In the toolbar and in menus: a single tab stop, arrow keys to move, Enter/Space to choose, Esc
to go back to the editor.

In the status bar: the **element path** is a navigation with one button per block (it selects
that block), a single tab stop and left/right arrow keys to move; the **resize handle** is a
button that changes the height with the up and down arrow keys (Page Up/Down for larger steps),
and Esc returns to automatic height.

## Automated check

Every change goes through `e2e/a11y.spec.ts`: axe-core checks the WCAG 2.0, 2.1 and 2.2 level A
and AA rules (plus best practices) on the editor, bubble menu, context menu, every menu in the
menu bar, every window opened from the menus, the dark theme and the inline, classic script and
React pages, in Chromium, Firefox and WebKit. The test fails at the first violation. It does not
replace testing with a screen reader (NVDA, VoiceOver), which must still be done by hand before
every release.

Some points that received particular care:

- **Label in name** (2.5.3): menu items take their name from the visible text; the shortcut next
  to it is hidden from screen readers and declared in `aria-keyshortcuts` in the ARIA format
  (`Control+Alt+0`, `Meta+K` on macOS).
- **Target size** (2.5.8): at least 24px; with touch, buttons and menu items are 44px.
- **Focus not obscured** (2.4.11): with the toolbar fixed at the top, the cursor stays visible
  below the bar.
- **Scrolling areas** reachable from the keyboard (shortcut list).
- **Dragging movements** (2.5.7): every action done by dragging has an alternative: image width
  in its dialog, columns from the Table menu, cropping with the numeric fields, editor height
  with the arrow keys on the handle.

## Contrast and themes

The theme colors meet AA contrast in light and dark (the theme follows the system preferences).
Links in the text and the panels outside the editor (comments, status bar) also use the theme
colors. If you redefine the CSS variables, check the contrast again.

## Content accessibility check

The editor is accessible, but the **document** depends on the person writing: an image without a
description or a skipped heading level makes it hard to use.
`@scriba-editor/plugin-a11y-checker` checks the document like TinyMCE's Accessibility Checker.

Think of it as a spell checker, but for people who use a screen reader: it finds the spots where
these people would get lost, explains why and proposes the fix.

```ts
import { a11yChecker, a11yCheckerItem } from '@scriba-editor/plugin-a11y-checker'

const plugins = [a11yChecker({ level: 'AA' }) /* , … */]
// in the Tools menu or in the toolbar:
const item = a11yCheckerItem(t)
```

**Tools ▸ Accessibility checker…** opens a dialog with one issue at a time. The issue is selected
and highlighted in the text (the dialog sits at the bottom right so you can see it). The dialog
shows the severity (error, warning, suggestion), the explanation, the WCAG 2.2 criterion with a
link to the W3C page, and the fix: a field (alt text, link text, caption, title), the heading
level or a button. Every fix is one undo step. **Ignore** hides the issue until the editor is
reloaded (it writes nothing into the document). In read-only mode issues are shown but cannot be
fixed.

| Check                  | What it finds                                                           | Criterion |
| ---------------------- | ----------------------------------------------------------------------- | --------- |
| `image-alt`            | Image without alt text (neither described nor decorative)               | 1.1.1 A   |
| `image-alt-filename`   | Alt text that is a file name, a camera name or "image"                  | 1.1.1 A   |
| `image-alt-long`       | Alt text longer than 150 characters (suggestion)                        | 1.1.1 A   |
| `link-no-text`         | Link without text (or with only a decorative image)                     | 2.4.4 A   |
| `link-text`            | Generic link text: "click here", "read all", "read more"…               | 2.4.4 A   |
| `adjacent-links`       | Two adjacent links to the same address                                  | 2.4.4 A   |
| `heading-empty`        | Empty heading                                                           | 1.3.1 A   |
| `heading-order`        | Skipped heading level (h2 → h4)                                         | 1.3.1 A   |
| `paragraph-as-heading` | Short all-bold paragraph used as a heading                              | 1.3.1 A   |
| `fake-list`            | Paragraphs that start with "-", "•" or "1." instead of a list           | 1.3.1 A   |
| `table-headers`        | Table without header cells                                              | 1.3.1 A   |
| `table-header-empty`   | Empty header cell                                                       | 1.3.1 A   |
| `table-caption`        | Table without a caption                                                 | 1.3.1 A   |
| `embed-title`          | Embedded video, audio or map without a title                            | 4.1.2 A   |
| `contrast`             | Colored text with contrast below 4.5:1 (3:1 if large); at level AAA 7:1 | 1.4.3 AA  |
| `justified-text`       | Justified text (only at level AAA)                                      | 1.4.8 AAA |

`a11yChecker()` options: `level` (`'A'`, `'AA'`, `'AAA'`), `rules` (to turn off a check:
`{ 'table-caption': false }`), `background` and `color` (the colors of the page where the text
will be displayed, for contrast; default white and black), `genericLinkTexts`, `maxAltLength`.

Contrast is checked only where the text has its own color (color, highlight, cell background):
the rest takes the page colors, which are the site's responsibility.

### On the server

`checkAccessibility(doc, options)` is a pure function, without DOM: with the same schema you can
use it in the backend, for example to warn about or refuse to publish a document with errors.

```ts
const errors = checkAccessibility(doc).filter((i) => i.severity === 'error')
```

### Images: "to be described" and "decorative"

In the document an image has `alt: null` until someone has described it (in HTML: no `alt`
attribute) and `alt: ''` when it is decorative (`alt=""`: screen readers skip it). This way an
image pasted or uploaded without a description does not pass as decorative.

## What is left to integrators

- Give the editor a label that is meaningful in context (`label: 'Note text'`).
- If you show a save or validation error, announce it (`role="alert"`) near the editor.
- Do not remove focus outlines (`:focus-visible`) in your CSS.
