import { NextResponse } from 'next/server';
import whois from 'whois-parsed-v2';
import { lookupDomainRdap } from '@/lib/rdap-lookup';
import { dnsSuggestsRegistered } from '@/lib/dns-domain-hint';
import { fetchDynadotWhoisPage } from '@/lib/dynadot-fallback';
import {
  getCachedDomainLookup,
  getCacheTtlSecondsForStatus,
  getDomainQueryCount,
  incrementDomainQueryCount,
  putCachedDomainLookup,
  recordQueryCountWithoutCacheStore,
  type CachedDomainResult,
} from '@/lib/domain-cache';

/** Structured server logs to trace which TLD/FQDN resolved via which path (grep: `[whois-api]`). */
function logWhoisTrace(
  fqdn: string,
  tld: string,
  stage: string,
  detail: Record<string, unknown> = {}
) {
  console.log(
    `[whois-api] fqdn=${fqdn} tld=${tld} ${stage}`,
    JSON.stringify(detail)
  );
}

const MAX_LOG_RAW_TEXT = 4000;

/** Log full response payload for debugging; long `whoisData.rawText` is truncated. */
function logFinalResultContent(fqdn: string, tld: string, result: WhoisResponse) {
  const raw = result.whoisData?.rawText;
  const payload: Record<string, unknown> = {
    status: result.status,
    tld: result.tld,
    lookupMethod: result.lookupMethod,
    registrar: result.registrar,
    createdDate: result.createdDate,
    expiresDate: result.expiresDate,
    error: result.error,
    providerUrl: result.providerUrl,
    queryCount: result.queryCount,
    nameServerCount: result.whoisData?.nameServers?.length ?? 0,
    whoisDataRawText:
      raw === undefined
        ? undefined
        : raw.length <= MAX_LOG_RAW_TEXT
          ? raw
          : `${raw.slice(0, MAX_LOG_RAW_TEXT)}…[truncated ${raw.length - MAX_LOG_RAW_TEXT} chars]`,
  };
  console.log(
    `[whois-api] fqdn=${fqdn} tld=${tld} result_final_content`,
    JSON.stringify(payload)
  );
}

interface WhoisResponse {
  status: 'available' | 'unavailable' | 'error';
  tld: string;
  registrar?: string;
  createdDate?: string;
  expiresDate?: string;
  error?: string;
  /** Manual WHOIS on Dynadot when automated methods fail (see [Dynadot WHOIS](https://www.dynadot.com/domain/whois)). */
  providerUrl?: string;
  lookupMethod?: 'whois' | 'rdap' | 'dns-hint' | 'dynadot' | 'cache';
  whoisData?: {
    nameServers?: string[];
    rawText?: string;
    registrant?: any;
    admin?: any;
    tech?: any;
  };
  /** Present when served from Supabase cache (`DOMAIN_CACHE_TTL_*`). */
  cached?: boolean;
  cacheExpiresAt?: string;
  /** Total API lookups recorded for this FQDN (when DB is configured). */
  queryCount?: number;
}

function lookupMethodFromCache(
  cached: CachedDomainResult
): NonNullable<WhoisResponse['lookupMethod']> {
  const m = cached.lookupMethod;
  if (
    m === 'whois' ||
    m === 'rdap' ||
    m === 'dns-hint' ||
    m === 'dynadot' ||
    m === 'cache'
  ) {
    return m;
  }
  return 'cache';
}

