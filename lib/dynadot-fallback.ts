const DYNADOT_WHOIS_PAGE = 'https://www.dynadot.com/domain/whois';

export type DynadotFallbackResult =
  | {
      kind: 'ok';
      providerUrl: string;
      httpStatus: number;
      /** First bytes of HTML (Dynadot WHOIS UI is client-rendered; usually no record here). */
      rawHtmlPrefix: string;
    }
  | { kind: 'fetch_error'; providerUrl: string; message: string };

export function dynadotWhoisUrl(fqdn: string): string {
  const url = new URL(DYNADOT_WHOIS_PAGE);
  url.searchParams.set('domain', fqdn.toLowerCase());
  return url.toString();
}

/**
 * Uses [Dynadot WHOIS](https://www.dynadot.com/domain/whois) as a last-resort provider:
 * fetches the public page URL. Results are loaded in the browser, so HTML rarely contains
 * the record; callers should surface {@link dynadotWhoisUrl} for manual checks.
 */
export async function fetchDynadotWhoisPage(fqdn: string): Promise<DynadotFallbackResult> {
  const providerUrl = dynadotWhoisUrl(fqdn);
  try {
    const res = await fetch(providerUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; WhoisChecker/1.0) AppleWebKit/537.36',
      },
      redirect: 'follow',
    });
    const text = await res.text();
    return {
      kind: 'ok',
      providerUrl,
      httpStatus: res.status,
      rawHtmlPrefix: text.slice(0, 12000),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'fetch_error', providerUrl, message };
  }
}
