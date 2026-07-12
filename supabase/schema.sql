create extension if not exists pgcrypto with schema extensions;

create table if not exists public.cpg_app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Change this PIN in production-like testing.
insert into public.cpg_app_config (key, value)
values ('access_pin_hash', extensions.crypt('cucina2026', extensions.gen_salt('bf')))
on conflict (key) do nothing;

-- Change this secret before wiring production providers.
insert into public.cpg_app_config (key, value)
values ('webhook_secret_hash', extensions.crypt('change-me-webhook-secret', extensions.gen_salt('bf')))
on conflict (key) do nothing;

create table if not exists public.cpg_users (
  id text primary key,
  card_number text not null unique,
  first_name text not null,
  last_name text not null,
  phone text not null default '',
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cpg_daily_entries (
  user_id text not null references public.cpg_users(id) on delete cascade,
  entry_date date not null,
  status text not null check (
    status in ('Prenotato', 'Presente', 'Assente', 'Senza prenotazione')
  ),
  entry_time text,
  booking_channel text check (
    booking_channel is null
    or booking_channel in ('manuale', 'sms', 'whatsapp', 'telefono')
  ),
  source_phone text,
  booked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);

alter table public.cpg_daily_entries
  add column if not exists booking_channel text check (
    booking_channel is null
    or booking_channel in ('manuale', 'sms', 'whatsapp', 'telefono')
  );

alter table public.cpg_daily_entries
  add column if not exists source_phone text;

alter table public.cpg_daily_entries
  add column if not exists booked_at timestamptz;

create table if not exists public.cpg_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.cpg_users(id) on delete cascade,
  channel text not null check (channel in ('sms', 'whatsapp', 'telefono')),
  phone_e164 text not null,
  enabled boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, phone_e164)
);

create table if not exists public.cpg_communication_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text references public.cpg_users(id) on delete set null,
  channel text not null check (channel in ('sms', 'whatsapp', 'telefono', 'manuale')),
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  phone_e164 text,
  body text,
  provider_message_id text,
  status text not null default 'ricevuto',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cpg_booking_settings (
  id smallint primary key default 1 check (id = 1),
  booking_window_days integer not null default 1 check (booking_window_days between 0 and 14),
  daily_capacity integer not null default 120 check (daily_capacity > 0),
  allow_waitlist boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.cpg_booking_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.cpg_waitlist (
  user_id text not null references public.cpg_users(id) on delete cascade,
  entry_date date not null,
  requested_channel text not null check (requested_channel in ('sms', 'whatsapp', 'telefono', 'manuale')),
  source_phone text,
  created_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);

alter table public.cpg_app_config enable row level security;
alter table public.cpg_users enable row level security;
alter table public.cpg_daily_entries enable row level security;
alter table public.cpg_contacts enable row level security;
alter table public.cpg_communication_logs enable row level security;
alter table public.cpg_booking_settings enable row level security;
alter table public.cpg_waitlist enable row level security;

revoke all on public.cpg_app_config from anon, authenticated;
revoke all on public.cpg_users from anon, authenticated;
revoke all on public.cpg_daily_entries from anon, authenticated;
revoke all on public.cpg_contacts from anon, authenticated;
revoke all on public.cpg_communication_logs from anon, authenticated;
revoke all on public.cpg_booking_settings from anon, authenticated;
revoke all on public.cpg_waitlist from anon, authenticated;

create or replace function public.cpg_pin_ok(p_pin text)
returns boolean
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    exists (
      select 1
      from public.cpg_app_config
      where key = 'access_pin_hash'
        and value = extensions.crypt(coalesce(p_pin, ''), value)
    ),
    false
  );
$$;

create or replace function public.cpg_webhook_secret_ok(p_secret text)
returns boolean
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    exists (
      select 1
      from public.cpg_app_config
      where key = 'webhook_secret_hash'
        and value = extensions.crypt(coalesce(p_secret, ''), value)
    ),
    false
  );
$$;

