const ALIYUN_WHOIS_ORIGIN = 'https://whois.aliyun.com';

export function aliyunWhoisPageUrl(fqdn: string): string {
  return `${ALIYUN_WHOIS_ORIGIN}/domain/${encodeURIComponent(fqdn.toLowerCase())}`;
}

type AliyunSyncJson = {
  success?: boolean;
  errorMsg?: string;
  data?: unknown;
  [key: string]: unknown;
};

/**
 * Aliyun exposes WHOIS via `/whois/api_whois_sync` after browser captcha.
 * Without captcha tokens the API returns an error (e.g. 验证码不正确).
 * If the response ever succeeds, we map common string fields from `data`.
 */
export async function tryAliyunWhoisSyncApi(fqdn: string): Promise<{
  registrar?: string;
  createdDate?: string;
  expiresDate?: string;
  rawFragment?: string;
}> {
  const url = `${ALIYUN_WHOIS_ORIGIN}/whois/api_whois_sync?domainName=${encodeURIComponent(fqdn)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; WhoisChecker/1.0) AppleWebKit/537.36',
        Referer: aliyunWhoisPageUrl(fqdn),
      },
    });
    const json = (await res.json()) as AliyunSyncJson;
    if (!json.success || json.data == null) {
      return {};
    }
    const d = json.data as Record<string, unknown>;
    const pickStr = (...keys: string[]) => {
      for (const k of keys) {
        const v = d[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      return undefined;
    };
    const registrar = pickStr(
      'registrar',
      'registrarName',
      'sponsor',
      'registrar_name',
      'registrarNameZh'
    );
    const createdDate = pickStr(
      'registrationDate',
      'createDate',
      'creationDate',
      'gmtCreate',
      'registerDate'
    );
    const expiresDate = pickStr(
      'expirationDate',
      'expireDate',
      'expiryDate',
      'registryExpiryDate'
    );
    let rawFragment: string | undefined;
    try {
      rawFragment = JSON.stringify(d, null, 2).slice(0, 12000);
    } catch {
      rawFragment = undefined;
    }
    return { registrar, createdDate, expiresDate, rawFragment };
  } catch {
    return {};
  }
}
