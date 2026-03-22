/**
 * RDAP (Registration Data Access Protocol) lookups — more reliable than port-43 WHOIS
 * for many gTLDs (.dev, .app, .info, etc.). Uses IANA bootstrap to find the correct server.
 * @see https://www.icann.org/rdap
 */

const IANA_DNS_BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';

type BootstrapServices = {
  services: [string[], string[]][];
};

let bootstrapCache: { services: BootstrapServices['services']; fetchedAt: number } | null =
  null;
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;

/** Well-known RDAP bases when bootstrap is slow/unavailable (subset of IANA dns.json). */
const RDAP_BASE_FALLBACK: Record<string, string> = {
  app: 'https://pubapi.registry.google/rdap/',
  dev: 'https://pubapi.registry.google/rdap/',
  info: 'https://rdap.identitydigital.services/rdap/',
};

async function loadBootstrap(): Promise<BootstrapServices['services']> {
  const now = Date.now();
  if (bootstrapCache && now - bootstrapCache.fetchedAt < BOOTSTRAP_TTL_MS) {
    return bootstrapCache.services;
  }
  const res = await fetch(IANA_DNS_BOOTSTRAP, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(`IANA RDAP bootstrap HTTP ${res.status}`);
  }
  const data = (await res.json()) as BootstrapServices;
  bootstrapCache = { services: data.services, fetchedAt: now };
  return data.services;
}

/**
 * Longest suffix match for TLD (RFC 7484 style).
 */
export function resolveRdapBaseUrl(tld: string, services: BootstrapServices['services']): string | null {
  const lower = tld.toLowerCase();
  let best: { len: number; url: string } | null = null;
  for (const [tlds, urls] of services) {
    for (const label of tlds) {
      if (label.toLowerCase() === lower) {
        const u = urls[0];
        if (u && (!best || label.length > best.len)) {
          best = { len: label.length, url: u };
        }
      }
    }
  }
  return best?.url ?? null;
}

function normalizeBaseUrl(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}

function domainLookupUrl(base: string, fqdn: string): string {
  return `${normalizeBaseUrl(base)}domain/${encodeURIComponent(fqdn.toLowerCase())}`;
}

function extractVcardFn(vcardArray: unknown): string | undefined {
  if (!Array.isArray(vcardArray) || vcardArray[1] === undefined) return;
  const rows = vcardArray[1] as unknown[];
  for (const row of rows) {
    if (Array.isArray(row) && row[0] === 'fn' && typeof row[3] === 'string') {
      return row[3];
    }
  }
  return undefined;
}

function extractRegistrar(entities: unknown[] | undefined): string | undefined {
  if (!Array.isArray(entities)) return;
  for (const e of entities) {
    if (!e || typeof e !== 'object') continue;
    const ent = e as { roles?: string[]; vcardArray?: unknown; handle?: string };
    if (ent.roles?.includes('registrar')) {
      const fn = extractVcardFn(ent.vcardArray);
      if (fn) return fn;
      if (typeof ent.handle === 'string') return ent.handle;
    }
    if (Array.isArray((e as { entities?: unknown[] }).entities)) {
      const nested = extractRegistrar((e as { entities: unknown[] }).entities);
      if (nested) return nested;
    }
  }
  return undefined;
}

function extractDates(events: Array<{ eventAction?: string; eventDate?: string }> | undefined) {
  let createdDate: string | undefined;
  let expiresDate: string | undefined;
  if (!Array.isArray(events)) return { createdDate, expiresDate };
  for (const ev of events) {
    const a = (ev.eventAction || '').toLowerCase();
    if (a === 'registration' && ev.eventDate) createdDate = ev.eventDate;
    if ((a === 'expiration' || a === 'registration expiration' || a === 'expiry') && ev.eventDate) {
      expiresDate = ev.eventDate;
    }
  }
  return { createdDate, expiresDate };
}

export type RdapLookupResult =
  | { kind: 'available'; rawText: string }
  | {
      kind: 'registered';
      registrar?: string;
      createdDate?: string;
      expiresDate?: string;
      nameServers: string[];
      rawText: string;
      registrant?: unknown;
    }
  | { kind: 'error'; message: string };

export async function lookupDomainRdap(fqdn: string, tld: string): Promise<RdapLookupResult> {
  const lowerTld = tld.toLowerCase();
  let baseUrl: string | null = RDAP_BASE_FALLBACK[lowerTld] ?? null;

  try {
    const services = await loadBootstrap();
    baseUrl = resolveRdapBaseUrl(lowerTld, services) ?? baseUrl;
  } catch {
    /* use fallback only */
  }

  if (!baseUrl) {
    baseUrl = 'https://rdap.org/';
  }

  const url = domainLookupUrl(baseUrl, fqdn);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/rdap+json, application/json' },
      redirect: 'follow',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: `RDAP fetch failed: ${msg}` };
  }

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { kind: 'error', message: `RDAP invalid JSON (HTTP ${res.status})` };
  }

  const errCode = typeof data.errorCode === 'number' ? data.errorCode : null;
  if (res.status === 404 || errCode === 404) {
    return {
      kind: 'available',
      rawText: text.slice(0, 8000),
    };
  }

  if (!res.ok) {
    return { kind: 'error', message: `RDAP HTTP ${res.status}` };
  }

  if (data.objectClassName === 'error' && errCode === 404) {
    return { kind: 'available', rawText: text.slice(0, 8000) };
  }

  if (data.objectClassName === 'domain') {
    const events = data.events as Array<{ eventAction?: string; eventDate?: string }> | undefined;
    const { createdDate, expiresDate } = extractDates(events);
    const ns = (data.nameservers as Array<{ ldhName?: string }> | undefined)?.map(
      (n) => n.ldhName || ''
    ).filter(Boolean) ?? [];
    const registrar = extractRegistrar(data.entities as unknown[] | undefined);
    return {
      kind: 'registered',
      registrar,
      createdDate,
      expiresDate,
      nameServers: ns,
      rawText: JSON.stringify(data, null, 2),
    };
  }

  return {
    kind: 'error',
    message: `RDAP unexpected response (objectClassName=${String(data.objectClassName)})`,
  };
}
