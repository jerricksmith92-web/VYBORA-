-- VYBORA: keep public profiles in sync with Supabase Auth.
-- Run this once in Supabase Dashboard > SQL Editor.

CREATE OR REPLACE FUNCTION public.create_profile_for_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  email_name text;
  safe_username text;
BEGIN
  email_name := split_part(COALESCE(NEW.email, 'vybora-user'), '@', 1);
  safe_username := regexp_replace(lower(email_name), '[^a-z0-9_]', '', 'g');

  IF safe_username = '' THEN
    safe_username := 'vybora';
  END IF;

  -- Add a short stable suffix so different accounts can use the same email prefix.
  safe_username := left(safe_username, 40) || '_' || left(replace(NEW.id::text, '-', ''), 6);

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    safe_username,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''), email_name, 'VYBORA user')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created_vybora_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_vybora_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.create_profile_for_new_auth_user();

-- Backfill accounts that were created before the trigger existed.
INSERT INTO public.profiles (id, username, display_name)
SELECT
  u.id,
  left(
    COALESCE(NULLIF(regexp_replace(lower(split_part(COALESCE(u.email, 'vybora-user'), '@', 1)), '[^a-z0-9_]', '', 'g'), ''), 'vybora'),
    40
  ) || '_' || left(replace(u.id::text, '-', ''), 6),
  COALESCE(
    NULLIF(u.raw_user_meta_data ->> 'display_name', ''),
    split_part(COALESCE(u.email, 'VYBORA user'), '@', 1)
  )
FROM auth.users AS u
LEFT JOIN public.profiles AS p ON p.id = u.id
WHERE p.id IS NULL;

-- Allow a signed-in user to create their own profile if one ever needs repair.
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
CREATE POLICY "Users can create their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);
