"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import jsQR from "jsqr";
import { createDemoState } from "@/data/demo-data";
import {
  deleteOperationalUser,
  loadOperationalState,
  upsertOperationalEntry,
  upsertOperationalUser,
  upsertOperationalUsers,
} from "@/lib/cpg-data";
import { currentTime, formatItalianDate, todayKey } from "@/lib/dates";
import { applyImport, downloadTemplate, parseImportFile } from "@/lib/excel";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedVolunteer } from "@/lib/supabase/server";
import type {
  AppState,
  AttendanceStatus,
  DailyEntry,
  DuplicateStrategy,
  ImportPreview,
  ImportSummary,
  User,
} from "@/types";

type SectionId =
  | "dashboard"
  | "prenotazioni"
  | "ingresso"
  | "calendario"
  | "statistiche"
  | "comunicazioni"
  | "utenti"
  | "importa";

const storageKey = "cucina-popolare-demo-state-v1";
const today = todayKey();

function waitForVideoReady(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("video-timeout"));
    }, 3000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    };

    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("video-error"));
    };

    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
  });
}

function readQrFromVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return "";

  const targetWidth = Math.min(sourceWidth, 960);
  const targetHeight = Math.round((sourceHeight / sourceWidth) * targetWidth);
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "";

  context.drawImage(video, 0, 0, targetWidth, targetHeight);
  const imageData = context.getImageData(0, 0, targetWidth, targetHeight);
  const result = jsQR(imageData.data, targetWidth, targetHeight, {
    inversionAttempts: "attemptBoth",
  });

  return result?.data ?? "";
}

const sections: { id: SectionId; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "⌂" },
  { id: "prenotazioni", label: "Prenotazioni", icon: "✓" },
  { id: "ingresso", label: "Nuovo ingresso", icon: "+" },
  { id: "calendario", label: "Calendario", icon: "C" },
  { id: "statistiche", label: "Statistiche", icon: "%" },
  { id: "comunicazioni", label: "Comunicazioni", icon: "M" },
  { id: "utenti", label: "Anagrafica", icon: "◉" },
  { id: "importa", label: "Importa Excel", icon: "⇩" },
];

const operatorSections = sections.filter((section) => section.id === "ingresso");

const emptyUser: Omit<User, "id"> = {
  cardNumber: "",
  firstName: "",
  lastName: "",
  phone: "",
  active: true,
  notes: "",
};

function sortUsers(users: User[]) {
  return [...users].sort((a, b) => a.cardNumber.localeCompare(b.cardNumber, "it"));
}

function statusClass(status: AttendanceStatus) {
  if (status === "Presente") return "bg-yellow-300 text-black";
  if (status === "Assente") return "border border-black bg-white text-black";
  if (status === "Senza prenotazione") return "bg-yellow-100 text-black";
  return "bg-black text-white";
}

function matchesUser(user: User, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [user.cardNumber, user.firstName, user.lastName, user.phone]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function formatDateKey(dateKey: string) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${dateKey}T00:00:00`));
}

function currentMonthKey() {
  return today.slice(0, 7);
}

function getMonthDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const days = new Date(year, month, 0).getDate();
  return Array.from({ length: days }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${monthKey}-${day}`;
  });
}

function countStatus(entries: DailyEntry[], status: AttendanceStatus) {
  return entries.filter((entry) => entry.status === status).length;
}

function channelLabel(channel?: DailyEntry["bookingChannel"]) {
  if (channel === "sms") return "SMS";
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "telefono") return "Telefono";
  if (channel === "manuale") return "Manuale";
  return "-";
}

