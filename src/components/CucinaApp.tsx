"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { createDemoState } from "@/data/demo-data";
import { currentTime, formatItalianDate, todayKey } from "@/lib/dates";
import { applyImport, downloadTemplate, parseImportFile } from "@/lib/excel";
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

type SectionId = "dashboard" | "prenotazioni" | "ingresso" | "utenti" | "importa";

const storageKey = "cucina-popolare-demo-state-v1";
const today = todayKey();

const sections: { id: SectionId; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "⌂" },
  { id: "prenotazioni", label: "Prenotazioni", icon: "✓" },
  { id: "ingresso", label: "Nuovo ingresso", icon: "+" },
  { id: "utenti", label: "Anagrafica", icon: "◉" },
  { id: "importa", label: "Importa Excel", icon: "⇩" },
];

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

export function CucinaApp({ volunteer }: { volunteer: AuthenticatedVolunteer }) {
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  const [state, setState] = useState<AppState>(() => createDemoState(today));
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const todayEntries = useMemo(
    () => state.entries.filter((entry) => entry.date === today),
    [state.entries],
  );

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (loaded) {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    }
  }, [loaded, state]);

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

  function setEntry(userId: string, status: AttendanceStatus, entryTime?: string) {
    commitState((previous) => {
      const existing = previous.entries.find(
        (entry) => entry.userId === userId && entry.date === today,
      );
      const nextEntry: DailyEntry = { userId, status, date: today, entryTime };
      return {
        ...previous,
        entries: existing
          ? previous.entries.map((entry) =>
              entry.userId === userId && entry.date === today ? nextEntry : entry,
            )
          : [...previous.entries, nextEntry],
      };
    });
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

  function upsertUser(formUser: Omit<User, "id">, editingId?: string) {
    const duplicated = state.users.some(
      (user) => user.cardNumber === formUser.cardNumber && user.id !== editingId,
    );
    if (duplicated) {
      showNotice("Numero tessera già presente. Inserisci un valore univoco.");
      return false;
    }
    commitState((previous) => ({
      ...previous,
      users: editingId
        ? previous.users.map((user) => (user.id === editingId ? { ...user, ...formUser } : user))
        : [...previous.users, { id: `u-${crypto.randomUUID()}`, ...formUser }],
    }));
    showNotice(editingId ? "Utente aggiornato." : "Nuovo utente creato.");
    return true;
  }

  function deleteUser(userId: string) {
    const confirmed = window.confirm("Confermi l'eliminazione dell'utente?");
    if (!confirmed) return;
    commitState((previous) => ({
      users: previous.users.filter((user) => user.id !== userId),
      entries: previous.entries.filter((entry) => entry.userId !== userId),
    }));
    showNotice("Utente eliminato.");
  }

  function deactivateUser(userId: string) {
    commitState((previous) => ({
      ...previous,
      users: previous.users.map((user) =>
        user.id === userId ? { ...user, active: !user.active } : user,
      ),
    }));
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
            {sections.map((section) => (
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
              </div>
              <UserMenu volunteer={volunteer} />
              <select
                value={activeSection}
                onChange={(event) => setActiveSection(event.target.value as SectionId)}
                className="h-12 rounded-md border-2 border-black bg-white px-3 text-base font-semibold md:hidden"
                aria-label="Menu sezioni"
              >
                {sections.map((section) => (
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
            {activeSection === "dashboard" ? (
              <Dashboard stats={stats} setActiveSection={setActiveSection} />
            ) : null}
            {activeSection === "prenotazioni" ? (
              <Bookings users={state.users} entries={todayEntries} onRegister={registerPresence} />
            ) : null}
            {activeSection === "ingresso" ? (
              <NewEntry users={state.users} entries={todayEntries} onRegister={registerWalkIn} />
            ) : null}
            {activeSection === "utenti" ? (
              <UsersRegistry
                users={state.users}
                onSave={upsertUser}
                onDelete={deleteUser}
                onToggleActive={deactivateUser}
              />
            ) : null}
            {activeSection === "importa" ? (
              <ImportPage
                users={state.users}
                onApply={(preview, strategy) => {
                  const result = applyImport(state.users, preview, strategy);
                  commitState((previous) => ({ ...previous, users: result.users }));
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

  return (
    <div className="flex items-center gap-3 rounded-md border-2 border-black bg-white px-3 py-2">
      <div className="hidden text-right sm:block">
        {fullName ? <p className="text-sm font-bold">{fullName}</p> : null}
        <p className="text-xs text-zinc-700">{volunteer.email}</p>
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
}: {
  stats: Record<string, number>;
  setActiveSection: (section: SectionId) => void;
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
        {sections.slice(1).map((section) => (
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
  onRegister,
}: {
  users: User[];
  entries: DailyEntry[];
  onRegister: (user: User) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const results = useMemo(
    () => sortUsers(users.filter((user) => user.active && matchesUser(user, query))).slice(0, 8),
    [query, users],
  );
  const selected = users.find((user) => user.id === selectedId);
  const selectedEntry = selected ? entries.find((entry) => entry.userId === selected.id) : undefined;
  const alreadyRegistered =
    selectedEntry?.status === "Presente" || selectedEntry?.status === "Senza prenotazione";

  return (
    <section>
      <SectionHeader
        title="Nuovo ingresso"
        description="Cerca per nome, cognome, numero tessera o telefono, poi registra l'ingresso."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
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
                disabled={alreadyRegistered}
                onClick={() => onRegister(selected)}
                className="h-14 w-full rounded-md border-2 border-black bg-yellow-400 text-lg font-bold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                Registra ingresso
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
