**English** · [Italiano](README.it.md)

# @scriba-editor/i18n

Translations of the Scriba UI: Italian, English, French, German and Spanish.

```bash
pnpm add @scriba-editor/i18n
```

## Usage

```ts
import { createTranslator, fr } from '@scriba-editor/i18n'

const t = createTranslator('it')
t('editor.label') // "Editor di testo formattato"

// French, German and Spanish are imported: the languages you do not use stay out of the bundle
const tFr = createTranslator(fr)
```

In the components you just set the language: `locale="en"` (Vue), `locale: 'en'` (React and the
browser script). For fr, de, es pass the object in the Vue and React components (`locale: fr`);
with the `@scriba-editor/browser` script the names are enough (`'fr'`, `'de'`, `'es'`).

## Exports

| Export                                  | Description                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `createTranslator(locale?, overrides?)` | Creates a `Translate` function. `locale` is a name (`'it'`, `'en'`) or a messages object; default `'en'`. |
| `locales`                               | The languages looked up by name: `{ it, en }`.                                                            |
| `it`, `en`                              | Italian and English messages.                                                                             |
| `fr`, `de`, `es`                        | French, German, Spanish messages (to pass as an object).                                                  |
| `Messages`                              | Type: an object with **all** the message keys.                                                            |
| `MessageKey`                            | Type: the union of the keys (`'editor.label'`, `'mark.bold'`…).                                           |
| `Translate`                             | Type of the `(key, params?) => string` function.                                                          |

## Behavior

- An unknown language name falls back to English; a regional code like `'it-IT'` uses `'it'`.
- The `{name}` placeholders are filled with `params`: `t(key, { name: 'Anna' })`. Parameters are
  always **plain text**, never markup.
- A missing key returns the key itself.

## Changing individual texts

```ts
const t = createTranslator('it', { 'editor.label': 'Note text' })
```

`overrides` is a `Partial<Messages>`: it replaces only the messages you specify.

## Another language

Pass an object with all the messages, of type `Messages` (the keys are those of `en`: the compiler
flags the missing ones):

```ts
import { en, createTranslator, type Messages } from '@scriba-editor/i18n'

const pt: Messages = { ...en, 'editor.label': 'Editor de texto formatado' /* … */ }
const t = createTranslator(pt)
```

See [Getting started](../../docs/getting-started.md#language) for use with the components.
