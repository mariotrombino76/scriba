# @scriba/themes

Il tema CSS di Scriba: un solo foglio di stile, chiaro e scuro, personalizzabile con variabili CSS.

```bash
pnpm add @scriba/themes
```

## Uso

```ts
import '@scriba/themes/scriba.css'
```

Oppure da HTML (il file è `scriba.css` nel pacchetto):

```html
<link rel="stylesheet" href="/node_modules/@scriba/themes/scriba.css" />
```

Con lo script per il browser (`@scriba/browser`) il foglio di stile è già incluso come
`scriba.css` di quel pacchetto. Il tema è un normale foglio di stile: non richiede
`style-src 'unsafe-inline'` e funziona con una CSP rigida (gli stili dinamici dell'editor
passano dal CSSOM).

## Chiaro e scuro

Il tema segue le preferenze del sistema (`prefers-color-scheme`). Per forzare uno schema
indipendentemente dal sistema, imposta l'attributo `data-scriba-theme` su un antenato
dell'editor, di solito `<html>`:

```html
<html data-scriba-theme="dark">
  <!-- sempre scuro -->
  <html data-scriba-theme="light">
    <!-- sempre chiaro, anche con il sistema in scuro -->
  </html>
</html>
```

I colori rispettano il contrasto WCAG 2.2 AA in entrambi gli schemi.

## Variabili CSS

Per adattarlo al tuo sito ridefinisci le variabili (`--scriba-*`) dopo aver caricato il tema:

```css
:root {
  --scriba-accent: #0b6b3a;
  --scriba-radius: 4px;
}
```

Se ridefinisci i colori, ridefiniscili anche per lo schema scuro (dentro
`@media (prefers-color-scheme: dark)` e/o `:root[data-scriba-theme='dark']`).

| Variabile                                             | Uso                                                      |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `--scriba-bg`, `--scriba-text`, `--scriba-muted`      | Sfondo, testo e testo secondario.                        |
| `--scriba-border`                                     | Bordi e separatori.                                      |
| `--scriba-accent`, `--scriba-accent-bg`               | Colore di accento e suo sfondo (pulsanti attivi, hover). |
| `--scriba-focus`                                      | Anello del focus.                                        |
| `--scriba-code-bg`                                    | Sfondo del codice.                                       |
| `--scriba-error`, `--scriba-warning`                  | Messaggi di errore e di avviso.                          |
| `--scriba-radius`                                     | Raggio degli angoli.                                     |
| `--scriba-font`                                       | Carattere dell'interfaccia.                              |
| `--scriba-hl-*`                                       | Evidenziazione della sintassi nei blocchi di codice.     |
| `--scriba-find-bg`, `--scriba-find-current`           | Risultati di "Trova e sostituisci".                      |
| `--scriba-comment-bg`, `--scriba-comment-active`      | Testo commentato.                                        |
| `--scriba-suggest-insert`, `--scriba-suggest-delete`  | Suggerimenti (modifiche tracciate).                      |
| `--scriba-callout-{info,tip,warning,danger}` e `…-bg` | Riquadri di avviso.                                      |

L'elenco completo è nelle prime righe di `scriba.css`.

## Barra fissa in alto

Aggiungi la classe `scriba-sticky` al contenitore dell'editor (`class` in Vue, `className` in
React; con lo script per il browser l'opzione `stickyToolbar: true`): la barra degli strumenti
resta in vista in cima alla finestra mentre un testo lungo scorre. Se la pagina ha
un'intestazione fissa, spostala con `--scriba-sticky-offset`:

```css
:root {
  --scriba-sticky-offset: 56px; /* altezza dell'intestazione fissa */
}
```

Il tema lascia anche spazio sopra il cursore (`scroll-padding-top`), così il browser lo porta
in vista sotto la barra e non dietro di essa (WCAG 2.4.11).

## Telefoni e tablet

Con puntatore "grossolano" (`@media (pointer: coarse)`, cioè il dito) pulsanti e voci di menu
diventano alti 44 px (2,75 rem); con il mouse i pulsanti sono alti 2,25 rem (almeno 24 px,
WCAG 2.5.8). La pagina deve avere
`<meta name="viewport" content="width=device-width, initial-scale=1">`.

## Modalità inline

Il contenitore con la classe `scriba-inline` (la mette il componente con `inline`) prende
caratteri, colori e misure della pagina, senza riquadro. Vedi [Iniziare](../../docs/iniziare.md#modalità-inline).

Altro: [Accessibilità](../../docs/accessibilita.md).
