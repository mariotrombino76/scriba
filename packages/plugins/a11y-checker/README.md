# @scriba/plugin-a11y-checker

**Verifica dell'accessibilità** del documento per l'editor Scriba, come l'"Accessibility checker"
di TinyMCE (`a11ycheck`): trova i problemi rispetto a WCAG 2.2, li mostra uno alla
volta nel testo e propone una correzione.

## Installazione

```bash
pnpm add @scriba/plugin-a11y-checker
```

## Uso

```ts
import { a11yChecker, a11yCheckerItem, checkAccessibility } from '@scriba/plugin-a11y-checker'

const state = EditorState.create({
  schema,
  plugins: [a11yChecker({ level: 'AA' }) /* … */],
})

// voce del menu Strumenti: apre la finestra
menubar.menus = [{ id: 'tools', label: 'menu.tools', items: [a11yCheckerItem(t)] }]

// senza editor, anche sul server: fermare il salvataggio di un documento con errori
const issues = checkAccessibility(view.state.doc, { level: 'AA' })
const errors = issues.filter((i) => i.severity === 'error')
```

## Opzioni (`A11yOptions`)

| Opzione            | Default                          | Descrizione                                                                   |
| ------------------ | -------------------------------- | ----------------------------------------------------------------------------- |
| `level`            | `'AA'`                           | Livello WCAG: `'A'` salta il contrasto, `'AAA'` è più severo.                 |
| `rules`            | tutte attive                     | Disattiva singole verifiche, es. `{ 'table-caption': false }`.                |
| `background`       | `#ffffff`                        | Sfondo su cui si vede il testo, per il contrasto (se il testo non ha il suo). |
| `color`            | `#000000`                        | Colore del testo senza colore proprio.                                        |
| `genericLinkTexts` | testi comuni, italiani e inglesi | Testi di link che non dicono la destinazione ("clicca qui"…).                 |
| `maxAltLength`     | `150`                            | Oltre questa lunghezza il testo alternativo riceve un suggerimento.           |

Opzioni non valide (colori non riconosciuti, `maxAltLength` non intero positivo) lanciano un
`RangeError` subito, all'avvio del plugin.

## Verifiche (`A11Y_RULES`)

`image-alt`, `image-alt-filename`, `image-alt-long`, `link-no-text`, `link-text`, `adjacent-links`,
`heading-empty`, `heading-order`, `paragraph-as-heading`, `fake-list`, `table-headers`,
`table-header-empty`, `table-caption`, `embed-title`, `contrast`, `justified-text`.
Ogni problema ha una gravità (`error`, `warning`, `info`), il criterio WCAG e, dove possibile, una
correzione (scrivere il testo alternativo, scegliere il livello del titolo, riga o colonna di
intestazione, unire link adiacenti, colore suggerito, allineamento a sinistra…).

## Cosa esporta

- `a11yChecker(options?)`: il plugin (stato, problemi ignorati, evidenziazione del problema corrente).
- `a11yCheckerItem(t)`: voce "Verifica accessibilità" (icona `accessibility`), disponibile anche in
  sola lettura (le correzioni sono allora nascoste).
- `openA11yDialog(view, t)`: la finestra; richiede il plugin `a11yChecker()`.
- `checkAccessibility(doc, options?)`: funzione pura, senza DOM; restituisce i problemi in ordine di
  documento.
- `a11yIssues(state)`, `ignoreIssue(issue)`, `clearIgnoredIssues`, `setCurrentIssue(target)`,
  `a11yCheckerKey`, `A11Y_CURRENT_CLASS`: stato e comandi.
- `contrastRatio`, `luminance`, `suggestColor`, `isUnhelpfulAlt`, `GENERIC_LINK_TEXTS`,
  `understandingUrl`.
- Tipi: `A11yIssue`, `A11yOptions`, `A11yLevel`, `A11ySeverity`, `A11yRuleId`, `A11yRepair`,
  `A11yAction`, `A11yTarget`, `WcagCriterion`…

## Note

- La finestra mostra un problema alla volta (Precedente, Successivo, Ignora): il testo interessato
  viene selezionato ed evidenziato (classe `scriba-a11y-current`, definita dal tema). "Ignora" vale
  per la sessione e **non** viene salvato nel documento.
- Accessibilità della finestra: stato annunciato con `role="status"`, errori con `role="alert"`,
  focus trap e ritorno del focus all'editor. Vedi [accessibilità](../../../docs/accessibilita.md).
- Sicurezza: la finestra è costruita solo con `createElement` e `textContent`, nessun `innerHTML`;
  le correzioni passano da comandi del modello. Vedi [sicurezza](../../../docs/sicurezza.md).
- I testi delle verifiche sono nelle traduzioni (`a11y.*`, pacchetto `@scriba/i18n`). Per l'uso
  nella tua pagina vedi [plugin](../../../docs/plugin.md).
- Il controllo copre il **contenuto del documento**, non l'accessibilità della pagina che lo ospita.