create or replace function public.cpg_get_state(p_pin text, p_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.cpg_pin_ok(p_pin) then
    raise exception 'PIN non valido' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'cardNumber', card_number,
        'firstName', first_name,
        'lastName', last_name,
        'phone', phone,
        'active', active,
        'notes', notes
      ) order by card_number)
      from public.cpg_users
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', user_id,
        'status', status,
        'entryTime', entry_time,
        'date', entry_date::text
      ) order by entry_date desc, user_id)
      from public.cpg_daily_entries
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.cpg_save_state(p_pin text, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.cpg_pin_ok(p_pin) then
    raise exception 'PIN non valido' using errcode = '28000';
  end if;

  delete from public.cpg_daily_entries;
  delete from public.cpg_users;

  insert into public.cpg_users (
    id, card_number, first_name, last_name, phone, active, notes, updated_at
  )
  select
    nullif(id, ''),
    nullif("cardNumber", ''),
    nullif("firstName", ''),
    nullif("lastName", ''),
    coalesce(phone, ''),
    coalesce(active, true),
    coalesce(notes, ''),
    now()
  from jsonb_to_recordset(coalesce(p_state->'users', '[]'::jsonb)) as x(
    id text,
    "cardNumber" text,
    "firstName" text,
    "lastName" text,
    phone text,
    active boolean,
    notes text
  );

  insert into public.cpg_daily_entries (
    user_id, entry_date, status, entry_time, updated_at
  )
  select
    "userId",
    coalesce(nullif(date, ''), current_date::text)::date,
    status,
    nullif("entryTime", ''),
    now()
  from jsonb_to_recordset(coalesce(p_state->'entries', '[]'::jsonb)) as x(
    "userId" text,
    status text,
    "entryTime" text,
    date text
  )
  where exists (select 1 from public.cpg_users u where u.id = x."userId");

  return public.cpg_get_state(p_pin, current_date);
end;
$$;

grant execute on function public.cpg_pin_ok(text) to anon, authenticated;
grant execute on function public.cpg_webhook_secret_ok(text) to anon, authenticated;
grant execute on function public.cpg_get_state(text, date) to anon, authenticated;
grant execute on function public.cpg_save_state(text, jsonb) to anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  cognome text,
  ruolo text not null default 'operatore' check (ruolo in ('admin', 'operatore')),
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create or replace function public.cpg_is_active_volunteer()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and attivo = true
  );
$$;

grant execute on function public.cpg_is_active_volunteer() to authenticated;

grant select, insert, update, delete on public.cpg_users to authenticated;
grant select, insert, update, delete on public.cpg_daily_entries to authenticated;
grant select, insert, update, delete on public.cpg_contacts to authenticated;
grant select, insert on public.cpg_communication_logs to authenticated;
grant select, update on public.cpg_booking_settings to authenticated;
grant select, insert, update, delete on public.cpg_waitlist to authenticated;

drop trigger if exists cpg_users_set_updated_at on public.cpg_users;
create trigger cpg_users_set_updated_at
before update on public.cpg_users
for each row execute function public.set_updated_at();

drop trigger if exists cpg_daily_entries_set_updated_at on public.cpg_daily_entries;
create trigger cpg_daily_entries_set_updated_at
before update on public.cpg_daily_entries
for each row execute function public.set_updated_at();

drop trigger if exists cpg_contacts_set_updated_at on public.cpg_contacts;
create trigger cpg_contacts_set_updated_at
before update on public.cpg_contacts
for each row execute function public.set_updated_at();

drop trigger if exists cpg_booking_settings_set_updated_at on public.cpg_booking_settings;
create trigger cpg_booking_settings_set_updated_at
before update on public.cpg_booking_settings
for each row execute function public.set_updated_at();

drop policy if exists "cpg_users_select_active_volunteers" on public.cpg_users;
create policy "cpg_users_select_active_volunteers"
on public.cpg_users
for select
to authenticated
using (public.cpg_is_active_volunteer());

drop policy if exists "cpg_users_insert_active_volunteers" on public.cpg_users;
create policy "cpg_users_insert_active_volunteers"
on public.cpg_users
for insert
to authenticated
with check (public.cpg_is_active_volunteer());

