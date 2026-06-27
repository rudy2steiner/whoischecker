/**
 * Best-effort signal: registered domains usually have NS (or A/AAAA) in DNS.
 * Used when WHOIS is flaky (.co, .me). Not authoritative — false negatives possible.
 *
 * Uses DNS-over-HTTPS (Cloudflare 1.1.1.1) instead of `node:dns`, so it runs on
 * the Cloudflare Workers runtime (where `node:dns` resolvers are unavailable).
 * @see https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/
 */

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

type DohAnswer = { name: string; type: number; TTL?: number; data: string };
type DohResponse = { Status: number; Answer?: DohAnswer[] };

/** Returns true when the DoH query yields at least one matching answer record. */
async function dohHasRecords(name: string, type: 'NS' | 'A' | 'AAAA'): Promise<boolean> {
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/dns-json' } });
    if (!res.ok) return false;
    const data = (await res.json()) as DohResponse;
    // Status 0 = NOERROR; an answer of the requested record type means it exists.
    return data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
  } catch {
    return false;
  }
}

export async function dnsSuggestsRegistered(fqdn: string): Promise<boolean> {
  const lower = fqdn.toLowerCase();
  if (await dohHasRecords(lower, 'NS')) return true;
  if (await dohHasRecords(lower, 'A')) return true;
  if (await dohHasRecords(lower, 'AAAA')) return true;
  return false;
}
