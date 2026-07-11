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

Non servono variabili ambiente per questa demo.

## Limiti della versione demo

- Non usa Supabase o database remoto.
- Non ha autenticazione reale.
- I dati sono fittizi e vengono salvati solo nel `localStorage` del browser.
- Ogni browser/dispositivo ha una propria copia dei dati.
- Non include QR code, notifiche, SMS, WhatsApp, PDF, ruoli o permessi avanzati.
