import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppState, CommunicationLog, DailyEntry, User } from "@/types";

type CpgUserRow = {
  id: string;
  card_number: string;
  first_name: string;
  last_name: string;
  phone: string;
  active: boolean;
  notes: string;
};

type CpgEntryRow = {
  user_id: string;
  entry_date: string;
  status: DailyEntry["status"];
  entry_time: string | null;
  booking_channel: DailyEntry["bookingChannel"] | null;
  source_phone: string | null;
  booked_at: string | null;
};

type CpgCommunicationLogRow = {
  id: string;
  user_id: string | null;
  channel: CommunicationLog["channel"];
  direction: CommunicationLog["direction"];
  phone_e164: string | null;
  body: string | null;
  provider_message_id: string | null;
  status: string;
  created_at: string;
};

export function normalizePhoneForContact(phone: string) {
  const compact = phone.replace(/[\s().-]+/g, "").trim();
  if (!compact) return "";
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (compact.startsWith("0") || compact.startsWith("3")) return `+39${compact}`;
  return compact;
}

export async function loadOperationalState(
  supabase: SupabaseClient,
): Promise<AppState> {
  const [
    { data: users, error: usersError },
    { data: entries, error: entriesError },
    { data: communicationLogs, error: logsError },
  ] = await Promise.all([
      supabase
        .from("cpg_users")
        .select("id,card_number,first_name,last_name,phone,active,notes")
        .order("card_number", { ascending: true }),
      supabase
        .from("cpg_daily_entries")
        .select("user_id,entry_date,status,entry_time,booking_channel,source_phone,booked_at")
        .order("entry_date", { ascending: false }),
      supabase
        .from("cpg_communication_logs")
        .select("id,user_id,channel,direction,phone_e164,body,provider_message_id,status,created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  if (usersError) throw new Error(usersError.message);
  if (entriesError) throw new Error(entriesError.message);
  if (logsError) throw new Error(logsError.message);

  return {
    users: ((users ?? []) as CpgUserRow[]).map(fromUserRow),
    entries: ((entries ?? []) as CpgEntryRow[]).map(fromEntryRow),
    communicationLogs: ((communicationLogs ?? []) as CpgCommunicationLogRow[]).map(fromLogRow),
  };
}

export async function upsertOperationalUser(
  supabase: SupabaseClient,
  user: User,
) {
  const { error } = await supabase.from("cpg_users").upsert(toUserRow(user), {
    onConflict: "id",
  });
  if (error) throw new Error(error.message);

  const phone = normalizePhoneForContact(user.phone);
  if (!phone) return;

  const contacts = [
    { user_id: user.id, channel: "sms", phone_e164: phone, enabled: user.active },
    { user_id: user.id, channel: "telefono", phone_e164: phone, enabled: user.active },
  ];

  const { error: contactsError } = await supabase
    .from("cpg_contacts")
    .upsert(contacts, { onConflict: "channel,phone_e164" });

  if (contactsError) throw new Error(contactsError.message);
}

export async function deleteOperationalUser(
  supabase: SupabaseClient,
  userId: string,
) {
  const { error } = await supabase.from("cpg_users").delete().eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function upsertOperationalEntry(
  supabase: SupabaseClient,
  entry: DailyEntry,
) {
  const { error } = await supabase
    .from("cpg_daily_entries")
    .upsert(toEntryRow(entry), { onConflict: "user_id,entry_date" });

  if (error) throw new Error(error.message);
}

export async function upsertOperationalUsers(
  supabase: SupabaseClient,
  users: User[],
) {
  for (const user of users) {
    await upsertOperationalUser(supabase, user);
  }
}

function fromUserRow(row: CpgUserRow): User {
  return {
    id: row.id,
    cardNumber: row.card_number,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone ?? "",
    active: row.active,
    notes: row.notes ?? "",
  };
}

function fromEntryRow(row: CpgEntryRow): DailyEntry {
  return {
    userId: row.user_id,
    status: row.status,
    entryTime: row.entry_time ?? undefined,
    date: row.entry_date,
    bookingChannel: row.booking_channel ?? undefined,
    sourcePhone: row.source_phone ?? undefined,
    bookedAt: row.booked_at ?? undefined,
  };
}

function fromLogRow(row: CpgCommunicationLogRow): CommunicationLog {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    channel: row.channel,
    direction: row.direction,
    phone: row.phone_e164 ?? "",
    body: row.body ?? "",
    providerMessageId: row.provider_message_id ?? undefined,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toUserRow(user: User): CpgUserRow {
  return {
    id: user.id,
    card_number: user.cardNumber,
    first_name: user.firstName,
    last_name: user.lastName,
    phone: user.phone,
    active: user.active,
    notes: user.notes,
  };
}

function toEntryRow(entry: DailyEntry) {
  return {
    user_id: entry.userId,
    entry_date: entry.date,
    status: entry.status,
    entry_time: entry.entryTime ?? null,
    booking_channel: entry.bookingChannel ?? (entry.status === "Prenotato" ? "manuale" : null),
    source_phone: entry.sourcePhone ?? null,
    booked_at: entry.bookedAt ?? (entry.status === "Prenotato" ? new Date().toISOString() : null),
  };
}