drop policy if exists "cpg_users_update_active_volunteers" on public.cpg_users;
create policy "cpg_users_update_active_volunteers"
on public.cpg_users
for update
to authenticated
using (public.cpg_is_active_volunteer())
with check (public.cpg_is_active_volunteer());

drop policy if exists "cpg_users_delete_active_volunteers" on public.cpg_users;
create policy "cpg_users_delete_active_volunteers"
on public.cpg_users
for delete
to authenticated
using (public.cpg_is_active_volunteer());

drop policy if exists "cpg_entries_select_active_volunteers" on public.cpg_daily_entries;
create policy "cpg_entries_select_active_volunteers"
on public.cpg_daily_entries
for select
to authenticated
using (public.cpg_is_active_volunteer());

drop policy if exists "cpg_entries_insert_active_volunteers" on public.cpg_daily_entries;
create policy "cpg_entries_insert_active_volunteers"
on public.cpg_daily_entries
for insert
to authenticated
with check (public.cpg_is_active_volunteer());

drop policy if exists "cpg_entries_update_active_volunteers" on public.cpg_daily_entries;
create policy "cpg_entries_update_active_volunteers"
on public.cpg_daily_entries
for update
to authenticated
using (public.cpg_is_active_volunteer())
with check (public.cpg_is_active_volunteer());

drop policy if exists "cpg_entries_delete_active_volunteers" on public.cpg_daily_entries;
create policy "cpg_entries_delete_active_volunteers"
on public.cpg_daily_entries
for delete
to authenticated
using (public.cpg_is_active_volunteer());

drop policy if exists "cpg_contacts_all_active_volunteers" on public.cpg_contacts;
create policy "cpg_contacts_all_active_volunteers"
on public.cpg_contacts
for all
to authenticated
using (public.cpg_is_active_volunteer())
with check (public.cpg_is_active_volunteer());

drop policy if exists "cpg_logs_select_active_volunteers" on public.cpg_communication_logs;
create policy "cpg_logs_select_active_volunteers"
on public.cpg_communication_logs
for select
to authenticated
using (public.cpg_is_active_volunteer());

drop policy if exists "cpg_logs_insert_active_volunteers" on public.cpg_communication_logs;
create policy "cpg_logs_insert_active_volunteers"
on public.cpg_communication_logs
for insert
to authenticated
with check (public.cpg_is_active_volunteer());

drop policy if exists "cpg_settings_select_active_volunteers" on public.cpg_booking_settings;
create policy "cpg_settings_select_active_volunteers"
on public.cpg_booking_settings
for select
to authenticated
using (public.cpg_is_active_volunteer());

drop policy if exists "cpg_settings_update_active_volunteers" on public.cpg_booking_settings;
create policy "cpg_settings_update_active_volunteers"
on public.cpg_booking_settings
for update
to authenticated
using (public.cpg_is_active_volunteer())
with check (public.cpg_is_active_volunteer());

drop policy if exists "cpg_waitlist_all_active_volunteers" on public.cpg_waitlist;
create policy "cpg_waitlist_all_active_volunteers"
on public.cpg_waitlist
for all
to authenticated
using (public.cpg_is_active_volunteer())
with check (public.cpg_is_active_volunteer());

