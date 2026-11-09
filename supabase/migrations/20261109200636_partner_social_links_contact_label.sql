alter table public.movi_partners
  add column instagram_url text
    check (instagram_url is null or (length(instagram_url) <= 2000 and instagram_url ~ '^https://[^[:space:]\\]+$')),
  add column facebook_url text
    check (facebook_url is null or (length(facebook_url) <= 2000 and facebook_url ~ '^https://[^[:space:]\\]+$')),
  add column contact_label text
    check (contact_label is null or (
      length(contact_label) between 1 and 60
      and contact_label = btrim(contact_label)
      and contact_label !~ '[[:cntrl:]<>]'
    ));
