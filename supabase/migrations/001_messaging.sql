-- VYBORA messaging foundation
-- Run this script in Supabase SQL Editor for the project connected to the app.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text not null default 'VYBORA user',
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  constraint messages_no_self_message check (sender_id <> recipient_id)
);

create index if not exists messages_sender_created_idx
  on public.messages (sender_id, created_at desc);
create index if not exists messages_recipient_created_idx
  on public.messages (recipient_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.messages enable row level security;

-- Authenticated users can discover a profile by email to start a conversation.
-- Only minimal profile fields should be exposed by the client.
drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles"
  on public.profiles for select to authenticated using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Participants can read their messages" on public.messages;
create policy "Participants can read their messages"
  on public.messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "Users can send messages as themselves" on public.messages;
create policy "Users can send messages as themselves"
  on public.messages for insert to authenticated
  with check (auth.uid() = sender_id and sender_id <> recipient_id);

-- Automatically create a profile for each new signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'VYBORA user'), '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill profiles for accounts that already exist.
insert into public.profiles (id, email, display_name)
select id, email, coalesce(nullif(raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(email, 'VYBORA user'), '@', 1))
from auth.users
on conflict (id) do update set email = excluded.email;

-- Enable realtime updates for messages (safe if already added).
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then raise notice 'supabase_realtime publication not found; enable Realtime for public.messages in the dashboard.';
end $$;
