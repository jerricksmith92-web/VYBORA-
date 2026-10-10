-- VYBORA chat photo messages
-- Run this once in Supabase SQL Editor for the project connected to VYBORA.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_url text;

COMMENT ON COLUMN public.messages.media_url IS
  'Public URL of an optional photo attached to a chat message';
