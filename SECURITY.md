# Sicurezza di Scriba

## Segnalare una vulnerabilità

**Non aprire issue pubbliche per problemi di sicurezza.**

Scrivi in privato a: **trombino.mario.ph@gmail.com**
Oggetto consigliato: `[SECURITY] Scriba – breve descrizione`

Includi, se possibile:

- pacchetto e versione coinvolti (`@scriba/core`, `@scriba/sanitize-server`, …);
- descrizione del problema e impatto (es. XSS, esecuzione di codice, accesso a documenti altrui);
- passi per riprodurlo o un payload minimo;
- browser / versione di Node usati.

### Cosa succede dopo

| Fase                        | Tempo indicativo          |
| --------------------------- | ------------------------- |
| Conferma di ricezione       | entro 3 giorni lavorativi |
| Prima valutazione e gravità | entro 10 giorni           |
| Correzione e rilascio       | in base alla gravità      |

Ogni vulnerabilità corretta riceve un test di regressione nella suite di sicurezza.
Se lo desideri, verrai citato nelle note di rilascio una volta pubblicata la correzione.

## Versioni supportate

Il progetto è in sviluppo iniziale (`0.x`): le correzioni di sicurezza vengono rilasciate
solo sull'ultima versione pubblicata.

## Cosa rientra

- XSS o esecuzione di codice tramite contenuto incollato, importato, caricato (`setContent`),
  ricevuto in collaborazione o generato dall'AI;
- aggiramento della whitelist di URL, tag o attributi;
- differenze tra la sanificazione del browser e quella di `@scriba/sanitize-server`
  (mutation XSS);
- blocchi o consumo eccessivo di risorse (DoS) con input contenuti;
- accesso o modifica non autorizzata di documenti nella collaborazione in tempo reale.

## Responsabilità di chi integra l'editor

La sanificazione nel browser è una comodità, **non una protezione**: chiunque può chiamare
la tua API saltando l'editor. Prima di salvare o mostrare HTML proveniente dai client,
passalo **sempre** da `@scriba/sanitize-server` con lo stesso schema usato nell'editor.

L'HTML prodotto può contenere attributi `style`, ma solo **tipizzati e validati**
(allineamento, rientro, colori, font e dimensione), mai stili liberi. L'editor li applica
via CSSOM e funziona con una CSP rigida. Se la pagina che _mostra_ l'HTML salvato usa una
CSP che vieta gli stili inline, quegli stili non verranno applicati: o si permette
`style-src-attr 'unsafe-inline'` su quella pagina, o si accetta la resa senza stili.

Se la tua CSP usa la direttiva `trusted-types`, aggiungi la policy `scriba`: serve solo
a leggere l'HTML incollato in un documento inerte, il cui contenuto passa comunque dal
parser dello schema.

Anche la validazione dei file caricati (tipo reale, dimensione, eventuale antivirus)
spetta al tuo server.

I **blocchi protetti** (`@scriba/plugin-permissions`) bloccano solo l'editor. Quando salvi un
documento, confronta la versione precedente e quella nuova con `checkBlockEdits` e rifiuta il
salvataggio se restituisce degli id. In collaborazione passa `canEditBlock` da `authenticate` e
lo `schema` al server: gli aggiornamenti che toccano un blocco protetto vengono annullati per
tutti. Il nome mostrato nelle menzioni è solo testo: risolvi sempre l'id sul server.

Chi è in **sola lettura ma può commentare** (`canComment`) può solo aggiungere o togliere le
ancore dei commenti: il server di collaborazione annulla ogni altro cambiamento. Se salvi i
documenti con una tua API, applica la stessa regola: confronta prima e dopo ignorando i mark di
annotazione e rifiuta il salvataggio se il resto è cambiato.

---

## English

To report a vulnerability, email **trombino.mario.ph@gmail.com** privately
(subject: `[SECURITY] Scriba – short description`). Please do not open public issues.
Always re-sanitize client HTML on the server with `@scriba/sanitize-server`.
