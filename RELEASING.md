# Rilasciare Scriba su npm

Guida per pubblicare i pacchetti `@scriba/*`. La pubblicazione è un'azione **verso l'esterno e
non annullabile** (una versione pubblicata non si può ripubblicare con lo stesso numero): va fatta
da una persona, con 2FA, seguendo questa lista.

## Una volta sola, prima del primo rilascio

1. **Organizzazione npm.** Su npmjs.com crea l'organizzazione gratuita **`scriba`** (pacchetti
   pubblici). Se il nome risulta già preso, decidi un altro scope e rinomina tutti i pacchetti
   `@scriba/*` in un colpo solo **prima** di pubblicare. Nota: il pacchetto senza scope `scriba`
   esiste già (un logger di un altro autore): non è un conflitto, è uno spazio diverso.
2. **2FA** obbligatoria per gli account che pubblicano (impostazione dell'organizzazione:
   "Require two-factor authentication").
3. **Licenza.** `LICENSE` (MIT, Mario Trombino) è nella radice e copiato in ogni pacchetto (npm
   include solo il file nella cartella del pacchetto): se cambia, ricopialo in tutti.
4. **Repository pubblico su GitHub** (da creare) e campi `repository`, `homepage`, `bugs` in ogni
   `package.json` (da aggiungere con l'URL definitivo). Servono anche per la _provenance_.
5. **Provenance** (CLAUDE.md §5.12): npm la genera solo pubblicando da una CI supportata
   (GitHub Actions o GitLab CI su gitlab.com) con un repository pubblico. Configura su npmjs.com il
   **Trusted Publisher** per ogni pacchetto (pubblicazione via OIDC, senza token salvati).

## A ogni rilascio

### 1. Verifiche (devono passare tutte)

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm test:security
pnpm test:e2e
pnpm audit
pnpm build
pnpm size          # il core deve restare sotto i 60 KB gzip
pnpm bench         # su una macchina tranquilla: confronta con il rilascio precedente
pnpm test:perf     # idem
```

Controlla anche che nessuna dipendenza abbia script di installazione non revisionati.

### 2. Versione

Tutti i pacchetti escono con lo **stesso numero di versione** (Versionamento Semantico; finché
siamo a `0.x` una versione minore può contenere modifiche incompatibili, segnalate nel CHANGELOG).

```bash
pnpm -r exec npm version 0.1.0 --no-git-tag-version
```

Nel `CHANGELOG.md` sposta "Non rilasciato" sotto `## 0.1.0 — AAAA-MM-GG`. Poi commit e tag:

```bash
git commit -am "chore(release): 0.1.0"
git tag v0.1.0
```

### 3. Prova del contenuto

```bash
pnpm -r pack --pack-destination /tmp/scriba-pack
```

Ogni archivio deve contenere solo `dist/` (o `scriba.css` per i temi), `package.json`, README e
LICENSE; le dipendenze `workspace:*` devono essere diventate `0.1.0`. Usa **`pnpm publish`**, mai
`npm publish`: solo pnpm sostituisce `workspace:*`.

### 4. Pubblicazione (dalla CI)

Esempio di job GitHub Actions, avviato dal tag `v*`:

```yaml
permissions:
  contents: read
  id-token: write # provenance e trusted publishing (OIDC)
steps:
  - uses: actions/checkout@v4
  - uses: pnpm/action-setup@v4
  - uses: actions/setup-node@v4
    with: { node-version: 24, registry-url: 'https://registry.npmjs.org' }
  - run: pnpm install --frozen-lockfile
  - run: pnpm lint && pnpm test && pnpm test:security && pnpm build
  - run: pnpm -r publish --access public --provenance --no-git-checks
```

### 5. Dopo

- `npm view @scriba/core@0.1.0` e la pagina del pacchetto: badge "Provenance" presente.
- Prova in un progetto vuoto: `pnpm add @scriba/react @scriba/themes` e l'esempio del README.
- **CDN:** apri `https://cdn.jsdelivr.net/npm/@scriba/browser@0.1.0/dist/scriba.iife.js` e calcola
  l'hash per l'attributo `integrity` da indicare nella documentazione:

  ```bash
  openssl dgst -sha384 -binary packages/browser/dist/scriba.iife.js | openssl base64 -A
  ```

## Se qualcosa va storto

Una versione pubblicata con un problema **non si cancella e non si ripubblica**: si pubblica la
versione successiva con la correzione e si segna quella difettosa con
`npm deprecate @scriba/<pacchetto>@<versione> "motivo"`. Per una vulnerabilità segui `SECURITY.md`.
