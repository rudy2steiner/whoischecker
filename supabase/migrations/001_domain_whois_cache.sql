-- Run in Supabase SQL editor (or `prisma db push` from prisma/schema.prisma).
create table if not exists public.domain_whois_cache (
  fqdn text primary key,
  domain_name text not null,
  tld text not null,
  status text not null check (status in ('available', 'unavailable', 'error')),
  registrar text,
  registered_at timestamptz,
  domain_expires_at timestamptz,
  payload jsonb not null,
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null,
  query_count integer not null default 0
);

create index if not exists domain_whois_cache_expires_at_idx
  on public.domain_whois_cache (expires_at);

create index if not exists domain_whois_cache_status_idx
  on public.domain_whois_cache (status);

create index if not exists domain_whois_cache_domain_expires_at_idx
  on public.domain_whois_cache (domain_expires_at);

comment on table public.domain_whois_cache is 'WHOIS/RDAP API response cache; TTL per status is set by the app.';
comment on column public.domain_whois_cache.domain_name is 'Registrable label without TLD (e.g. example for example.com).';
comment on column public.domain_whois_cache.registered_at is 'Registration/creation date from WHOIS when known.';
comment on column public.domain_whois_cache.domain_expires_at is 'Registry expiry when known (not API cache TTL).';
comment on column public.domain_whois_cache.query_count is 'Number of API lookups for this FQDN.';
