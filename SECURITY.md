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

Anche la validazione dei file caricati (tipo reale, dimensione, eventuale antivirus)
spetta al tuo server.

---

## English

To report a vulnerability, email **trombino.mario.ph@gmail.com** privately
(subject: `[SECURITY] Scriba – short description`). Please do not open public issues.
Always re-sanitize client HTML on the server with `@scriba/sanitize-server`.