/** @param fqdn Full hostname e.g. example.com */
async function queryDomain(fqdn: string, tld: string): Promise<WhoisResponse> {
  try {
    logWhoisTrace(fqdn, tld, 'primary_whois_start', {});
    const result = await whois.lookup(fqdn);
    if (result.isAvailable) {
      logWhoisTrace(fqdn, tld, 'primary_whois_success', {
        path: 'whois',
        status: 'available',
        isAvailable: true,
      });
      return {
        status: 'available',
        tld,
        lookupMethod: 'whois',
        whoisData: {
          rawText: result.raw,
        },
      };
    }

    logWhoisTrace(fqdn, tld, 'primary_whois_success', {
      path: 'whois',
      status: 'unavailable',
      isAvailable: false,
      hasRegistrar: Boolean(result.registrar),
      hasDates: Boolean(result.creationDate || result.expirationDate),
      nameServerCount: result.nameServers?.length ?? 0,
    });
    return {
      status: 'unavailable',
      tld,
      lookupMethod: 'whois',
      registrar: result.registrar || 'Unknown',
      createdDate: result.creationDate,
      expiresDate: result.expirationDate,
      whoisData: {
        nameServers: result.nameServers || [],
        rawText: result.raw,
        registrant: result.registrant,
        admin: result.admin,
        tech: result.tech,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('No match for domain') ||
      message.includes('Domain not found') ||
      message.includes('Status: AVAILABLE')
    ) {
      logWhoisTrace(fqdn, tld, 'primary_whois_success', {
        path: 'whois',
        status: 'available',
        via: 'error_message_available_hint',
      });
      return {
        status: 'available',
        tld,
        lookupMethod: 'whois',
        whoisData: { rawText: message },
      };
    }
    logWhoisTrace(fqdn, tld, 'primary_whois_failed', {
      errorPreview: message.slice(0, 200),
    });
    return {
      status: 'error',
      tld,
      error: message || 'Failed to check domain availability',
    };
  }
}

async function queryDomainWithFallback(fqdn: string, tld: string): Promise<WhoisResponse> {
  const primary = await queryDomain(fqdn, tld);
  if (primary.status !== 'error') {
    logWhoisTrace(fqdn, tld, 'result_final', {
      lookupMethod: primary.lookupMethod,
      status: primary.status,
      source: 'primary_only',
    });
    return primary;
  }

  const whoisErr = primary.error ?? 'WHOIS failed';
  logWhoisTrace(fqdn, tld, 'fallback_rdap_attempt', { afterPrimaryError: true });

  const rdap = await lookupDomainRdap(fqdn, tld);
  logWhoisTrace(fqdn, tld, 'fallback_rdap_done', { kind: rdap.kind });

  if (rdap.kind === 'available') {
    logWhoisTrace(fqdn, tld, 'result_final', {
      lookupMethod: 'rdap',
      status: 'available',
      source: 'fallback_rdap',
    });
    return {
      status: 'available',
      tld,
      lookupMethod: 'rdap',
      whoisData: {
        rawText: `[Fallback after WHOIS error: ${whoisErr}]\n${rdap.rawText}`,
      },
    };
  }
  if (rdap.kind === 'registered') {
    logWhoisTrace(fqdn, tld, 'result_final', {
      lookupMethod: 'rdap',
      status: 'unavailable',
      source: 'fallback_rdap',
      hasRegistrar: Boolean(rdap.registrar),
    });
    return {
      status: 'unavailable',
      tld,
      lookupMethod: 'rdap',
      registrar: rdap.registrar || 'Unknown',
      createdDate: rdap.createdDate,
      expiresDate: rdap.expiresDate,
      whoisData: {
        nameServers: rdap.nameServers,
        rawText: `[Fallback after WHOIS error: ${whoisErr}]\n${rdap.rawText}`,
        registrant: rdap.registrant,
      },
    };
  }

  logWhoisTrace(fqdn, tld, 'fallback_dns_hint_attempt', { rdapError: rdap.message });

  try {
    const likelyRegistered = await dnsSuggestsRegistered(fqdn);
    logWhoisTrace(fqdn, tld, 'fallback_dns_hint_done', { likelyRegistered });
    if (likelyRegistered) {
      logWhoisTrace(fqdn, tld, 'result_final', {
        lookupMethod: 'dns-hint',
        status: 'unavailable',
        source: 'fallback_dns',
      });
      return {
        status: 'unavailable',
        tld,
        lookupMethod: 'dns-hint',
        registrar: 'Unknown',
        error: `WHOIS & RDAP failed (${whoisErr}; ${rdap.message}). DNS has NS/A/AAAA — likely registered.`,
        whoisData: { rawText: whoisErr },
      };
    }
  } catch {
    logWhoisTrace(fqdn, tld, 'fallback_dns_hint_done', { error: 'dns_lookup_threw' });
  }

  logWhoisTrace(fqdn, tld, 'fallback_dynadot_attempt', {});
  const dyn = await fetchDynadotWhoisPage(fqdn);
  if (dyn.kind === 'fetch_error') {
    logWhoisTrace(fqdn, tld, 'result_final', {
      lookupMethod: 'dynadot',
      status: 'error',
      source: 'fallback_dynadot_fetch_failed',
    });
    return {
      status: 'error',
      tld,
      lookupMethod: 'dynadot',
      providerUrl: dyn.providerUrl,
      error: `WHOIS: ${whoisErr}. RDAP: ${rdap.message}. DNS: no NS/A/AAAA. Dynadot page fetch failed: ${dyn.message}`,
    };
  }

  logWhoisTrace(fqdn, tld, 'result_final', {
    lookupMethod: 'dynadot',
    status: 'error',
    source: 'fallback_dynadot_page',
    dynadotHttpStatus: dyn.httpStatus,
  });
  return {
    status: 'error',
    tld,
    lookupMethod: 'dynadot',
    providerUrl: dyn.providerUrl,
    error: `WHOIS: ${whoisErr}. RDAP: ${rdap.message}. DNS: no NS/A/AAAA. Open providerUrl for Dynadot WHOIS (UI is client-rendered; HTML may not include the record).`,
    whoisData: {
      rawText:
        `[Dynadot HTTP ${dyn.httpStatus}]\n` +
        dyn.rawHtmlPrefix.slice(0, 8000),
    },
  };
}

export async function POST(request: Request) {
  try {
    const { domain, tld } = await request.json();

    if (!domain || !tld) {
      return NextResponse.json({ error: 'Domain and TLD are required' }, { status: 400 });
    }

    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]$/;
    if (!domainRegex.test(domain)) {
      return NextResponse.json({ error: 'Invalid domain name format' }, { status: 400 });
    }

    const fqdn = `${domain}.${tld}`;
    logWhoisTrace(fqdn, tld, 'request', { domainLabel: domain });

    const cached = await getCachedDomainLookup(fqdn);
    if (cached) {
      await incrementDomainQueryCount(fqdn);
      const queryCount = await getDomainQueryCount(fqdn);
      const result: WhoisResponse = {
        ...cached,
        lookupMethod: lookupMethodFromCache(cached),
        ...(queryCount !== undefined ? { queryCount } : {}),
      };
      logWhoisTrace(fqdn, tld, 'cache_hit', {
        status: result.status,
        cacheExpiresAt: result.cacheExpiresAt,
        queryCount: result.queryCount,
      });
      logWhoisTrace(fqdn, tld, 'response_sent', {
        status: result.status,
        lookupMethod: result.lookupMethod,
        hasProviderUrl: Boolean(result.providerUrl),
        fromCache: true,
        queryCount: result.queryCount,
      });
      logFinalResultContent(fqdn, tld, result);
      return NextResponse.json(result);
    }

    const result = await queryDomainWithFallback(fqdn, tld);
    const ttlSec = getCacheTtlSecondsForStatus(result.status);
    if (ttlSec > 0) {
      await putCachedDomainLookup(fqdn, tld, result, domain);
    } else {
      await recordQueryCountWithoutCacheStore(fqdn, domain, tld, result);
    }

    const queryCount = await getDomainQueryCount(fqdn);
    const withCount: WhoisResponse = {
      ...result,
      ...(queryCount !== undefined ? { queryCount } : {}),
    };

    logWhoisTrace(fqdn, tld, 'response_sent', {
      status: withCount.status,
      lookupMethod: withCount.lookupMethod,
      hasProviderUrl: Boolean(withCount.providerUrl),
      queryCount: withCount.queryCount,
    });
    logFinalResultContent(fqdn, tld, withCount);
    return NextResponse.json(withCount);
  } catch (error) {
    console.error('Domain check error:', error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        status: 'error',
        error: 'Failed to check domain availability',
        details,
      },
      { status: 500 }
    );
  }
}
