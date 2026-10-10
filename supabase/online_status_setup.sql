-- VYBORA online status and last seen
-- Run this in Supabase SQL Editor before deploying the matching frontend update.

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

create or replace function public.vybora_update_last_seen()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_time timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set last_seen_at = updated_time
  where id = auth.uid();

  return updated_time;
end;
$$;

revoke all on function public.vybora_update_last_seen() from public;
grant execute on function public.vybora_update_last_seen() to authenticated;
