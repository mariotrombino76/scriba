# Rilasciare Scriba su npm

Questa guida spiega come pubblicare i pacchetti `@scriba-editor/*`. La pubblicazione è un'azione
**verso l'esterno e non annullabile**: una versione pubblicata non si può ripubblicare con lo stesso
numero. La avvia una persona, mandando un tag su GitHub; poi il workflow
`.github/workflows/release.yml` controlla, costruisce e pubblica con la _provenance_.

## Una volta sola, prima del primo rilascio

1. **Organizzazione npm.** Su npmjs.com crea l'organizzazione gratuita **`scriba-editor`**, per
   pacchetti pubblici.

   > Lo scope `@scriba` appartiene a un altro autore, con pacchetti pubblicati dal 2023: per questo
   > i pacchetti si chiamano `@scriba-editor/*`. Il nome del prodotto resta Scriba.

2. **2FA** obbligatoria per chi pubblica. È un'impostazione dell'organizzazione: "Require
   two-factor authentication".
3. **Token per il primo rilascio.** I pacchetti non esistono ancora, quindi il _Trusted
   Publisher_ non si può ancora configurare.
   - Su npmjs.com crea un **Granular Access Token**:
     - permesso _Read and write_ sull'organizzazione `scriba-editor`;
     - scadenza breve (7 giorni);
     - se npm lo chiede, l'opzione per pubblicare senza 2FA interattiva (la CI non può digitare
       il codice).
   - Su GitHub, nel repository: Settings ▸ Environments ▸ crea l'ambiente **`npm`**.
     - Aggiungi il segreto **`NPM_TOKEN`** con il token.
     - Se vuoi, aggiungi te stesso tra i _Required reviewers_: ogni rilascio aspetterà la tua
       approvazione.
4. **Dopo il primo rilascio**, per ogni pacchetto, su npmjs.com: Settings ▸ Trusted Publisher ▸
   GitHub Actions, con questi valori:
   - utente `mariotrombino76`;
   - repository `scriba`;
   - workflow `release.yml`;
   - ambiente `npm`.

   Poi cancella il token e il segreto `NPM_TOKEN`: i rilasci successivi si autenticano con OIDC,
   senza token salvati.

5. **Licenza.** `LICENSE` (Apache 2.0) e `NOTICE` (attribuzione a Mario Trombino) sono nella
   radice e in ogni pacchetto. npm include solo i file nella cartella del pacchetto: se cambiano,
   ricopiali in tutti.

## A ogni rilascio

### 1. Verifiche

La CI (`.github/workflows/ci.yml`) esegue a ogni push i controlli e gli e2e nei tre browser.
Prima di un rilascio, controlla che l'ultimo commit di `main` sia verde. Poi, su una macchina
tranquilla, lancia:

```bash
pnpm bench         # confronta con il rilascio precedente
pnpm test:perf     # idem
pnpm audit         # anche le dipendenze di sviluppo
```

Controlla anche che nessuna dipendenza nuova abbia script di installazione non revisionati.

### 2. Versione

Tutti i pacchetti escono con lo **stesso numero di versione**, secondo il Versionamento Semantico.
Finché siamo a `0.x`, una versione minore può contenere modifiche incompatibili, segnalate nel
CHANGELOG.

```bash
pnpm -r exec npm version 0.1.0 --no-git-tag-version
```

Nel `CHANGELOG.md` sposta "Non rilasciato" sotto `## 0.1.0 — AAAA-MM-GG`, poi fai il commit:

```bash
git commit -am "chore(release): 0.1.0"
git push origin main && git push github main
```

### 3. Prova del contenuto

```bash
pnpm build && pnpm -r pack --pack-destination /tmp/scriba-pack
```

Ogni archivio deve contenere solo `dist/` (o `scriba.css` per i temi), `package.json`, README,
LICENSE e NOTICE. Le dipendenze `workspace:*` devono essere diventate `0.1.0`. Usa sempre **`pnpm
publish`**, mai `npm publish`: solo pnpm sostituisce `workspace:*`.

### 4. Pubblicazione

```bash
git tag v0.1.0
git push github v0.1.0
```

Il tag avvia `release.yml`, che:

1. controlla che il tag corrisponda alla versione di tutti i pacchetti;
2. ripete lint, tipi, test e test di sicurezza;
3. costruisce ed esegue `pnpm -r publish --access public --provenance`.

Manda il tag anche a origin (`git push origin v0.1.0`), così i due repository restano uguali.

### 5. Dopo

- `npm view @scriba-editor/core@0.1.0`: la pagina del pacchetto mostra il badge "Provenance".
- Prova in un progetto vuoto: `pnpm add @scriba-editor/react @scriba-editor/themes` e l'esempio
  del README.
- **CDN:** apri `https://cdn.jsdelivr.net/npm/@scriba-editor/browser@0.1.0/dist/scriba.iife.js`
  e calcola l'hash per l'attributo `integrity` da indicare nella documentazione:

  ```bash
  openssl dgst -sha384 -binary packages/browser/dist/scriba.iife.js | openssl base64 -A
  ```

## Se qualcosa va storto

- **Il workflow fallisce prima di `publish`:** non è uscito nulla. Correggi, cancella il tag
  (`git push github :v0.1.0` e `git tag -d v0.1.0`) e ricrealo.
- **Il workflow fallisce a metà della pubblicazione:** alcuni pacchetti sono usciti e altri no. Si
  rilancia il job (Re-run): `pnpm publish` salta le versioni già presenti.
- **Una versione pubblicata ha un problema:** non si cancella e non si ripubblica. Si pubblica la
  versione successiva con la correzione e si segna quella difettosa con
  `npm deprecate @scriba-editor/<pacchetto>@<versione> "motivo"`.
- **Vulnerabilità:** segui `SECURITY.md`.
