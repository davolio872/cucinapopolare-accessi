# Cucina Popolare Genovese

Demo web app in italiano per gestire prenotazioni giornaliere, ingressi, anagrafica utenti e importazione da Excel/CSV.

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

Il progetto usa Next.js App Router, TypeScript, Tailwind CSS e la libreria `xlsx`.

## Formato Excel o CSV

Il file può essere `.xlsx`, `.xls` o `.csv`, massimo 5 MB e 2.000 righe.

Colonne consigliate:

- `numero_tessera`
- `nome`
- `cognome`
- `telefono`
- `attivo`
- `note`

Sono accettate anche intestazioni alternative come `Numero tessera`, `Tessera`, `Numero`, `Nome`, `Cognome`, `Telefono`, `Cellulare`, `Attivo`, `Stato`, `Note`.

Il campo `attivo` accetta `sì`, `si`, `no`, `true`, `false`, `1`, `0`, `attivo`, `non attivo`.

Nella pagina "Importa da Excel" è disponibile il pulsante "Scarica modello Excel", che genera `modello_utenti_cucina_popolare.xlsx` con due righe di esempio. Le colonne numero tessera e telefono sono trattate come testo.

## Pubblicazione su Vercel

1. Crea un repository GitHub e carica il progetto.
2. Accedi a Vercel e scegli "Add New Project".
3. Importa il repository GitHub.
4. Lascia le impostazioni predefinite per Next.js.
5. Avvia il deploy.

Non servono variabili ambiente obbligatorie: la chiave pubblicabile Supabase è già configurata per questa demo.

## Collegamento Supabase

Il progetto è collegato al Supabase `upsqhkvlpxowsdoihpth`.

Variabili consigliate per locale e Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://upsqhkvlpxowsdoihpth.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_R0dXZVu6DAbY2z2u8p7U4g_IIPcszVI
```

Sono chiavi pubblicabili: non usare mai `service_role` o chiavi secret nel browser.

La demo mantiene ancora i dati operativi nel browser con `localStorage`. Il collegamento Supabase resta disponibile a livello di progetto e schema, ma l'accesso principale al gestionale passa dal login iniziale.

PIN iniziale per i test:

```text
cucina2026
```

Lo schema applicato è in `supabase/schema.sql`. Le tabelle hanno RLS attivo e non sono accessibili direttamente con la chiave pubblicabile; le funzioni RPC `cpg_get_state` e `cpg_save_state` restano disponibili per test dati protetti da PIN.

Per cambiare PIN in Supabase:

```sql
update public.cpg_app_config
set value = extensions.crypt('nuovo-pin', extensions.gen_salt('bf')),
    updated_at = now()
where key = 'access_pin_hash';
```

## Autenticazione volontari

L'app protegge tutte le pagine operative con Supabase Auth email/password e cookie SSR tramite `@supabase/ssr`.

Pagine protette:

- `/`
- `/test-supabase`
- tutte le sezioni operative interne: dashboard, prenotazioni, nuovo ingresso, anagrafica e import Excel

Pagina pubblica:

- `/login`

### 1. Attivare email/password

Nel pannello Supabase:

1. Vai in Authentication.
2. Apri Providers.
3. Abilita Email.
4. Abilita Email + Password.

### 2. Disabilitare temporaneamente la registrazione pubblica

Nel pannello Supabase:

1. Vai in Authentication.
2. Apri Providers oppure Settings, in base alla vista Supabase.
3. Disabilita le registrazioni pubbliche se l'opzione è disponibile nel progetto.

In questa app non esiste una pagina di registrazione: i volontari vengono creati manualmente.

### 3. Creare manualmente un volontario

Nel pannello Supabase:

1. Vai in Authentication > Users.
2. Crea un nuovo utente.
3. Inserisci email e password temporanea.
4. Conferma l'email se il progetto richiede conferma prima del login.

### 4. Inserire il profilo

Dopo aver creato l'utente, copia il suo `id` e inserisci il profilo:

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

### 5. Testare login e logout

Credenziali demo consigliate:

```text
nome utente: admin
password demo: 1234
```

Questo accesso demo usa un cookie httpOnly lato server e serve solo per provare il gestionale. Per test con volontari reali, crea utenti Supabase Auth con email/password robuste.

1. Apri `/login`.
2. Inserisci email e password del volontario.
3. Dopo l'accesso viene mostrata la dashboard.
4. Nell'intestazione compaiono nome, email e pulsante "Esci".
5. Premi "Esci": l'app torna a `/login`.

### 6. Verificare protezione pagine

Da browser anonimo o dopo logout:

- aprendo `/` si viene reindirizzati a `/login`;
- aprendo `/test-supabase` si viene reindirizzati a `/login`;
- visitando `/login` mentre si è già autenticati si torna alla dashboard.

### 7. Aggiungere altri operatori

Ripeti la creazione manuale dell'utente in Authentication > Users e inserisci un record corrispondente in `profiles`.

## Limiti della versione demo

- Non ha autenticazione reale.
- La modalità locale usa dati fittizi nel `localStorage`.
- La modalità Supabase permette test condivisi con dati reali, ma il PIN non sostituisce un sistema di autenticazione completo.
- Non include QR code, notifiche, SMS, WhatsApp, PDF, ruoli o permessi avanzati.