create or replace function public.cpg_request_booking_by_phone(
  p_phone_e164 text,
  p_channel text,
  p_entry_date date default current_date,
  p_body text default null,
  p_provider_message_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_contact record;
  v_settings public.cpg_booking_settings%rowtype;
  v_booked_count integer;
  v_log_id uuid;
  v_waitlisted boolean := false;
begin
  if not public.cpg_is_active_volunteer() then
    raise exception 'Operatore non autorizzato' using errcode = '28000';
  end if;

  if p_channel not in ('sms', 'whatsapp', 'telefono') then
    raise exception 'Canale non valido' using errcode = '22023';
  end if;

  insert into public.cpg_communication_logs (
    channel, direction, phone_e164, body, provider_message_id, status
  )
  values (p_channel, 'inbound', p_phone_e164, p_body, p_provider_message_id, 'ricevuto')
  returning id into v_log_id;

  select c.*, u.active
  into v_contact
  from public.cpg_contacts c
  join public.cpg_users u on u.id = c.user_id
  where c.phone_e164 = p_phone_e164
    and c.channel = p_channel
    and c.enabled = true
  limit 1;

  if v_contact.user_id is null then
    update public.cpg_communication_logs
    set status = 'numero_non_riconosciuto',
        metadata = jsonb_build_object('entry_date', p_entry_date)
    where id = v_log_id;

    return jsonb_build_object(
      'ok', false,
      'code', 'numero_non_riconosciuto',
      'message', 'Numero non riconosciuto. Contatta un operatore o comunica il numero tessera.'
    );
  end if;

  if v_contact.active = false then
    update public.cpg_communication_logs
    set user_id = v_contact.user_id,
        status = 'utente_non_attivo',
        metadata = jsonb_build_object('entry_date', p_entry_date)
    where id = v_log_id;

    return jsonb_build_object(
      'ok', false,
      'code', 'utente_non_attivo',
      'message', 'Profilo non attivo. Contatta la Cucina Popolare.'
    );
  end if;

  select * into v_settings
  from public.cpg_booking_settings
  where id = 1;

  select count(*) into v_booked_count
  from public.cpg_daily_entries
  where entry_date = p_entry_date
    and status in ('Prenotato', 'Presente');

  if v_booked_count >= coalesce(v_settings.daily_capacity, 120) then
    if coalesce(v_settings.allow_waitlist, true) then
      insert into public.cpg_waitlist (
        user_id, entry_date, requested_channel, source_phone
      )
      values (v_contact.user_id, p_entry_date, p_channel, p_phone_e164)
      on conflict (user_id, entry_date) do nothing;

      v_waitlisted := true;
    end if;

    update public.cpg_communication_logs
    set user_id = v_contact.user_id,
        status = case when v_waitlisted then 'lista_attesa' else 'capienza_esaurita' end,
        metadata = jsonb_build_object('entry_date', p_entry_date)
    where id = v_log_id;

    return jsonb_build_object(
      'ok', false,
      'code', case when v_waitlisted then 'lista_attesa' else 'capienza_esaurita' end,
      'message', case when v_waitlisted then 'Posti esauriti: sei in lista di attesa.' else 'Posti esauriti.' end
    );
  end if;

  insert into public.cpg_daily_entries (
    user_id, entry_date, status, booking_channel, source_phone, booked_at, updated_at
  )
  values (
    v_contact.user_id, p_entry_date, 'Prenotato', p_channel, p_phone_e164, now(), now()
  )
  on conflict (user_id, entry_date) do update
  set status = case
        when public.cpg_daily_entries.status in ('Presente', 'Senza prenotazione')
        then public.cpg_daily_entries.status
        else excluded.status
      end,
      booking_channel = excluded.booking_channel,
      source_phone = excluded.source_phone,
      booked_at = coalesce(public.cpg_daily_entries.booked_at, excluded.booked_at),
      updated_at = now();

  update public.cpg_communication_logs
  set user_id = v_contact.user_id,
      status = 'prenotazione_confermata',
      metadata = jsonb_build_object('entry_date', p_entry_date)
  where id = v_log_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'prenotazione_confermata',
    'userId', v_contact.user_id,
    'date', p_entry_date,
    'message', 'Prenotazione confermata.'
  );
end;
$$;

grant execute on function public.cpg_request_booking_by_phone(text, text, date, text, text) to authenticated;

