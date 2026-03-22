import dns from 'node:dns/promises';

/**
 * Best-effort signal: registered domains usually have NS (or A/AAAA) in DNS.
 * Used when WHOIS is flaky (.co, .me). Not authoritative — false negatives possible.
 */
export async function dnsSuggestsRegistered(fqdn: string): Promise<boolean> {
  const lower = fqdn.toLowerCase();
  try {
    await dns.resolveNs(lower);
    return true;
  } catch {
    /* continue */
  }
  try {
    await dns.resolve4(lower);
    return true;
  } catch {
    /* continue */
  }
  try {
    await dns.resolve6(lower);
    return true;
  } catch {
    return false;
  }
}
