# Cucina Popolare Genovese

Web app in italiano per gestire anagrafica, prenotazioni giornaliere, ingressi e importazione Excel/CSV della Cucina Popolare Genovese.

## Installazione

```bash
pnpm install
```

## Avvio locale

```bash
pnpm dev
```

Apri l'indirizzo mostrato dal terminale, di solito `http://localhost:3000`.

## Controlli

```bash
pnpm lint
pnpm build
```

Il progetto usa Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/Database e `xlsx`.

## Login

Pagina pubblica:

- `/login`

Pagine protette:

- `/`
- `/test-supabase`
- dashboard, prenotazioni, nuovo ingresso, anagrafica e import Excel

Credenziali demo locali:

```text
nome utente: admin
password demo: 1234
```

Il login demo usa dati fittizi nel `localStorage`. Per usare dati reali, accedi con un volontario creato in Supabase Auth e con record attivo in `profiles`.

## Supabase

Il progetto e collegato al Supabase `upsqhkvlpxowsdoihpth`.

Variabili consigliate per locale e Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://upsqhkvlpxowsdoihpth.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_R0dXZVu6DAbY2z2u8p7U4g_IIPcszVI
```

Sono chiavi pubblicabili: non usare mai `service_role` o chiavi secret nel browser.

Per applicare il modello dati, apri Supabase SQL Editor ed esegui tutto il contenuto di:

```text
supabase/schema.sql
```

Lo schema abilita RLS. Gli utenti anonimi non accedono ai dati operativi; i volontari autenticati e attivi possono gestire anagrafica, prenotazioni, ingressi, contatti e log comunicazioni.

## Volontari

### Attivare email/password

Nel pannello Supabase:

1. Vai in Authentication.
2. Apri Providers.
3. Abilita Email.
4. Abilita Email + Password.

### Disabilitare la registrazione pubblica

Nel pannello Supabase, disabilita le registrazioni pubbliche se l'opzione e disponibile nel progetto.

In questa app non esiste una pagina di registrazione: i volontari vengono creati manualmente.

### Creare un volontario

1. Vai in Authentication > Users.
2. Crea un nuovo utente.
3. Inserisci email e password temporanea.
4. Conferma l'email se richiesto dal progetto.
5. Copia l'`id` utente.

Inserisci il profilo:

```sql
insert into public.profiles (id, nome, cognome, ruolo, attivo)
values (
  'UUID_UTENTE_AUTH',
  'Nome',
  'Cognome',
  'operatore',
  true
);
```

Ruoli ammessi:

- `admin`
- `operatore`

Per disattivare un volontario:

```sql
update public.profiles
set attivo = false
where id = 'UUID_UTENTE_AUTH';
```

## Prenotazioni Reali

La base dati operativa usa queste tabelle:

- `cpg_users`: persone registrate, numero tessera, telefono, stato attivo e note.
- `cpg_daily_entries`: prenotazioni e ingressi giornalieri, con vincolo unico su persona + data.
- `cpg_contacts`: numeri abilitati per SMS, WhatsApp e telefono.
- `cpg_communication_logs`: log dei messaggi/chiamate in entrata e in uscita.
- `cpg_booking_settings`: capienza giornaliera e lista di attesa.
- `cpg_waitlist`: richieste oltre capienza.

Dal gestionale:

1. Accedi con un volontario Supabase reale.
2. Vai in "Anagrafica" e crea o importa le persone registrate.
3. Vai in "Nuovo ingresso".
4. Cerca una persona.
5. Usa "Prenota per oggi" per creare la prenotazione manuale.
6. Usa "Registra ingresso" quando la persona arriva.

La prenotazione manuale salva `booking_channel = 'manuale'`.

## Predisposizione SMS, WhatsApp E Telefono

Lo schema contiene gia le funzioni:

```sql
public.cpg_request_booking_by_phone(
  p_phone_e164 text,
  p_channel text,
  p_entry_date date default current_date,
  p_body text default null,
  p_provider_message_id text default null
)
```

```sql
public.cpg_request_booking_by_phone_webhook(
  p_secret text,
  p_phone_e164 text,
  p_channel text,
  p_entry_date date default current_date,
  p_body text default null,
  p_provider_message_id text default null
)
```

Canali ammessi:

- `sms`
- `whatsapp`
- `telefono`

La funzione riconosce il numero in `cpg_contacts`, verifica che la persona sia attiva, controlla la capienza giornaliera, crea o aggiorna la prenotazione, registra il log comunicazione e mette in lista di attesa quando la capienza e esaurita.

Non e esposta agli utenti anonimi. Il prossimo passaggio sara creare endpoint server-side protetti da segreto provider per ricevere webhook Twilio/WhatsApp/telefonia e chiamare questa funzione.

## Webhook SMS Twilio

Endpoint applicazione:

```text
POST /api/webhooks/twilio/sms
```

URL produzione:

```text
https://cucinapopolare-accessi.vercel.app/api/webhooks/twilio/sms
```

Variabili Vercel da configurare:

```bash
CPG_WEBHOOK_SECRET=...
TWILIO_AUTH_TOKEN=...
TWILIO_WEBHOOK_PUBLIC_URL=https://cucinapopolare-accessi.vercel.app/api/webhooks/twilio/sms
```

`CPG_WEBHOOK_SECRET` deve corrispondere al segreto salvato hashato in `public.cpg_app_config` con chiave `webhook_secret_hash`.

Quando arriva un SMS con testo `PRENOTO`, il webhook:

1. valida la firma Twilio, se `TWILIO_AUTH_TOKEN` e configurato;
2. normalizza il numero mittente;
3. chiama la funzione Supabase webhook;
4. risponde a Twilio in formato TwiML;
5. rende il log visibile nella sezione "Comunicazioni".

## Formato Excel O CSV

Il file puo essere `.xlsx`, `.xls` o `.csv`, massimo 5 MB e 2.000 righe.

Colonne consigliate:

- `numero_tessera`
- `nome`
- `cognome`
- `telefono`
- `attivo`
- `note`

Sono accettate anche intestazioni alternative come `Numero tessera`, `Tessera`, `Numero`, `Nome`, `Cognome`, `Telefono`, `Cellulare`, `Attivo`, `Stato`, `Note`.

Il campo `attivo` accetta `si`, `no`, `true`, `false`, `1`, `0`, `attivo`, `non attivo`.

## Pubblicazione Su Vercel

1. Carica il progetto su GitHub.
2. Importa il repository in Vercel.
3. Configura le variabili Supabase consigliate.
4. Avvia il deploy.

## Limiti Attuali

- Il login demo usa dati fittizi nel `localStorage`.
- I dati reali richiedono accesso con volontario Supabase Auth e profilo attivo.
- Gli endpoint SMS, WhatsApp e telefonia non sono ancora collegati al provider.
- Non include ancora invio notifiche, QR code, PDF o permessi amministrativi avanzati.
