alter table public.domain_whois_cache
  add column if not exists query_count integer not null default 0;

comment on column public.domain_whois_cache.query_count is 'Number of API lookups for this FQDN.';
