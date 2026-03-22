-- Denormalized domain fields for queries (run after 001).
alter table public.domain_whois_cache
  add column if not exists domain_name text not null default '';

update public.domain_whois_cache set domain_name = fqdn where domain_name = '';

alter table public.domain_whois_cache
  alter column domain_name drop default;

alter table public.domain_whois_cache
  add column if not exists registrar text,
  add column if not exists registered_at timestamptz,
  add column if not exists domain_expires_at timestamptz;

create index if not exists domain_whois_cache_status_idx
  on public.domain_whois_cache (status);

create index if not exists domain_whois_cache_domain_expires_at_idx
  on public.domain_whois_cache (domain_expires_at);

comment on column public.domain_whois_cache.domain_name is 'Registrable label without TLD (e.g. example for example.com).';
comment on column public.domain_whois_cache.registered_at is 'Registration/creation date from WHOIS when known.';
comment on column public.domain_whois_cache.domain_expires_at is 'Registry expiry when known (not API cache TTL).';
