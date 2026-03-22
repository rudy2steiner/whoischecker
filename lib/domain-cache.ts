import type { InputJsonValue, JsonValue } from '@prisma/client/runtime/library';
import { prisma } from '@/lib/prisma';

/** Fresh lookup response shape from `app/api/domain/route.ts` (subset for cache I/O). */
export type CachedDomainPayload = {
  status: 'available' | 'unavailable' | 'error';
  tld: string;
  registrar?: string;
  createdDate?: string;
  expiresDate?: string;
  error?: string;
  providerUrl?: string;
  lookupMethod?: string;
  whoisData?: {
    nameServers?: string[];
    rawText?: string;
    registrant?: unknown;
    admin?: unknown;
    tech?: unknown;
  };
};

export type CachedDomainResult = CachedDomainPayload & {
  cached: true;
  cacheExpiresAt: string;
};

function parseIntEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Parse WHOIS/RDAP date strings (often ISO or RFC-ish). */
export function parseWhoisDate(value: string | undefined): Date | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const t = Date.parse(String(value));
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

/** TTL (seconds) for each status; configurable via env. */
export function getCacheTtlSecondsForStatus(
  status: CachedDomainPayload['status']
): number {
  switch (status) {
    case 'unavailable':
      return parseIntEnv('DOMAIN_CACHE_TTL_UNAVAILABLE_SECONDS', 3600);
    case 'available':
      return parseIntEnv('DOMAIN_CACHE_TTL_AVAILABLE_SECONDS', 300);
    case 'error':
      return parseIntEnv('DOMAIN_CACHE_TTL_ERROR_SECONDS', 0);
    default:
      return 0;
  }
}

function stripCacheMeta(p: CachedDomainPayload): CachedDomainPayload {
  const copy = { ...p } as Record<string, unknown>;
  delete copy.cached;
  delete copy.cacheExpiresAt;
  return copy as CachedDomainPayload;
}

/** Ensure Prisma Json column only gets JSON-serializable data (no Date/functions/circular refs). */
function payloadToJsonInput(p: CachedDomainPayload): InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(p)) as InputJsonValue;
  } catch {
    return {
      status: p.status,
      tld: p.tld,
      error: 'payload_serialization_failed',
    } as InputJsonValue;
  }
}

function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function payloadFromJson(value: JsonValue): CachedDomainPayload | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as unknown as CachedDomainPayload;
}

function isLookupStatus(s: string): s is CachedDomainPayload['status'] {
  return s === 'available' || s === 'unavailable' || s === 'error';
}

/** Uses raw SQL so it still works if the generated client is stale (e.g. cnpm) and missing `queryCount`. */
async function bumpQueryCountColumn(fqdn: string): Promise<void> {
  const key = fqdn.toLowerCase();
  await prisma.$executeRaw`
    UPDATE domain_whois_cache
    SET query_count = query_count + 1
    WHERE fqdn = ${key}
  `;
}

/** Current persisted query counter for an FQDN (after increments in this request). */
export async function getDomainQueryCount(fqdn: string): Promise<number | undefined> {
  if (!hasDatabaseUrl()) return undefined;
  try {
    const key = fqdn.toLowerCase();
    const rows = await prisma.$queryRaw<{ query_count: number }[]>`
      SELECT query_count FROM domain_whois_cache WHERE fqdn = ${key} LIMIT 1
    `;
    const n = rows[0]?.query_count;
    return n === undefined ? undefined : Number(n);
  } catch {
    return undefined;
  }
}

/** Increment query count on cache hit (row must exist). */
export async function incrementDomainQueryCount(fqdn: string): Promise<void> {
  if (!hasDatabaseUrl()) return;
  try {
    await bumpQueryCountColumn(fqdn);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[domain-cache] queryCount increment failed:', msg);
  }
}

/**
 * When TTL is 0 we do not cache WHOIS payload, but we still count the lookup.
 * Updates an existing row or inserts a shell row with `expires_at` at epoch so `getCached` never returns it.
 */
