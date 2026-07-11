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

Nell'app compare il riquadro "Archivio dati":

- senza PIN usa i dati locali del browser;
- con il PIN Supabase carica e salva i dati condivisi nel database.

PIN iniziale per i test:

```text
cucina2026
```

Lo schema applicato è in `supabase/schema.sql`. Le tabelle hanno RLS attivo e non sono accessibili direttamente con la chiave pubblicabile; l'app passa dalle funzioni RPC `cpg_get_state` e `cpg_save_state`, protette dal PIN.

Per cambiare PIN in Supabase:

```sql
update public.cpg_app_config
set value = extensions.crypt('nuovo-pin', extensions.gen_salt('bf')),
    updated_at = now()
where key = 'access_pin_hash';
```

## Limiti della versione demo

- Non ha autenticazione reale.
- La modalità locale usa dati fittizi nel `localStorage`.
- La modalità Supabase permette test condivisi con dati reali, ma il PIN non sostituisce un sistema di autenticazione completo.
- Non include QR code, notifiche, SMS, WhatsApp, PDF, ruoli o permessi avanzati.
