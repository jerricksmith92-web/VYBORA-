-- VYBORA persistent notifications for likes and comments.
-- Run this entire file in Supabase Dashboard → SQL Editor → New query.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  type text not null check (type in ('like','comment')),
  comment_id uuid references public.post_comments(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_recipient_unread_idx on public.notifications(recipient_id, is_read);
alter table public.notifications enable row level security;
drop policy if exists "Users can read their notifications" on public.notifications;
create policy "Users can read their notifications" on public.notifications for select to authenticated using (auth.uid() = recipient_id);
drop policy if exists "Users can mark their notifications read" on public.notifications;
create policy "Users can mark their notifications read" on public.notifications for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

create or replace function public.vybora_notify_post_like()
returns trigger language plpgsql security definer set search_path = public
as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.posts where id = new.post_id;
  if owner_id is not null and owner_id <> new.user_id then
    insert into public.notifications(recipient_id, actor_id, post_id, type) values (owner_id, new.user_id, new.post_id, 'like');
  end if;
  return new;
end;
$$;
create or replace function public.vybora_notify_post_comment()
returns trigger language plpgsql security definer set search_path = public
as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.posts where id = new.post_id;
  if owner_id is not null and owner_id <> new.user_id then
    insert into public.notifications(recipient_id, actor_id, post_id, type, comment_id) values (owner_id, new.user_id, new.post_id, 'comment', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists vybora_post_like_notification on public.post_likes;
create trigger vybora_post_like_notification after insert on public.post_likes for each row execute function public.vybora_notify_post_like();
drop trigger if exists vybora_post_comment_notification on public.post_comments;
create trigger vybora_post_comment_notification after insert on public.post_comments for each row execute function public.vybora_notify_post_comment();

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null;
end $$;