function extractCardNumberFromQr(value: string) {
  const raw = value.trim();
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw) as {
      cardNumber?: string;
      card_number?: string;
      tessera?: string;
      id?: string;
    };
    return (
      parsed.cardNumber
      || parsed.card_number
      || parsed.tessera
      || parsed.id
      || ""
    ).trim();
  } catch {
    // Plain card numbers and simple prefixed values are the normal QR format.
  }

  const withoutPrefix = raw.replace(/^(CPG|TESSERA|CARD|QR)[:#-]/i, "").trim();
  try {
    const url = new URL(withoutPrefix);
    return (
      url.searchParams.get("cardNumber")
      || url.searchParams.get("card_number")
      || url.searchParams.get("tessera")
      || url.searchParams.get("card")
      || url.searchParams.get("id")
      || url.pathname.split("/").filter(Boolean).at(-1)
      || ""
    ).trim();
  } catch {
    // Not a URL.
  }

  if (withoutPrefix.includes("/")) {
    const candidate = withoutPrefix.split("/").filter(Boolean).at(-1);
    return candidate?.trim() || "";
  }
  return withoutPrefix;
}

function percent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export function CucinaApp({
  volunteer,
  initialState,
  dataMode,
}: {
  volunteer: AuthenticatedVolunteer;
  initialState: AppState;
  dataMode: "demo" | "supabase";
}) {
  const accessRole = volunteer.profile?.ruolo === "admin" ? "admin" : "operatore";
  const availableSections = accessRole === "admin" ? sections : operatorSections;
  const [activeSection, setActiveSection] = useState<SectionId>(
    accessRole === "admin" ? "dashboard" : "ingresso",
  );
  const [state, setState] = useState<AppState>(() => initialState);
  const [loaded, setLoaded] = useState(dataMode === "supabase");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const supabase = useMemo(
    () => (dataMode === "supabase" ? createClient() : null),
    [dataMode],
  );
  const todayEntries = useMemo(
    () => state.entries.filter((entry) => entry.date === today),
    [state.entries],
  );

  useEffect(() => {
    if (dataMode !== "demo") return;
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        try {
          setState(JSON.parse(saved) as AppState);
        } catch {
          setState(createDemoState(today));
        }
      }
      setLoaded(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [dataMode]);

  useEffect(() => {
    if (dataMode === "demo" && loaded) {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    }
  }, [dataMode, loaded, state]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4500);
  }

  function commitState(updater: (previous: AppState) => AppState) {
    setState((previous) => {
      const next = updater(previous);
      return next;
    });
  }

  function persist(action: () => Promise<unknown>) {
    if (!supabase) return;
    setSaving(true);
    void action()
      .catch(() => {
        showNotice("Salvataggio non riuscito. Controlla connessione e permessi Supabase.");
      })
      .finally(() => setSaving(false));
  }

  function refreshData() {
    if (!supabase) return;
    setRefreshing(true);
    void loadOperationalState(supabase, {
      includeCommunicationLogs: accessRole === "admin",
      entryDate: accessRole === "operatore" ? today : undefined,
    })
      .then((nextState) => {
        setState(nextState);
        showNotice("Dati aggiornati.");
      })
      .catch(() => {
        showNotice("Aggiornamento non riuscito. Controlla connessione e permessi Supabase.");
      })
      .finally(() => setRefreshing(false));
  }

  function setEntry(userId: string, status: AttendanceStatus, entryTime?: string) {
    const existing = state.entries.find(
      (entry) => entry.userId === userId && entry.date === today,
    );
    const nextEntry: DailyEntry = {
      ...existing,
      userId,
      status,
      date: today,
      entryTime,
      bookingChannel:
        existing?.bookingChannel ?? (status === "Prenotato" ? "manuale" : undefined),
      bookedAt:
        existing?.bookedAt ?? (status === "Prenotato" ? new Date().toISOString() : undefined),
    };

    commitState((previous) => {
      const current = previous.entries.find(
        (entry) => entry.userId === userId && entry.date === today,
      );
      return {
        ...previous,
        entries: current
          ? previous.entries.map((entry) =>
              entry.userId === userId && entry.date === today ? nextEntry : entry,
            )
          : [...previous.entries, nextEntry],
      };
    });
    persist(() => upsertOperationalEntry(supabase!, nextEntry));
  }

  function registerPresence(userId: string) {
    const entry = todayEntries.find((item) => item.userId === userId);
    if (entry?.status === "Presente" || entry?.status === "Senza prenotazione") {
      showNotice("Ingresso già registrato per oggi.");
      return;
    }
    setEntry(userId, "Presente", currentTime());
    showNotice("Presenza registrata.");
  }

  function registerWalkIn(user: User) {
    const entry = todayEntries.find((item) => item.userId === user.id);
    if (entry?.status === "Presente" || entry?.status === "Senza prenotazione") {
      showNotice("Questa persona è già stata registrata oggi.");
      return;
    }
    setEntry(user.id, entry ? "Presente" : "Senza prenotazione", currentTime());
    showNotice(entry ? "Prenotazione confermata come presente." : "Ingresso senza prenotazione registrato.");
  }

  function bookUser(user: User) {
    if (!user.active) {
      showNotice("Utente non attivo: prenotazione non consentita.");
      return;
    }
    const entry = todayEntries.find((item) => item.userId === user.id);
    if (entry) {
      showNotice("Esiste gia una prenotazione o registrazione per oggi.");
      return;
    }
    setEntry(user.id, "Prenotato");
    showNotice("Prenotazione registrata.");
  }

  function upsertUser(formUser: Omit<User, "id">, editingId?: string) {
    const duplicated = state.users.some(
      (user) => user.cardNumber === formUser.cardNumber && user.id !== editingId,
    );
    if (duplicated) {
      showNotice("Numero tessera già presente. Inserisci un valore univoco.");
      return false;
    }
    const nextUser: User = editingId
      ? { id: editingId, ...formUser }
      : { id: `u-${crypto.randomUUID()}`, ...formUser };

    commitState((previous) => ({
      ...previous,
      users: editingId
        ? previous.users.map((user) => (user.id === editingId ? nextUser : user))
        : [...previous.users, nextUser],
    }));
    persist(() => upsertOperationalUser(supabase!, nextUser));
    showNotice(editingId ? "Utente aggiornato." : "Nuovo utente creato.");
    return true;
  }

  function deleteUser(userId: string) {
    const confirmed = window.confirm("Confermi l'eliminazione dell'utente?");
    if (!confirmed) return;
    commitState((previous) => ({
      ...previous,
      users: previous.users.filter((user) => user.id !== userId),
      entries: previous.entries.filter((entry) => entry.userId !== userId),
    }));
    persist(() => deleteOperationalUser(supabase!, userId));
    showNotice("Utente eliminato.");
  }

  function deactivateUser(userId: string) {
    const current = state.users.find((user) => user.id === userId);
    if (!current) return;
    const nextUser = { ...current, active: !current.active };

    commitState((previous) => ({
      ...previous,
      users: previous.users.map((user) =>
        user.id === userId ? nextUser : user,
      ),
    }));
    persist(() => upsertOperationalUser(supabase!, nextUser));
  }

  const stats = {
    activeUsers: state.users.filter((user) => user.active).length,
    booked: todayEntries.filter((entry) => entry.status === "Prenotato").length,
    present: todayEntries.filter((entry) => entry.status === "Presente").length,
    absent: todayEntries.filter((entry) => entry.status === "Assente").length,
    walkIns: todayEntries.filter((entry) => entry.status === "Senza prenotazione").length,
  };

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r-2 border-black bg-white p-5 md:block">
          <Brand />
          <nav className="mt-8 space-y-2">
            {availableSections.map((section) => (
              <NavButton
                key={section.id}
                section={section}
                active={activeSection === section.id}
                onClick={() => setActiveSection(section.id)}
              />
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b-2 border-black bg-white/95 px-4 py-3 backdrop-blur md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="md:hidden">
                <Brand compact />
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium capitalize text-zinc-700">{formatItalianDate()}</p>
                <p className="text-xs font-semibold text-zinc-600">
                  {dataMode === "supabase"
                    ? saving
                      ? "Supabase: salvataggio..."
                      : accessRole === "admin"
                        ? "Supabase: accesso amministratore"
                        : "Supabase: accesso operatore"
                    : "Modalita demo locale"}
                </p>
              </div>
              <UserMenu volunteer={volunteer} />
              <select
                value={activeSection}
                onChange={(event) => setActiveSection(event.target.value as SectionId)}
                className="h-12 rounded-md border-2 border-black bg-white px-3 text-base font-semibold md:hidden"
                aria-label="Menu sezioni"
              >
                {availableSections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.label}
                  </option>
                ))}
              </select>
            </div>
          </header>

          {notice ? (
            <div className="mx-4 mt-4 rounded-md border-2 border-black bg-yellow-100 px-4 py-3 text-black md:mx-8">
              {notice}
            </div>
          ) : null}

          <div className="px-4 py-6 md:px-8">
            {activeSection === "dashboard" && accessRole === "admin" ? (
              <Dashboard
                stats={stats}
                setActiveSection={setActiveSection}
                sections={availableSections}
              />
            ) : null}
            {activeSection === "prenotazioni" && accessRole === "admin" ? (
              <Bookings users={state.users} entries={todayEntries} onRegister={registerPresence} />
            ) : null}
            {activeSection === "ingresso" ? (
              <NewEntry
                users={state.users}
                entries={todayEntries}
                onBook={bookUser}
                onRegister={registerWalkIn}
              />
            ) : null}
            {activeSection === "calendario" && accessRole === "admin" ? (
              <CalendarHistory users={state.users} entries={state.entries} />
            ) : null}
            {activeSection === "statistiche" && accessRole === "admin" ? (
              <Statistics users={state.users} entries={state.entries} />
            ) : null}
            {activeSection === "comunicazioni" && accessRole === "admin" ? (
              <Communications
                users={state.users}
                logs={state.communicationLogs}
                onRefresh={dataMode === "supabase" ? refreshData : undefined}
                refreshing={refreshing}
              />
            ) : null}
            {activeSection === "utenti" && accessRole === "admin" ? (
              <UsersRegistry
                users={state.users}
                onSave={upsertUser}
                onDelete={deleteUser}
                onToggleActive={deactivateUser}
              />
            ) : null}
            {activeSection === "importa" && accessRole === "admin" ? (
              <ImportPage
                users={state.users}
                onApply={(preview, strategy) => {
                  const result = applyImport(state.users, preview, strategy);
                  commitState((previous) => ({ ...previous, users: result.users }));
                  persist(() => upsertOperationalUsers(supabase!, result.users));
                  showNotice("Importazione completata.");
                  return result.summary;
                }}
              />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function UserMenu({ volunteer }: { volunteer: AuthenticatedVolunteer }) {
  const fullName = [volunteer.profile?.nome, volunteer.profile?.cognome]
    .filter(Boolean)
    .join(" ");
  const roleLabel = volunteer.profile?.ruolo === "admin" ? "Amministratore" : "Operatore";

  return (
    <div className="flex items-center gap-3 rounded-md border-2 border-black bg-white px-3 py-2">
      <div className="hidden text-right sm:block">
        {fullName ? <p className="text-sm font-bold">{fullName}</p> : null}
        <p className="text-xs text-zinc-700">{volunteer.email}</p>
        <p className="text-xs font-bold text-black">{roleLabel}</p>
      </div>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="h-10 rounded-md border-2 border-black bg-yellow-400 px-3 text-sm font-bold text-black hover:bg-yellow-300"
        >
          Esci
        </button>
      </form>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/logo-cucina-popolare.png"
        alt="Cucina Popolare Genovese"
        width={64}
        height={84}
        className={compact ? "h-12 w-10 object-contain" : "h-16 w-12 object-contain"}
      />
      <div>
        <p className={compact ? "text-lg font-bold" : "text-2xl font-bold"}>Cucina Popolare Genovese</p>
        {!compact ? <p className="text-sm text-zinc-700">Demo gestione ingressi</p> : null}
      </div>
    </div>
  );
}

function NavButton({
  section,
  active,
  onClick,
}: {
  section: { label: string; icon: string };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-14 w-full items-center gap-3 rounded-md px-4 text-left text-base font-semibold transition ${
        active ? "border-2 border-black bg-yellow-400 text-black" : "text-black hover:bg-yellow-100"
      }`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-md border border-black bg-white text-lg">{section.icon}</span>
      {section.label}
    </button>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold tracking-normal md:text-3xl">{title}</h1>
      <p className="mt-1 max-w-3xl text-base text-zinc-700">{description}</p>
    </div>
  );
}

function Dashboard({
  stats,
  setActiveSection,
  sections,
}: {
  stats: Record<string, number>;
  setActiveSection: (section: SectionId) => void;
  sections: { id: SectionId; label: string; icon: string }[];
}) {
  const cards = [
    ["Utenti attivi", stats.activeUsers],
    ["Prenotati oggi", stats.booked],
    ["Presenti", stats.present],
    ["Assenti", stats.absent],
    ["Senza prenotazione", stats.walkIns],
  ];
  return (
    <section>
      <SectionHeader
        title="Dashboard"
        description={`Oggi è ${formatItalianDate()}.`}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-md border-2 border-black bg-white p-4">
            <p className="text-sm font-semibold text-zinc-700">{label}</p>
            <p className="mt-2 text-4xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sections.filter((section) => section.id !== "dashboard").map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSection(section.id)}
            className="min-h-24 rounded-md border-2 border-black bg-yellow-400 px-5 py-4 text-left text-xl font-bold text-black transition hover:bg-yellow-300"
          >
            <span className="mb-2 block text-2xl">{section.icon}</span>
            {section.label === "Importa Excel" ? "Importa da Excel" : section.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function Bookings({
  users,
  entries,
  onRegister,
}: {
  users: User[];
  entries: DailyEntry[];
  onRegister: (userId: string) => void;
}) {
  const rows = entries
    .map((entry) => ({ entry, user: users.find((user) => user.id === entry.userId) }))
    .filter((row): row is { entry: DailyEntry; user: User } => Boolean(row.user))
    .sort((a, b) => a.user.cardNumber.localeCompare(b.user.cardNumber, "it"));

  return (
    <section>
      <SectionHeader
        title="Prenotazioni del giorno"
        description="Registra rapidamente le presenze e controlla lo stato degli ingressi di oggi."
      />
      <ResponsiveTable
        headers={["Tessera", "Nome", "Cognome", "Stato", "Ora", "Azione"]}
        rows={rows.map(({ user, entry }) => [
          user.cardNumber,
          user.firstName,
          user.lastName,
          <Badge key="badge" status={entry.status} />,
          entry.entryTime || "-",
          <button
            key="button"
            type="button"
            onClick={() => onRegister(user.id)}
            disabled={entry.status === "Presente" || entry.status === "Senza prenotazione"}
            className="h-11 rounded-md border-2 border-black bg-yellow-400 px-4 font-semibold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            Registra presenza
          </button>,
        ])}
      />
    </section>
  );
}

function NewEntry({
  users,
  entries,
  onBook,
  onRegister,
}: {
  users: User[];
  entries: DailyEntry[];
  onBook: (user: User) => void;
  onRegister: (user: User) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [manualQr, setManualQr] = useState("");
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("Scanner non attivo.");
  const videoRef = useRef<HTMLVideoElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanInProgressRef = useRef(false);
  const lastScanAtRef = useRef(0);
  const results = useMemo(
    () => sortUsers(users.filter((user) => user.active && matchesUser(user, query))).slice(0, 8),
    [query, users],
  );
  const selected = users.find((user) => user.id === selectedId);
  const selectedEntry = selected ? entries.find((entry) => entry.userId === selected.id) : undefined;
  const alreadyRegistered =
    selectedEntry?.status === "Presente" || selectedEntry?.status === "Senza prenotazione";
  const alreadyBooked = Boolean(selectedEntry);

  useEffect(() => {
    return () => stopScanner(false);
  }, []);

  function findUserByQr(value: string) {
    const cardNumber = extractCardNumberFromQr(value);
    if (!cardNumber) return null;

    return users.find((user) => (
      user.active
      && (
        user.cardNumber.toLowerCase() === cardNumber.toLowerCase()
        || user.id.toLowerCase() === cardNumber.toLowerCase()
      )
    )) ?? null;
  }

  function selectFromQr(value: string) {
    const cardNumber = extractCardNumberFromQr(value);
    const user = findUserByQr(value);

    if (!user) {
      setScannerMessage(cardNumber ? `Tessera non riconosciuta: ${cardNumber}` : "QR non valido.");
      return;
    }

    setSelectedId(user.id);
    setQuery(user.cardNumber);
    setScannerMessage(`Tessera letta: ${user.cardNumber} - ${user.firstName} ${user.lastName}`);
  }

  function confirmAndRegister(user: User) {
    const entry = entries.find((item) => item.userId === user.id);
    if (!entry) {
      const accepted = window.confirm(
        `${user.firstName} ${user.lastName} non ha una prenotazione per oggi. Vuoi accettare comunque l'ingresso?`,
      );
      if (!accepted) return;
    }
    onRegister(user);
  }

  function stopScanner(updateState = true) {
    if (scannerFrameRef.current) {
      window.cancelAnimationFrame(scannerFrameRef.current);
      scannerFrameRef.current = null;
    }
    scanInProgressRef.current = false;
    lastScanAtRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (updateState) setScannerActive(false);
  }

  async function startScanner() {
    stopScanner(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage("Fotocamera non disponibile. Apri il gestionale da Chrome aggiornato e connessione HTTPS.");
      return;
    }

    try {
      setScannerMessage("Apertura fotocamera...");
      const cameraConstraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(cameraConstraints);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        await waitForVideoReady(videoRef.current);
      }

      const canvas = qrCanvasRef.current ?? document.createElement("canvas");
      qrCanvasRef.current = canvas;
      setScannerActive(true);
      setScannerMessage("Inquadra il QR al centro, con buona luce e tessera ferma.");

      const scan = async (timestamp: number) => {
        if (!videoRef.current || !streamRef.current) return;

        if (videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          scannerFrameRef.current = window.requestAnimationFrame(scan);
          return;
        }

        if (!scanInProgressRef.current && timestamp - lastScanAtRef.current > 120) {
          scanInProgressRef.current = true;
          lastScanAtRef.current = timestamp;
          try {
            const code = readQrFromVideo(videoRef.current, canvas);
            if (code) {
              selectFromQr(code);
              stopScanner();
              return;
            }
          } catch {
            setScannerMessage("Lettura QR non riuscita. Avvicina la tessera o usa il campo manuale.");
          } finally {
            scanInProgressRef.current = false;
          }
        }
        scannerFrameRef.current = window.requestAnimationFrame(scan);
      };

      scannerFrameRef.current = window.requestAnimationFrame(scan);
    } catch {
      setScannerMessage("Fotocamera non disponibile o permesso negato.");
      stopScanner();
    }
  }

  return (
    <section>
      <SectionHeader
        title="Nuovo ingresso"
        description="Leggi il QR della tessera, verifica la prenotazione e registra l'accesso effettivo."
      />
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1fr_360px]">
        <div className="rounded-md border-2 border-black bg-white p-4">
          <h2 className="text-xl font-bold">Scanner QR tessera</h2>
          <p className="mt-1 text-sm text-zinc-700">
            Il QR deve contenere il numero tessera, anche in formato CPG:NUMERO.
          </p>
          <div className="mt-4 overflow-hidden rounded-md border-2 border-black bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-video w-full bg-black object-cover"
            />
          </div>
          <p className="mt-3 rounded-md border-2 border-black bg-yellow-100 p-3 text-sm font-semibold">
            {scannerMessage}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={scannerActive ? () => stopScanner() : startScanner}
              className="h-12 rounded-md border-2 border-black bg-yellow-400 px-4 font-bold text-black hover:bg-yellow-300"
            >
              {scannerActive ? "Ferma scanner" : "Avvia scanner"}
            </button>
            <button
              type="button"
              onClick={() => {
                setManualQr("");
                setScannerMessage("Inserisci o scansiona una tessera.");
              }}
              className="h-12 rounded-md border-2 border-black bg-white px-4 font-bold text-black hover:bg-yellow-100"
            >
              Pulisci
            </button>
          </div>
          <label className="mt-4 block">
            <span className="text-sm font-bold">Tessera manuale</span>
            <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_120px]">
              <input
                value={manualQr}
                onChange={(event) => setManualQr(event.target.value)}
                className="h-12 rounded-md border-2 border-black px-3"
                placeholder="Numero tessera"
              />
              <button
                type="button"
                onClick={() => selectFromQr(manualQr)}
                className="h-12 rounded-md border-2 border-black bg-black px-4 font-bold text-white"
              >
                Cerca
              </button>
            </div>
          </label>
        </div>
        <div className="rounded-md border-2 border-black bg-white p-4">
          <label className="text-sm font-bold text-black" htmlFor="entry-search">
            Cerca persona
          </label>
          <input
            id="entry-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-2 h-12 w-full rounded-md border-2 border-black px-3 text-base"
            placeholder="Nome, cognome, tessera o telefono"
          />
          <div className="mt-4 grid gap-2">
            {results.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedId(user.id)}
                className={`rounded-md border p-3 text-left ${
                  selectedId === user.id ? "border-black bg-yellow-100" : "border-black bg-white"
                }`}
              >
                <span className="block font-bold">
                  {user.cardNumber} · {user.firstName} {user.lastName}
                </span>
                <span className="text-sm text-zinc-700">{user.phone || "Telefono non indicato"}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-md border-2 border-black bg-white p-4">
          <h2 className="text-xl font-bold">Persona selezionata</h2>
          {selected ? (
            <div className="mt-4 space-y-3">
              <p className="text-lg font-bold">
                {selected.firstName} {selected.lastName}
              </p>
              <p>Tessera {selected.cardNumber}</p>
              <p>Telefono {selected.phone || "-"}</p>
              <p>
                Stato oggi:{" "}
                {selectedEntry ? <Badge status={selectedEntry.status} /> : "Nessuna prenotazione"}
              </p>
              <button
                type="button"
                disabled={alreadyBooked}
                onClick={() => onBook(selected)}
                className="h-12 w-full rounded-md border-2 border-black bg-white text-base font-bold text-black hover:bg-yellow-100 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                Prenota per oggi
              </button>
              <button
                type="button"
                disabled={alreadyRegistered}
                onClick={() => confirmAndRegister(selected)}
                className="h-14 w-full rounded-md border-2 border-black bg-yellow-400 text-lg font-bold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {selectedEntry ? "Registra ingresso" : "Accetta senza prenotazione"}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-zinc-700">Seleziona una persona dai risultati.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function CalendarHistory({ users, entries }: { users: User[]; entries: DailyEntry[] }) {
  const [month, setMonth] = useState(currentMonthKey());
  const [selectedDate, setSelectedDate] = useState(today);
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const monthDays = useMemo(() => getMonthDays(month), [month]);
  const filteredUsers = useMemo(
    () => sortUsers(users.filter((user) => matchesUser(user, query))).slice(0, 10),
    [query, users],
  );
  const selectedDayEntries = entries.filter((entry) => entry.date === selectedDate);
  const selectedUser = users.find((user) => user.id === selectedUserId);
  const selectedUserHistory = selectedUser
    ? entries
        .filter((entry) => entry.userId === selectedUser.id)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  return (
    <section>
      <SectionHeader
        title="Calendario e storico"
        description="Consulta le prenotazioni per giorno e lo storico completo di ogni persona registrata."
      />
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-md border-2 border-black bg-white p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label>
              <span className="text-sm font-bold">Mese</span>
              <input
                type="month"
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                  setSelectedDate(`${event.target.value}-01`);
                }}
                className="mt-1 h-11 rounded-md border-2 border-black px-3"
              />
            </label>
            <div className="grid grid-cols-4 gap-2 text-sm sm:w-96">
              <Metric label="Pren." value={countStatus(selectedDayEntries, "Prenotato")} small />
              <Metric label="Pres." value={countStatus(selectedDayEntries, "Presente")} small />
              <Metric label="Ass." value={countStatus(selectedDayEntries, "Assente")} small />
              <Metric label="Extra" value={countStatus(selectedDayEntries, "Senza prenotazione")} small />
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthDays.map((day) => {
              const dayEntries = entries.filter((entry) => entry.date === day);
              const isSelected = day === selectedDate;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  className={`min-h-20 rounded-md border-2 border-black p-2 text-left transition ${
                    isSelected ? "bg-yellow-400" : "bg-white hover:bg-yellow-100"
                  }`}
                >
                  <span className="block text-sm font-bold">{day.slice(-2)}</span>
                  <span className="mt-2 block text-xs text-zinc-700">
                    {dayEntries.length ? `${dayEntries.length} mov.` : "-"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-5">
            <h2 className="mb-3 text-xl font-bold">{formatDateKey(selectedDate)}</h2>
            <ResponsiveTable
              headers={["Tessera", "Nome", "Cognome", "Stato", "Canale", "Ora"]}
              rows={selectedDayEntries
                .map((entry) => ({
                  entry,
                  user: users.find((user) => user.id === entry.userId),
                }))
                .filter((row): row is { entry: DailyEntry; user: User } => Boolean(row.user))
                .map(({ entry, user }) => [
                  user.cardNumber,
                  user.firstName,
                  user.lastName,
                  <Badge key="badge" status={entry.status} />,
                  channelLabel(entry.bookingChannel),
                  entry.entryTime || "-",
                ])}
            />
          </div>
        </div>

        <div className="rounded-md border-2 border-black bg-white p-4">
          <h2 className="text-xl font-bold">Storico persona</h2>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-3 h-12 w-full rounded-md border-2 border-black px-3"
            placeholder="Cerca nome, tessera o telefono"
          />
          <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto">
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedUserId(user.id)}
                className={`rounded-md border-2 border-black p-3 text-left ${
                  selectedUserId === user.id ? "bg-yellow-100" : "bg-white hover:bg-yellow-100"
                }`}
              >
                <span className="block font-bold">
                  {user.cardNumber} - {user.firstName} {user.lastName}
                </span>
                <span className="text-sm text-zinc-700">{user.phone || "Telefono non indicato"}</span>
              </button>
            ))}
          </div>
          {selectedUser ? (
            <div className="mt-5">
              <h3 className="font-bold">
                {selectedUser.firstName} {selectedUser.lastName}
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Metric label="Totale" value={selectedUserHistory.length} small />
                <Metric label="Presenze" value={countStatus(selectedUserHistory, "Presente")} small />
              </div>
              <div className="mt-4">
                <ResponsiveTable
                  headers={["Data", "Stato", "Canale", "Ora"]}
                  rows={selectedUserHistory.map((entry) => [
                    formatDateKey(entry.date),
                    <Badge key="badge" status={entry.status} />,
                    channelLabel(entry.bookingChannel),
                    entry.entryTime || "-",
                  ])}
                />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-zinc-700">Seleziona una persona per vedere lo storico.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Statistics({ users, entries }: { users: User[]; entries: DailyEntry[] }) {
  const bookedLike = entries.filter((entry) => entry.status === "Prenotato" || entry.status === "Presente");
  const present = countStatus(entries, "Presente");
  const absent = countStatus(entries, "Assente");
  const walkIns = countStatus(entries, "Senza prenotazione");
  const channels: { label: string; value: number }[] = [
    ["Manuale", entries.filter((entry) => entry.bookingChannel === "manuale").length],
    ["SMS", entries.filter((entry) => entry.bookingChannel === "sms").length],
    ["Telefono", entries.filter((entry) => entry.bookingChannel === "telefono").length],
  ].map(([label, value]) => ({ label: String(label), value: Number(value) }));
  const maxChannel = Math.max(1, ...channels.map((channel) => channel.value));
  const activeUsers = users.filter((user) => user.active).length;
  const dates = Array.from(new Set(entries.map((entry) => entry.date))).sort();
  const recentDates = dates.slice(-14);
  const topUsers = users
    .map((user) => ({
      user,
      entries: entries.filter((entry) => entry.userId === user.id),
    }))
    .filter((row) => row.entries.length > 0)
    .sort((a, b) => b.entries.length - a.entries.length)
    .slice(0, 8);

  return (
    <section>
      <SectionHeader
        title="Statistiche"
        description="Leggi andamento, presenze, assenze e canali di prenotazione sullo storico disponibile."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Utenti attivi" value={activeUsers} />
        <Metric label="Movimenti totali" value={entries.length} />
        <Metric label="Presenze" value={present} />
        <Metric label="Assenze" value={absent} />
        <Metric label="Tasso presenza" value={`${percent(present, bookedLike.length + absent)}%`} />
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <div className="rounded-md border-2 border-black bg-white p-4">
          <h2 className="text-xl font-bold">Canali di prenotazione</h2>
          <div className="mt-4 space-y-3">
            {channels.map((channel) => (
              <div key={channel.label}>
                <div className="mb-1 flex items-center justify-between text-sm font-bold">
                  <span>{channel.label}</span>
                  <span>{channel.value}</span>
                </div>
                <div className="h-4 rounded-md border-2 border-black bg-white">
                  <div
                    className="h-full bg-yellow-400"
                    style={{ width: `${Math.max(4, percent(channel.value, maxChannel))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-zinc-700">
            Ingressi senza prenotazione: {walkIns}
          </p>
        </div>
        <div className="rounded-md border-2 border-black bg-white p-4">
          <h2 className="text-xl font-bold">Andamento recente</h2>
          <ResponsiveTable
            headers={["Data", "Pren.", "Pres.", "Ass.", "Extra"]}
            rows={recentDates.map((date) => {
              const dayEntries = entries.filter((entry) => entry.date === date);
              return [
                formatDateKey(date),
                countStatus(dayEntries, "Prenotato"),
                countStatus(dayEntries, "Presente"),
                countStatus(dayEntries, "Assente"),
                countStatus(dayEntries, "Senza prenotazione"),
              ];
            })}
          />
        </div>
      </div>
      <div className="mt-6 rounded-md border-2 border-black bg-white p-4">
        <h2 className="mb-4 text-xl font-bold">Persone piu presenti nello storico</h2>
        <ResponsiveTable
          headers={["Tessera", "Nome", "Cognome", "Movimenti", "Presenze", "Assenze"]}
          rows={topUsers.map(({ user, entries: userEntries }) => [
            user.cardNumber,
            user.firstName,
            user.lastName,
            userEntries.length,
            countStatus(userEntries, "Presente"),
            countStatus(userEntries, "Assente"),
          ])}
        />
      </div>
    </section>
  );
}

function Communications({
  users,
  logs,
  onRefresh,
  refreshing = false,
}: {
  users: User[];
  logs: AppState["communicationLogs"];
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const [channel, setChannel] = useState<"all" | "sms" | "telefono">("all");
  const [status, setStatus] = useState("all");
  const gatewayLogs = logs.filter((log) => log.channel === "sms" || log.channel === "telefono");
  const statuses = Array.from(new Set(gatewayLogs.map((log) => log.status))).sort();
  const filtered = gatewayLogs.filter((log) => {
    if (channel !== "all" && log.channel !== channel) return false;
    if (status !== "all" && log.status !== status) return false;
    return true;
  });
  const confirmed = gatewayLogs.filter((log) => log.status === "prenotazione_confermata").length;
  const unknown = gatewayLogs.filter((log) => log.status === "numero_non_riconosciuto").length;
  const calls = gatewayLogs.filter((log) => log.channel === "telefono").length;
  const sms = gatewayLogs.filter((log) => log.channel === "sms").length;
  const latest = gatewayLogs[0];

  return (
    <section>
      <SectionHeader
        title="Gateway SMS e telefono"
        description="Controlla messaggi e chiamate ricevute dal telefono gateway, prenotazioni confermate e numeri non riconosciuti."
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Eventi gateway" value={gatewayLogs.length} />
        <Metric label="SMS" value={sms} />
        <Metric label="Telefonate" value={calls} />
        <Metric label="Confermate" value={confirmed} />
        <Metric label="Non riconosciuti" value={unknown} />
      </div>
      <div className="mb-5 rounded-md border-2 border-black bg-yellow-100 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-bold">Stato operativo</h2>
            <p className="mt-1 text-sm text-zinc-700">
              {latest
                ? `Ultimo evento: ${channelLabel(latest.channel)} da ${latest.phone || "numero non disponibile"}`
                : "Nessun evento gateway registrato."}
            </p>
          </div>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="h-12 rounded-md border-2 border-black bg-black px-5 font-bold text-white disabled:cursor-not-allowed disabled:bg-zinc-500"
            >
              {refreshing ? "Aggiorno..." : "Aggiorna dati"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[220px_260px_1fr]">
        <select
          value={channel}
          onChange={(event) => setChannel(event.target.value as typeof channel)}
          className="h-12 rounded-md border-2 border-black bg-white px-3"
        >
          <option value="all">Tutti i canali</option>
          <option value="sms">SMS</option>
          <option value="telefono">Telefono</option>
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-12 rounded-md border-2 border-black bg-white px-3"
        >
          <option value="all">Tutti gli stati</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Filtrati" value={filtered.length} small />
          <Metric label="Ok" value={confirmed} small />
          <Metric label="Non ric." value={unknown} small />
        </div>
      </div>
      <ResponsiveTable
        headers={["Data", "Canale", "Numero", "Persona", "Messaggio", "Stato"]}
        rows={filtered.map((log) => {
          const user = users.find((item) => item.id === log.userId);
          return [
            new Intl.DateTimeFormat("it-IT", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(log.createdAt)),
            channelLabel(log.channel),
            log.phone || "-",
            user ? `${user.cardNumber} - ${user.firstName} ${user.lastName}` : "-",
            log.body || "-",
            log.status,
          ];
        })}
      />
    </section>
  );
}

function UsersRegistry({
  users,
  onSave,
  onDelete,
  onToggleActive,
}: {
  users: User[];
  onSave: (user: Omit<User, "id">, editingId?: string) => boolean;
  onDelete: (userId: string) => void;
  onToggleActive: (userId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = sortUsers(
    users.filter((user) => {
      if (!matchesUser(user, query)) return false;
      if (filter === "active") return user.active;
      if (filter === "inactive") return !user.active;
      return true;
    }),
  );

  return (
    <section>
      <SectionHeader
        title="Anagrafica utenti"
        description="Gestisci dati anagrafici, stato attivo, note e numeri tessera univoci."
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px] lg:w-2/3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-12 rounded-md border-2 border-black bg-white px-3"
            placeholder="Cerca utenti"
          />
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
            className="h-12 rounded-md border-2 border-black bg-white px-3"
          >
            <option value="active">Utenti attivi</option>
            <option value="inactive">Utenti non attivi</option>
            <option value="all">Tutti gli utenti</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="h-12 rounded-md border-2 border-black bg-yellow-400 px-5 font-bold text-black hover:bg-yellow-300"
        >
          Nuovo utente
        </button>
      </div>
      <ResponsiveTable
        headers={["Tessera", "Nome", "Cognome", "Telefono", "Stato", "Note", "Azioni"]}
        rows={filtered.map((user) => [
          user.cardNumber,
          user.firstName,
          user.lastName,
          user.phone || "-",
          user.active ? "Attivo" : "Non attivo",
          user.notes || "-",
          <div key="actions" className="flex flex-wrap gap-2">
            <button className="h-10 rounded-md border-2 border-black bg-black px-3 font-semibold text-white" onClick={() => setEditing(user)}>
              Modifica
            </button>
            <button className="h-10 rounded-md border-2 border-black bg-yellow-400 px-3 font-semibold text-black hover:bg-yellow-300" onClick={() => onToggleActive(user.id)}>
              {user.active ? "Disattiva" : "Attiva"}
            </button>
            <button className="h-10 rounded-md border-2 border-black bg-white px-3 font-semibold text-black hover:bg-yellow-100" onClick={() => onDelete(user.id)}>
              Elimina
            </button>
          </div>,
        ])}
      />
      {creating || editing ? (
        <UserForm
          initial={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={(user) => {
            const ok = onSave(user, editing?.id);
            if (ok) {
              setCreating(false);
              setEditing(null);
            }
          }}
        />
      ) : null}
    </section>
  );
}

function UserForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: User;
  onSave: (user: Omit<User, "id">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<User, "id">>(initial ?? emptyUser);

  function update<K extends keyof Omit<User, "id">>(key: K, value: Omit<User, "id">[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.cardNumber || !form.firstName || !form.lastName) return;
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-2xl rounded-md border-2 border-black bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{initial ? "Modifica utente" : "Nuovo utente"}</h2>
          <button type="button" onClick={onClose} className="h-10 rounded-md border-2 border-black px-3 font-semibold hover:bg-yellow-100">
            Chiudi
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Numero tessera" value={form.cardNumber} onChange={(value) => update("cardNumber", value)} required />
          <Field label="Telefono" value={form.phone} onChange={(value) => update("phone", value)} />
          <Field label="Nome" value={form.firstName} onChange={(value) => update("firstName", value)} required />
          <Field label="Cognome" value={form.lastName} onChange={(value) => update("lastName", value)} required />
          <label className="flex items-center gap-3 rounded-md border-2 border-black p-3 font-semibold">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => update("active", event.target.checked)}
              className="h-5 w-5"
            />
            Utente attivo
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Note</span>
            <textarea
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
              className="mt-1 min-h-24 w-full rounded-md border-2 border-black p-3"
            />
          </label>
        </div>
        <button type="submit" className="mt-5 h-12 rounded-md border-2 border-black bg-yellow-400 px-5 font-bold text-black hover:bg-yellow-300">
          Salva utente
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      <span className="text-sm font-bold">{label}</span>
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-11 w-full rounded-md border-2 border-black px-3"
      />
    </label>
  );
}

function ImportPage({
  users,
  onApply,
}: {
  users: User[];
  onApply: (preview: ImportPreview, strategy: DuplicateStrategy) => ImportSummary;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");
  const [strategy, setStrategy] = useState<DuplicateStrategy>("ignore");
  const [dragging, setDragging] = useState(false);

  async function handleFile(file?: File) {
    if (!file) return;
    setError("");
    setSummary(null);
    try {
      const nextPreview = await parseImportFile(file, users);
      setPreview(nextPreview);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Errore durante la lettura del file.");
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  return (
    <section>
      <SectionHeader
        title="Importa da Excel"
        description="Carica file .xlsx, .xls o .csv fino a 5 MB e 2.000 righe. L'importazione viene confermata solo dopo l'anteprima."
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`grid min-h-48 place-items-center rounded-md border-2 border-dashed bg-white p-6 text-center ${
              dragging ? "border-black bg-yellow-100" : "border-black"
            }`}
          >
            <div>
              <p className="text-xl font-bold">Trascina qui il file</p>
              <p className="mt-1 text-zinc-700">oppure selezionalo dal computer</p>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="mt-4 h-12 rounded-md border-2 border-black bg-yellow-400 px-5 font-bold text-black hover:bg-yellow-300"
              >
                Seleziona file
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={onFileChange}
                className="hidden"
              />
            </div>
          </div>
          {error ? <p className="mt-3 rounded-md border-2 border-black bg-yellow-100 p-3 font-semibold text-black">{error}</p> : null}
          {preview ? (
            <ImportPreviewBlock
              preview={preview}
              strategy={strategy}
              setStrategy={setStrategy}
              onCancel={() => {
                setPreview(null);
                setSummary(null);
              }}
              onConfirm={() => setSummary(onApply(preview, strategy))}
            />
          ) : null}
        </div>
        <div className="rounded-md border-2 border-black bg-white p-4">
          <h2 className="text-xl font-bold">Modello Excel</h2>
          <p className="mt-2 text-zinc-700">Scarica un file già pronto con colonne corrette e due righe di esempio.</p>
          <button
            type="button"
            onClick={downloadTemplate}
            className="mt-4 h-12 w-full rounded-md border-2 border-black bg-black px-4 font-bold text-white"
          >
            Scarica modello Excel
          </button>
          {summary ? (
            <div className="mt-5 rounded-md border-2 border-black bg-yellow-100 p-4 text-black">
              <h3 className="font-bold">Riepilogo importazione</h3>
              <ul className="mt-2 space-y-1 text-sm">
                <li>Utenti importati: {summary.imported}</li>
                <li>Utenti aggiornati: {summary.updated}</li>
                <li>Duplicati ignorati: {summary.ignoredDuplicates}</li>
                <li>Righe scartate: {summary.discardedRows}</li>
                <li>Errori riscontrati: {summary.errors.length}</li>
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ImportPreviewBlock({
  preview,
  strategy,
  setStrategy,
  onConfirm,
  onCancel,
}: {
  preview: ImportPreview;
  strategy: DuplicateStrategy;
  setStrategy: (strategy: DuplicateStrategy) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const keys = Object.keys(preview.firstRows[0] ?? {});
  return (
    <div className="mt-5 rounded-md border-2 border-black bg-white p-4">
      <h2 className="text-xl font-bold">Anteprima importazione</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="File" value={preview.fileName} small />
        <Metric label="Righe totali" value={preview.totalRows} />
        <Metric label="Righe valide" value={preview.validRows} />
        <Metric label="Righe con errori" value={preview.errorRows} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <p className="rounded-md border-2 border-black bg-yellow-100 p-3 text-black">
          Numeri tessera duplicati nel file: {preview.duplicateCardNumbers.length || 0}
        </p>
        <p className="rounded-md border-2 border-black bg-white p-3 text-black">
          Utenti già presenti: {preview.existingCardNumbers.length || 0}
        </p>
      </div>
      {preview.existingCardNumbers.length ? (
        <div className="mt-4">
          <label className="text-sm font-bold">Gestione duplicati</label>
          <select
            value={strategy}
            onChange={(event) => setStrategy(event.target.value as DuplicateStrategy)}
            className="mt-1 h-12 w-full max-w-sm rounded-md border-2 border-black px-3"
          >
            <option value="ignore">Ignora</option>
            <option value="update">Aggiorna utente esistente</option>
            <option value="cancel">Annulla importazione</option>
          </select>
        </div>
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-md border-2 border-black">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-yellow-100">
            <tr>{keys.map((key) => <th key={key} className="px-3 py-2 text-left font-bold">{key}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {preview.firstRows.map((row, index) => (
              <tr key={`${index}-${JSON.stringify(row)}`}>
                {keys.map((key) => <td key={key} className="px-3 py-2">{row[key] || "-"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={onConfirm} className="h-12 rounded-md border-2 border-black bg-yellow-400 px-5 font-bold text-black hover:bg-yellow-300">
          Conferma importazione
        </button>
        <button type="button" onClick={onCancel} className="h-12 rounded-md border-2 border-black px-5 font-bold hover:bg-yellow-100">
          Annulla
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, small = false }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="rounded-md border-2 border-black bg-white p-3">
      <p className="text-xs font-bold uppercase text-zinc-700">{label}</p>
      <p className={small ? "mt-1 break-all text-sm font-bold" : "mt-1 text-2xl font-bold"}>{value}</p>
    </div>
  );
}

function Badge({ status }: { status: AttendanceStatus }) {
  return <span className={`inline-flex rounded-md px-2.5 py-1 text-sm font-bold ${statusClass(status)}`}>{status}</span>;
}

function ResponsiveTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number | React.ReactNode)[][];
}) {
  return (
    <div className="overflow-hidden rounded-md border-2 border-black bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
          <thead className="bg-yellow-100 text-black">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-bold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {rows.map((row, index) => (
              <tr key={index} className="align-top">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3">
                    <div className="min-w-max">{cell}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <p className="p-5 text-zinc-700">Nessun risultato disponibile.</p> : null}
    </div>
  );
}