export async function recordQueryCountWithoutCacheStore(
  fqdn: string,
  domainName: string,
  tld: string,
  result: CachedDomainPayload
): Promise<void> {
  if (!hasDatabaseUrl()) return;
  const key = fqdn.toLowerCase();
  const nameLabel = domainName.trim().toLowerCase();
  const payload = payloadToJsonInput(stripCacheMeta(result));
  const registeredAt = parseWhoisDate(result.createdDate);
  const domainExpiresAt = parseWhoisDate(result.expiresDate);

  try {
    const affected = await prisma.$executeRaw`
      UPDATE domain_whois_cache
      SET query_count = query_count + 1
      WHERE fqdn = ${key}
    `;
    if (affected > 0) return;

    await prisma.domainWhoisCache.create({
      data: {
        fqdn: key,
        domainName: nameLabel,
        tld: tld.toLowerCase(),
        status: result.status,
        registrar: result.registrar ?? null,
        registeredAt,
        domainExpiresAt,
        payload,
        expiresAt: new Date(0),
      },
    });
    await bumpQueryCountColumn(key);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code?: string }).code)
        : '';
    console.error('[domain-cache] queryCount record failed:', msg, code ? `code=${code}` : '', e);
  }
}

export async function getCachedDomainLookup(
  fqdn: string
): Promise<CachedDomainResult | null> {
  if (!hasDatabaseUrl()) return null;

  try {
    const row = await prisma.domainWhoisCache.findUnique({
      where: { fqdn: fqdn.toLowerCase() },
      select: {
        payload: true,
        expiresAt: true,
        status: true,
        registrar: true,
        registeredAt: true,
        domainExpiresAt: true,
      },
    });

    if (!row || row.expiresAt <= new Date()) return null;

    const payload = payloadFromJson(row.payload);
    if (!payload) return null;

    const status = isLookupStatus(row.status) ? row.status : payload.status;

    return {
      ...stripCacheMeta(payload),
      status,
      registrar: row.registrar ?? payload.registrar,
      createdDate:
        row.registeredAt?.toISOString() ?? payload.createdDate,
      expiresDate:
        row.domainExpiresAt?.toISOString() ?? payload.expiresDate,
      cached: true,
      cacheExpiresAt: row.expiresAt.toISOString(),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[domain-cache] read failed:', msg);
    return null;
  }
}

/**
 * @param domainName Label without TLD (same as request `domain`), e.g. `example` for `example.com`.
 */
export async function putCachedDomainLookup(
  fqdn: string,
  tld: string,
  result: CachedDomainPayload,
  domainName: string
): Promise<void> {
  const ttlSec = getCacheTtlSecondsForStatus(result.status);
  if (ttlSec <= 0) return;
  if (!hasDatabaseUrl()) return;

  const key = fqdn.toLowerCase();
  const nameLabel = domainName.trim().toLowerCase();
  const expiresAt = new Date(Date.now() + ttlSec * 1000);
  const payload = payloadToJsonInput(stripCacheMeta(result));
  const registeredAt = parseWhoisDate(result.createdDate);
  const domainExpiresAt = parseWhoisDate(result.expiresDate);

  try {
    await prisma.domainWhoisCache.upsert({
      where: { fqdn: key },
      create: {
        fqdn: key,
        domainName: nameLabel,
        tld: tld.toLowerCase(),
        status: result.status,
        registrar: result.registrar ?? null,
        registeredAt,
        domainExpiresAt,
        payload,
        expiresAt,
      },
      update: {
        domainName: nameLabel,
        tld: tld.toLowerCase(),
        status: result.status,
        registrar: result.registrar ?? null,
        registeredAt,
        domainExpiresAt,
        payload,
        cachedAt: new Date(),
        expiresAt,
      },
    });
    await bumpQueryCountColumn(key);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code?: string }).code)
        : '';
    console.error('[domain-cache] write failed:', msg, code ? `code=${code}` : '', e);
  }
}
