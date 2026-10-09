-- VYBORA conversation-based messaging setup
-- Run once in the Supabase SQL Editor for the project connected to the app.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages (conversation_id, created_at);

-- Securely start or reuse a one-to-one conversation.
CREATE OR REPLACE FUNCTION public.start_direct_conversation(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  conversation_uuid uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'You must sign in to start a conversation';
  END IF;

  IF other_user_id IS NULL OR other_user_id = current_user_id THEN
    RAISE EXCEPTION 'Choose another VYBORA user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p WHERE p.id = other_user_id
  ) THEN
    RAISE EXCEPTION 'That user profile was not found';
  END IF;

  SELECT c.id
    INTO conversation_uuid
  FROM public.conversations AS c
  JOIN public.conversation_members AS mine
    ON mine.conversation_id = c.id AND mine.user_id = current_user_id
  JOIN public.conversation_members AS theirs
    ON theirs.conversation_id = c.id AND theirs.user_id = other_user_id
  WHERE c.is_group = false
    AND (
      SELECT count(*)
      FROM public.conversation_members AS cm
      WHERE cm.conversation_id = c.id
    ) = 2
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF conversation_uuid IS NULL THEN
    INSERT INTO public.conversations (id, is_group, title)
    VALUES (gen_random_uuid(), false, '')
    RETURNING id INTO conversation_uuid;

    -- Only use columns confirmed by the existing app schema.
    INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES
      (conversation_uuid, current_user_id),
      (conversation_uuid, other_user_id);
  END IF;

  RETURN conversation_uuid;
END;
$function$;

REVOKE ALL ON FUNCTION public.start_direct_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_direct_conversation(uuid) TO authenticated;
