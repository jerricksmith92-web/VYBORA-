-- VYBORA: enable video uploads and iPhone photo formats in an existing post-media bucket.
-- Run in Supabase Dashboard → SQL Editor → New query.
update storage.buckets
set public = true,
    file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif',
      'video/mp4','video/quicktime','video/webm','video/3gpp','video/x-m4v'
    ]
where id = 'post-media';

-- If the bucket does not exist yet, create it with the same supported media types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media', 'post-media', true, 52428800,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif','video/mp4','video/quicktime','video/webm','video/3gpp','video/x-m4v']
)
on conflict (id) do nothing;
