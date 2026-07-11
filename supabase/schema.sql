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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);

alter table public.cpg_app_config enable row level security;
alter table public.cpg_users enable row level security;
alter table public.cpg_daily_entries enable row level security;

revoke all on public.cpg_app_config from anon, authenticated;
revoke all on public.cpg_users from anon, authenticated;
revoke all on public.cpg_daily_entries from anon, authenticated;

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
grant execute on function public.cpg_get_state(text, date) to anon, authenticated;
grant execute on function public.cpg_save_state(text, jsonb) to anon, authenticated;
