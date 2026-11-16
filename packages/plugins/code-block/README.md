**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-code-block

**Code blocks** for the Scriba editor, with syntax highlighting and language selection. Like the
TinyMCE "Code sample" plugin, but highlighting produces **decorations**, never HTML: no string from
the highlighter ever reaches the page.

## Installation

```bash
pnpm add @scriba-editor/plugin-code-block lowlight
```

The package depends on `lowlight` 3.3.0; you create the instance in your app with the grammars you
want (the example below uses the common ones).

## Usage

```ts
import {
  codeBlockKeymap,
  codeBlockNodes,
  codeBlockToolbarItems,
  codeHighlight,
  toggleCodeBlock,
} from '@scriba-editor/plugin-code-block'
import { common, createLowlight } from 'lowlight'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...codeBlockNodes },
  marks: basicSchemaSpec.marks,
})

const state = EditorState.create({
  schema,
  plugins: [
    codeHighlight({ lowlight: createLowlight(common) }),
    keymap(codeBlockKeymap(), { priority: 60 }),
    // …
  ],
})

// block button and language menu (visible only inside a code block)
const items = codeBlockToolbarItems(schema)
```

## Exports

| Export                                                                                                                   | Description                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `codeBlockNodes`                                                                                                         | `code_block` node: text only, no marks, `language` attribute (or `null`).      |
| `codeHighlight(options)`                                                                                                 | Highlighting plugin as decorations; `codeHighlightKey` is its key.             |
| `codeBlockKeymap()`                                                                                                      | Shortcuts (see below).                                                         |
| `codeBlockToolbarItems(schema, languages?)`                                                                              | `code_block` button and `code_language` menu ("Plain text" item + languages).  |
| `defaultCodeLanguages`                                                                                                   | JavaScript, TypeScript, HTML/XML, CSS, JSON, Python, PHP, Java, C#, SQL, Bash. |
| `toggleCodeBlock`, `setCodeLanguage(lang)`, `exitCodeBlock`, `exitOnTripleEnter`, `resetEmptyCodeBlock`, `isInCodeBlock` | Commands.                                                                      |
| `LANGUAGE`                                                                                                               | Regular expression for the allowed language names.                             |

`codeHighlight` options (`HighlightOptions`):

- `lowlight` (required): lowlight instance with the registered grammars;
- `autoDetect`: guesses the language of blocks without one (slower; default `false`);
- `maxLength`: longer blocks are not highlighted (default 100 000 characters).

The languages in the menu must be registered in your lowlight instance; to change them, pass a
second argument to `codeBlockToolbarItems`: `[{ id: 'python', label: 'Python' }, …]`.

## Shortcuts

| Keys                          | Action                                                            |
| ----------------------------- | ----------------------------------------------------------------- |
| Shift+Mod+Alt+C               | Toggles the code block (not Mod+Alt+C, used by DevTools)          |
| Mod+Enter                     | Exits the block, with a new paragraph below                       |
| Enter (after two empty lines) | Exits the block, removing the empty lines (three Enters in a row) |
| Backspace in an empty block   | Turns it back into a paragraph                                    |

`Tab` is **not** captured: keyboard users can always leave the editor (WCAG).

## Notes

- HTML: `<pre><code class="language-js">…</code></pre>`. When reading, the language comes from
  `data-language` or from a `language-xxx`/`lang-xxx` class on `<pre>` or on `<code>`; the written
  `class` derives only from the **validated** language, never from the input. See
  [security](../../../docs/security.md).
- The highlighter uses only the class names (limited to `[\w-]`) and the text lengths; results are
  cached per block, so unchanged blocks are not processed again. Highlighter errors never interrupt
  typing.
- Token colors come from the theme (`@scriba-editor/themes`). See [plugins](../../../docs/plugins.md).
