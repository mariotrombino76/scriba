**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-markdown

Markdown for the Scriba editor: **shortcuts while you type** (`# ` becomes a heading, `- ` a list,
`**x**` bold), **import** and **export**. This is a capability TinyMCE does not offer out of the box: here it is built in.

```bash
pnpm add @scriba-editor/plugin-markdown
```

## Usage

```ts
import { markdownShortcuts, parseMarkdown, serializeMarkdown } from '@scriba-editor/plugin-markdown'

// in the editor state: typing shortcuts + Backspace that undoes them
plugins: [...markdownShortcuts(schema)]

// import: Markdown -> document (in the browser)
const doc = parseMarkdown(schema, '# Heading\n\n- one\n- two')

// export: document -> Markdown
const md = serializeMarkdown(view.state.doc)
```

## Typing shortcuts

The rules exist only for the nodes and marks the schema has.

| You type                         | Result                                           |
| -------------------------------- | ------------------------------------------------ |
| `# ` … `###### `                 | Heading 1 to 6                                   |
| `- `, `* `, `+ `                 | Bulleted list                                    |
| `1. ` or `1) `                   | Numbered list (starts from the number you typed) |
| `> `                             | Blockquote                                       |
| ` ``` ` (also with a language)   | Code block                                       |
| `---`, `___`, `***` on their own | Horizontal line                                  |
| `**x**` or `__x__`               | Bold                                             |
| `*x*` or `_x_`                   | Italic                                           |
| `~~x~~`                          | Strikethrough                                    |
| `` `x` ``                        | Inline code                                      |
| `[text](https://…)`              | Link (URL checked against the whitelist)         |

Each rule is **a separate undoable step**: **Backspace right after** (or Ctrl+Z) gives back the
typed text (`# `) instead of the heading. The rules do not act during IME composition nor,
normally, inside code.

## Exports

| Name                                                                              | What it does                                                                      |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `markdownShortcuts(schema)`                                                       | Shortcuts plugin + Backspace keymap (priority 100).                               |
| `parseMarkdown(schema, markdown, options?)`                                       | Markdown -> document (browser only: uses `DOMParser`).                            |
| `markdownToHTML(markdown, maxLength?)`                                            | Markdown -> HTML string. **Not safe to display as is.**                           |
| `serializeMarkdown(doc)`                                                          | Document -> Markdown.                                                             |
| `inputRules`, `markdownInputRules`, `undoInputRule`, `inputRulesKey`, `InputRule` | For writing your own typing rules.                                                |
| `DEFAULT_MAX_MARKDOWN_LENGTH`, `MarkdownParseOptions`                             | Limits: `maxLength` (default 2,000,000 characters) and `parse` (depth and nodes). |

Import: CommonMark plus GFM tables and strikethrough; no autolinks and no automatic typography.

## Security

Import is **untrusted input**, like a paste:

- the Markdown is converted by `markdown-it` with **raw HTML disabled** (a `<script>` written in
  the Markdown stays text);
- the result is read in an **inert document** and rebuilt by the schema parser: whatever the
  schema does not know is discarded, and links go through the URL whitelist;
- the maximum length and the depth and node limits prevent the page from freezing.
- If you use `markdownToHTML` directly, always pass the result through the schema parser or
  through `@scriba-editor/sanitize-server`.
- In the typing rules, links go through the same whitelist (`http`, `https`, `mailto`, `tel`,
  relative).

See [security](../../../docs/security.md) and [plugins](../../../docs/plugins.md); the shortcuts are
also listed in the `@scriba-editor/plugin-help` dialog (`markdownHelp()`).
