**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-template

Document templates like the TinyMCE `template` and `advtemplate` plugins: a dialog with the list of templates, description, read-only preview and "Insert". Templates can come from your server.

```bash
pnpm add @scriba-editor/plugin-template
```

## Usage

```ts
import { templateToolbarItem, type TemplateOptions } from '@scriba-editor/plugin-template'

const templateOptions: TemplateOptions = {
  locale: 'it-IT',
  values: { company: 'Example Ltd' }, // for the {{company}} placeholders
  templates: [
    {
      title: 'Meeting minutes',
      description: 'Title, date, attendees and decisions.',
      content:
        '<h2>Meeting minutes</h2><p><strong>Date:</strong> {{date}}</p><h3>Decisions</h3><ol><li><p></p></li></ol>',
    },
    {
      title: 'Letter',
      // loaded only on the first preview, for example from the server
      content: () => fetch('/api/templates/letter').then((r) => r.text()),
    },
  ],
  // or templates: () => fetch('/api/templates').then((r) => r.json())
}

// Insert menu or toolbar:
templateToolbarItem(t, templateOptions)
```

## Exports

| Name                                   | What it does                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `templateToolbarItem(t, options)`      | "Template…" item (`id: 'template'`); disabled in read-only mode                          |
| `openTemplateDialog(view, t, options)` | Opens the dialog from code                                                               |
| `TemplateOptions`                      | `templates` (list or async function), `values?`, `locale?`                               |
| `Template`                             | `{ title, description?, content }`; `content` is HTML or an async function that loads it |
| `TemplateValue`                        | Text, or a function called on every use                                                  |
| `insertTemplate(fragment)`             | Command: inserts the content at the selection (a single undo step)                       |
| `parseTemplate(schema, html, values?)` | Template HTML turned into a schema document                                              |
| `fillPlaceholders(text, values)`       | Replaces the known `{{name}}` placeholders; the others stay as they were                 |
| `defaultTemplateValues(locale?)`       | The default `{{date}}` and `{{time}}` placeholders                                       |
| `MAX_TEMPLATE_LENGTH`                  | 1 000 000 characters: beyond that, the template is rejected, not truncated               |

## Behavior

Template blocks keep their type (a heading stays a heading): the paragraph at the cursor is split, or replaced if empty. In an empty document, or with everything selected, the template becomes the whole document. Where blocks do not fit (table cell, code), the content is adapted like a paste. The `{{name}}` placeholders (letters, digits, `_`, `.`, `-`) are filled only in text nodes; `date` and `time` are predefined, your `values` are added to them.

## Accessibility

The dialog has a focus trap and returns focus to the editor. The templates are a radio group (arrow keys) with the description linked (`aria-describedby`); the preview is a labeled region; loading and errors are announced (`role="status"` and `role="alert"`).

## Security

- Template content can come from the server: it is **untrusted input**. The HTML is read in an inert document and goes through the schema parser (like a paste); beyond `MAX_TEMPLATE_LENGTH` it is rejected.
- Placeholder values are inserted **only as text**, never as markup, even if they contain `<` or `>`.
- Title and description are displayed as text. A slow response for a template that is no longer selected is ignored; a failed load shows an error.
- The server that saves the documents must still pass them through `@scriba-editor/sanitize-server`.

See [security](../../../docs/security.md), [accessibility](../../../docs/accessibility.md) and [plugins](../../../docs/plugins.md).
