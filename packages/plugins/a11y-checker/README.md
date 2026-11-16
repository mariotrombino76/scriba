**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-a11y-checker

**Accessibility checking** of the document for the Scriba editor, like TinyMCE's "Accessibility
checker" (`a11ycheck`): it finds issues against WCAG 2.2, shows them one at a time in the text and
proposes a fix.

## Installation

```bash
pnpm add @scriba-editor/plugin-a11y-checker
```

## Usage

```ts
import {
  a11yChecker,
  a11yCheckerItem,
  checkAccessibility,
} from '@scriba-editor/plugin-a11y-checker'

const state = EditorState.create({
  schema,
  plugins: [a11yChecker({ level: 'AA' }) /* … */],
})

// Tools menu item: opens the dialog
menubar.menus = [{ id: 'tools', label: 'menu.tools', items: [a11yCheckerItem(t)] }]

// without an editor, on the server too: block saving a document that has errors
const issues = checkAccessibility(view.state.doc, { level: 'AA' })
const errors = issues.filter((i) => i.severity === 'error')
```

## Options (`A11yOptions`)

| Option             | Default                           | Description                                                                      |
| ------------------ | --------------------------------- | -------------------------------------------------------------------------------- |
| `level`            | `'AA'`                            | WCAG level: `'A'` skips contrast, `'AAA'` is stricter.                           |
| `rules`            | all enabled                       | Disables individual checks, e.g. `{ 'table-caption': false }`.                   |
| `background`       | `#ffffff`                         | Background the text is shown on, for contrast (if the text has none of its own). |
| `color`            | `#000000`                         | Color of text that has no color of its own.                                      |
| `genericLinkTexts` | common texts, Italian and English | Link texts that do not say where the link goes ("click here"…).                  |
| `maxAltLength`     | `150`                             | Above this length the alt text gets a suggestion.                                |

Invalid options (unrecognized colors, a `maxAltLength` that is not a positive integer) throw a
`RangeError` immediately, when the plugin starts.

## Checks (`A11Y_RULES`)

`image-alt`, `image-alt-filename`, `image-alt-long`, `link-no-text`, `link-text`, `adjacent-links`,
`heading-empty`, `heading-order`, `paragraph-as-heading`, `fake-list`, `table-headers`,
`table-header-empty`, `table-caption`, `embed-title`, `contrast`, `justified-text`.
Each issue has a severity (`error`, `warning`, `info`), the WCAG criterion and, where possible, a
fix (write the alt text, choose the heading level, header row or column, merge adjacent links,
suggested color, left alignment…).

## What it exports

- `a11yChecker(options?)`: the plugin (state, ignored issues, highlighting of the current issue).
- `a11yCheckerItem(t)`: "Accessibility checker" item (icon `accessibility`), also available in
  read-only mode (the fixes are then hidden).
- `openA11yDialog(view, t)`: the dialog; requires the `a11yChecker()` plugin.
- `checkAccessibility(doc, options?)`: pure function, no DOM; returns the issues in document
  order.
- `a11yIssues(state)`, `ignoreIssue(issue)`, `clearIgnoredIssues`, `setCurrentIssue(target)`,
  `a11yCheckerKey`, `A11Y_CURRENT_CLASS`: state and commands.
- `contrastRatio`, `luminance`, `suggestColor`, `isUnhelpfulAlt`, `GENERIC_LINK_TEXTS`,
  `understandingUrl`.
- Types: `A11yIssue`, `A11yOptions`, `A11yLevel`, `A11ySeverity`, `A11yRuleId`, `A11yRepair`,
  `A11yAction`, `A11yTarget`, `WcagCriterion`…

## Notes

- The dialog shows one issue at a time (Previous, Next, Ignore): the affected text is selected and
  highlighted (class `scriba-a11y-current`, defined by the theme). "Ignore" lasts for the session
  and is **not** saved in the document.
- Accessibility of the dialog: status announced with `role="status"`, errors with `role="alert"`,
  focus trap and focus returned to the editor. See [accessibility](../../../docs/accessibility.md).
- Security: the dialog is built only with `createElement` and `textContent`, no `innerHTML`; the
  fixes go through model commands. See [security](../../../docs/security.md).
- The check texts are in the translations (`a11y.*`, package `@scriba-editor/i18n`). For use in
  your page, see [plugins](../../../docs/plugins.md).
- The check covers the **document content**, not the accessibility of the page that hosts it.