create or replace function public.cpg_request_booking_by_phone_webhook(
  p_secret text,
  p_phone_e164 text,
  p_channel text,
  p_entry_date date default current_date,
  p_body text default null,
  p_provider_message_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contact record;
  v_settings public.cpg_booking_settings%rowtype;
  v_booked_count integer;
  v_log_id uuid;
  v_waitlisted boolean := false;
begin
  if not public.cpg_webhook_secret_ok(p_secret) then
    raise exception 'Webhook non autorizzato' using errcode = '28000';
  end if;

  if p_channel not in ('sms', 'whatsapp', 'telefono') then
    raise exception 'Canale non valido' using errcode = '22023';
  end if;

  insert into public.cpg_communication_logs (
    channel, direction, phone_e164, body, provider_message_id, status
  )
  values (p_channel, 'inbound', p_phone_e164, p_body, p_provider_message_id, 'ricevuto')
  returning id into v_log_id;

  select c.*, u.active
  into v_contact
  from public.cpg_contacts c
  join public.cpg_users u on u.id = c.user_id
  where c.phone_e164 = p_phone_e164
    and c.channel = p_channel
    and c.enabled = true
  limit 1;

  if v_contact.user_id is null then
    update public.cpg_communication_logs
    set status = 'numero_non_riconosciuto',
        metadata = jsonb_build_object('entry_date', p_entry_date)
    where id = v_log_id;

    return jsonb_build_object(
      'ok', false,
      'code', 'numero_non_riconosciuto',
      'message', 'Numero non riconosciuto. Contatta un operatore o comunica il numero tessera.'
    );
  end if;

  if v_contact.active = false then
    update public.cpg_communication_logs
    set user_id = v_contact.user_id,
        status = 'utente_non_attivo',
        metadata = jsonb_build_object('entry_date', p_entry_date)
    where id = v_log_id;

    return jsonb_build_object(
      'ok', false,
      'code', 'utente_non_attivo',
      'message', 'Profilo non attivo. Contatta la Cucina Popolare.'
    );
  end if;

  select * into v_settings
  from public.cpg_booking_settings
  where id = 1;

  select count(*) into v_booked_count
  from public.cpg_daily_entries
  where entry_date = p_entry_date
    and status in ('Prenotato', 'Presente');

  if v_booked_count >= coalesce(v_settings.daily_capacity, 120) then
    if coalesce(v_settings.allow_waitlist, true) then
      insert into public.cpg_waitlist (
        user_id, entry_date, requested_channel, source_phone
      )
      values (v_contact.user_id, p_entry_date, p_channel, p_phone_e164)
      on conflict (user_id, entry_date) do nothing;

      v_waitlisted := true;
    end if;

    update public.cpg_communication_logs
    set user_id = v_contact.user_id,
        status = case when v_waitlisted then 'lista_attesa' else 'capienza_esaurita' end,
        metadata = jsonb_build_object('entry_date', p_entry_date)
    where id = v_log_id;

    return jsonb_build_object(
      'ok', false,
      'code', case when v_waitlisted then 'lista_attesa' else 'capienza_esaurita' end,
      'message', case when v_waitlisted then 'Posti esauriti: sei in lista di attesa.' else 'Posti esauriti.' end
    );
  end if;

  insert into public.cpg_daily_entries (
    user_id, entry_date, status, booking_channel, source_phone, booked_at, updated_at
  )
  values (
    v_contact.user_id, p_entry_date, 'Prenotato', p_channel, p_phone_e164, now(), now()
  )
  on conflict (user_id, entry_date) do update
  set status = case
        when public.cpg_daily_entries.status in ('Presente', 'Senza prenotazione')
        then public.cpg_daily_entries.status
        else excluded.status
      end,
      booking_channel = excluded.booking_channel,
      source_phone = excluded.source_phone,
      booked_at = coalesce(public.cpg_daily_entries.booked_at, excluded.booked_at),
      updated_at = now();

  update public.cpg_communication_logs
  set user_id = v_contact.user_id,
      status = 'prenotazione_confermata',
      metadata = jsonb_build_object('entry_date', p_entry_date)
  where id = v_log_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'prenotazione_confermata',
    'userId', v_contact.user_id,
    'date', p_entry_date,
    'message', 'Prenotazione confermata.'
  );
end;
$$;

grant execute on function public.cpg_request_booking_by_phone_webhook(text, text, text, date, text, text) to anon, authenticated;
