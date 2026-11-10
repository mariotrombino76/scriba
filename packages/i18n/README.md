# @scriba/i18n

Traduzioni dell'interfaccia di Scriba: italiano, inglese, francese, tedesco e spagnolo.

```bash
pnpm add @scriba/i18n
```

## Uso

```ts
import { createTranslator, fr } from '@scriba/i18n'

const t = createTranslator('it')
t('editor.label') // "Editor di testo formattato"

// francese, tedesco e spagnolo si importano: le lingue che non usi restano fuori dal bundle
const tFr = createTranslator(fr)
```

Nei componenti basta indicare la lingua: `locale="en"` (Vue), `locale: 'en'` (React e script per
il browser). Per fr, de, es passa l'oggetto nei componenti Vue e React (`locale: fr`); con lo
script `@scriba/browser` bastano i nomi (`'fr'`, `'de'`, `'es'`).

## Esportazioni

| Esportazione                            | Descrizione                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `createTranslator(locale?, overrides?)` | Crea una funzione `Translate`. `locale` è un nome (`'it'`, `'en'`) o un oggetto di messaggi; default `'en'`. |
| `locales`                               | Le lingue trovate per nome: `{ it, en }`.                                                                    |
| `it`, `en`                              | Messaggi italiani e inglesi.                                                                                 |
| `fr`, `de`, `es`                        | Messaggi francesi, tedeschi, spagnoli (da passare come oggetto).                                             |
| `Messages`                              | Tipo: un oggetto con **tutte** le chiavi dei messaggi.                                                       |
| `MessageKey`                            | Tipo: l'unione delle chiavi (`'editor.label'`, `'mark.bold'`…).                                              |
| `Translate`                             | Tipo della funzione `(key, params?) => string`.                                                              |

## Comportamento

- Un nome di lingua sconosciuto ricade sull'inglese; un codice regionale come `'it-IT'` usa
  `'it'`.
- I segnaposto `{nome}` si riempiono con `params`: `t(key, { nome: 'Anna' })`. I parametri sono
  sempre **testo semplice**, mai markup.
- Una chiave mancante restituisce la chiave stessa.

## Cambiare singoli testi

```ts
const t = createTranslator('it', { 'editor.label': 'Testo della nota' })
```

`overrides` è un `Partial<Messages>`: sostituisce solo i messaggi indicati.

## Un'altra lingua

Passa un oggetto con tutti i messaggi, di tipo `Messages` (le chiavi sono quelle di `en`: il
compilatore ti segnala quelle mancanti):

```ts
import { en, createTranslator, type Messages } from '@scriba/i18n'

const pt: Messages = { ...en, 'editor.label': 'Editor de texto formatado' /* … */ }
const t = createTranslator(pt)
```

Vedi [Iniziare](../../docs/iniziare.md#lingua) per l'uso con i componenti.
