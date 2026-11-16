**English** · [Italiano](README.it.md)

# @scriba-editor/themes

The Scriba CSS theme: a single stylesheet, light and dark, customizable with CSS variables.

```bash
pnpm add @scriba-editor/themes
```

## Usage

```ts
import '@scriba-editor/themes/scriba.css'
```

Or from HTML (the file is `scriba.css` in the package):

```html
<link rel="stylesheet" href="/node_modules/@scriba-editor/themes/scriba.css" />
```

With the browser script (`@scriba-editor/browser`) the stylesheet is already included as that
package's `scriba.css`. The theme is a normal stylesheet: it does not require
`style-src 'unsafe-inline'` and it works with a strict CSP (the editor's dynamic styles go
through the CSSOM).

## Light and dark

The theme follows the system preferences (`prefers-color-scheme`). To force a scheme regardless
of the system, set the `data-scriba-theme` attribute on an ancestor of the editor, usually
`<html>`:

```html
<html data-scriba-theme="dark">
  <!-- always dark -->
  <html data-scriba-theme="light">
    <!-- always light, even when the system is dark -->
  </html>
</html>
```

The colors meet WCAG 2.2 AA contrast in both schemes.

## CSS variables

To adapt it to your site, redefine the variables (`--scriba-*`) after loading the theme:

```css
:root {
  --scriba-accent: #0b6b3a;
  --scriba-radius: 4px;
}
```

If you redefine the colors, redefine them for the dark scheme too (inside
`@media (prefers-color-scheme: dark)` and/or `:root[data-scriba-theme='dark']`).

| Variable                                                | Use                                                      |
| ------------------------------------------------------- | -------------------------------------------------------- |
| `--scriba-bg`, `--scriba-text`, `--scriba-muted`        | Background, text and secondary text.                     |
| `--scriba-border`                                       | Borders and separators.                                  |
| `--scriba-accent`, `--scriba-accent-bg`                 | Accent color and its background (active buttons, hover). |
| `--scriba-focus`                                        | Focus ring.                                              |
| `--scriba-code-bg`                                      | Code background.                                         |
| `--scriba-error`, `--scriba-warning`                    | Error and warning messages.                              |
| `--scriba-radius`                                       | Corner radius.                                           |
| `--scriba-font`                                         | UI font.                                                 |
| `--scriba-hl-*`                                         | Syntax highlighting in code blocks.                      |
| `--scriba-find-bg`, `--scriba-find-current`             | "Find and replace" results.                              |
| `--scriba-comment-bg`, `--scriba-comment-active`        | Commented text.                                          |
| `--scriba-suggest-insert`, `--scriba-suggest-delete`    | Suggestions (tracked changes).                           |
| `--scriba-callout-{info,tip,warning,danger}` and `…-bg` | Callout boxes.                                           |

The full list is in the first lines of `scriba.css`.

## Sticky toolbar

Add the `scriba-sticky` class to the editor container (`class` in Vue, `className` in React;
with the browser script, the `stickyToolbar: true` option): the toolbar stays visible at the top
of the window while a long text scrolls. If the page has a fixed header, offset it with
`--scriba-sticky-offset`:

```css
:root {
  --scriba-sticky-offset: 56px; /* height of the fixed header */
}
```

The theme also leaves room above the cursor (`scroll-padding-top`), so the browser brings it
into view below the toolbar and not behind it (WCAG 2.4.11).

## Phones and tablets

With a "coarse" pointer (`@media (pointer: coarse)`, that is, a finger) buttons and menu items
become 44 px (2.75 rem) tall; with the mouse, buttons are 2.25 rem tall (at least 24 px,
WCAG 2.5.8). The page must have
`<meta name="viewport" content="width=device-width, initial-scale=1">`.

## Inline mode

The container with the `scriba-inline` class (the component adds it with `inline`) takes the
page's fonts, colors and sizes, without a frame. See
[Getting started](../../docs/getting-started.md#inline-mode).

More: [Accessibility](../../docs/accessibility.md).
