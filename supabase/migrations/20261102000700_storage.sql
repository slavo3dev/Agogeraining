-- Private evidence / progress-photo bucket. Only runs where Supabase Storage exists.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping bucket setup';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('private-evidence', 'private-evidence', false, 10485760, array['image/jpeg','image/png','video/mp4'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  -- Object path convention: <user_id>/<anything>. Owners only.
  execute $p$create policy "evidence_owner_select" on storage.objects for select to authenticated
    using (bucket_id = 'private-evidence' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy "evidence_owner_insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'private-evidence' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy "evidence_owner_delete" on storage.objects for delete to authenticated
    using (bucket_id = 'private-evidence' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end $$;
