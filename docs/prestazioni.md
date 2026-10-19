# Prestazioni

Obiettivo (CLAUDE.md §7): un documento da **1 MB di testo** resta fluido, con meno di **16 ms**
per tasto, cioè un tasto per fotogramma.

## Numeri attuali

Un tasto in un documento da 1 MB di testo (circa 5700 blocchi), mediana, view e plugin compresi:

| Browser  | Per tasto |
| -------- | --------- |
| Chromium | ~10 ms    |
| Firefox  | ~11 ms    |
| WebKit   | ~12 ms    |

Solo il core (modello e transazione) su 1 MB, al 75° percentile: digitare ~1,4 ms, Invio ~1,3 ms,
grassetto ~1,9 ms, digitare e annullare ~3 ms; serializzare in HTML ~7 ms, caricare 1 MB di
HTML ~0,5 s.

Peso (minificato e gzip): core **25 KB**, core + view **36 KB**, interfaccia **24 KB**; script da
CDN con tutte le funzioni ~84 KB e CSS ~6 KB.

## Misurarle

```bash
pnpm bench       # benchmark del core (Vitest), con soglie
pnpm test:perf   # un tasto su 1 MB nei tre browser (Playwright), soglia 16 ms
pnpm size        # peso minificato e gzip; il core deve restare sotto i 60 KB
```

I tempi dipendono dalla macchina: lancia `bench` e `test:perf` a macchina tranquilla e
confronta con il risultato precedente. Una modifica che peggiora di più del 10% va motivata.

## Come restano veloci

- Il documento è immutabile e condivide le parti non cambiate: una modifica tocca solo il ramo
  interessato.
- La view aggiorna solo i blocchi cambiati (salta subito quelli identici all'inizio e alla fine)
  e non riscrive attributi che non cambiano.
- I controlli "si può fare?" dei pulsanti evitano di scorrere tutto il documento.
- Le operazioni pesanti (conteggio parole, ricerca con regex) sono rinviate o in un Web Worker.

## Consigli per chi integra

- `onChange` arriva a ogni modifica: se salvi in rete, raggruppa i salvataggi (es. un salvataggio
  ogni secondo o all'uscita dal campo), non serializzare a ogni tasto un documento enorme.
- Includi solo i plugin che usi: i pacchetti sono separati e senza effetti collaterali.
- Per documenti molto grandi preferisci il formato JSON quando possibile (più veloce da caricare
  dell'HTML, che va analizzato).
