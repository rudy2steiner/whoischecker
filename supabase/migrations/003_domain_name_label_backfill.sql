-- If domain_name was previously stored as full FQDN, strip `.tld` to match the new meaning (label only).
update public.domain_whois_cache
set domain_name = left(fqdn, length(fqdn) - length(tld) - 1)
where fqdn ilike '%.' || tld
  and length(fqdn) > length(tld) + 1;
