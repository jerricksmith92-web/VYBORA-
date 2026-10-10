-- VYBORA message read receipts and unread counts
-- Run once in Supabase SQL Editor if setting up another environment.
create table if not exists public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_reads enable row level security;
grant select, insert on public.message_reads to authenticated;

drop policy if exists "Members can read receipts in their conversations" on public.message_reads;
create policy "Members can read receipts in their conversations"
on public.message_reads for select to authenticated
using (exists (
  select 1 from public.messages m
  join public.conversation_members cm on cm.conversation_id = m.conversation_id
  where m.id = message_reads.message_id and cm.user_id = (select auth.uid())
));

drop policy if exists "Members can mark incoming messages read" on public.message_reads;
create policy "Members can mark incoming messages read"
on public.message_reads for insert to authenticated
with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.messages m
    join public.conversation_members cm on cm.conversation_id = m.conversation_id
    where m.id = message_reads.message_id
      and m.sender_id <> (select auth.uid())
      and cm.user_id = (select auth.uid())
  )
);

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reads') then
    alter publication supabase_realtime add table public.message_reads;
  end if;
end $$;
