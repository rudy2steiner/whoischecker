'use client';

import { useMemo, useState } from 'react';
import brands from '@/lib/data/millionaire-domains.json';

type Brand = (typeof brands)[number];
type SortMode = 'rank' | 'rank-desc' | 'value' | 'name';

const seoCopy = {
  en: {
    heroTitle: 'The world’s most valuable brand domains',
    heroDescription: 'Explore primary domains, industries, countries, and logos from the Brand Finance Global 500.',
    stats: ['Brands', 'Domains', 'Logos', 'Needs review'],
    filtersLabel: 'Brand filters',
    searchPlaceholder: 'Search brands, domains, countries, or industries',
    countryLabel: 'Country or region',
    allCountries: 'All countries/regions',
    sectorLabel: 'Industry',
    allSectors: 'All industries',
    statusLabel: 'Status',
    allStatuses: 'All statuses',
    verified: 'Verified',
    needsReview: 'Needs review',
    sortLabel: 'Sort',
    sortRankAsc: 'Rank: low to high',
    sortRankDesc: 'Rank: high to low',
    sortValue: 'Brand value',
    sortName: 'Name A–Z',
    reset: 'Clear filters',
    resultSuffix: 'results',
    resultHint: 'Select a brand to view details',
    empty: 'No matching results',
    rank: 'RANK',
    close: 'Close',
    primaryDomain: 'Primary domain',
    country: 'Country/region',
    sector: 'Industry',
    brandValue: 'Brand value',
    status: 'Status',
    eyebrow: 'Domain value guide',
    title: 'What makes a domain name valuable?',
    intro: 'The strongest brand domains are short, memorable, easy to spell, and closely aligned with the company name. This directory connects the Brand Finance Global 500 ranking with each brand’s primary domain so you can study how leading companies establish trust online.',
    sections: [
      ['Brand value vs. domain sale price', 'The values shown here are Brand Finance brand valuations, not verified domain transaction prices. A valuable brand can make its matching domain strategically important, but that does not mean the domain itself sold for the same amount.'],
      ['Why premium domain names matter', 'A clear, authoritative domain reduces confusion, supports direct navigation, and protects brand recognition. Exact-match .com domains are common among global leaders, although a strong brand can also succeed on country-code and newer extensions.'],
      ['How to research a domain', 'Use the directory to identify the official website, then run a WHOIS or RDAP lookup to check registration details, registrar information, and domain status. Ownership information may be privacy protected.'],
    ],
    faqTitle: 'Frequently asked questions',
    faqs: [
      ['What are the most valuable domain names?', 'There is no single definitive ranking because domain sale prices and brand valuations measure different things. This directory focuses on the primary domains used by the world’s 500 most valuable brands.'],
      ['Are these million-dollar domain sale prices?', 'No. The monetary figures are brand valuations published by Brand Finance. They are not domain appraisal estimates or historical domain sale prices.'],
      ['What makes a domain name premium?', 'Premium domain names are typically concise, memorable, easy to type, commercially relevant, and built on a trusted extension. Search demand and buyer intent can also affect market value.'],
      ['How can I find out who owns a domain?', 'Run a WHOIS or RDAP lookup for the domain. The result can show registrar and registration data, although personal ownership details may be hidden by privacy services.'],
    ],
  },
  zh: {
    heroTitle: '全球最具价值品牌域名',
    heroDescription: '交互浏览 Brand Finance Global 500 品牌主域名、行业、国家与 Logo。',
    stats: ['品牌', '域名', 'Logo', '待复核'],
    filtersLabel: '品牌筛选',
    searchPlaceholder: '搜索品牌、域名、国家或行业',
    countryLabel: '国家或地区',
    allCountries: '全部国家/地区',
    sectorLabel: '行业',
    allSectors: '全部行业',
    statusLabel: '状态',
    allStatuses: '全部状态',
    verified: '已匹配',
    needsReview: '待复核',
    sortLabel: '排序',
    sortRankAsc: '排名升序',
    sortRankDesc: '排名降序',
    sortValue: '品牌价值',
    sortName: '名称 A–Z',
    reset: '清除筛选',
    resultSuffix: '个结果',
    resultHint: '点击品牌查看详情',
    empty: '没有匹配结果',
    rank: '排名',
    close: '关闭',
    primaryDomain: '主域名',
    country: '国家/地区',
    sector: '行业',
    brandValue: '品牌价值',
    status: '状态',
    eyebrow: '域名价值指南',
    title: '什么因素决定域名价值？',
    intro: '优秀的品牌域名通常简短、易记、易拼写，并与企业名称高度一致。本目录将 Brand Finance Global 500 排名与品牌主域名对应，帮助你了解全球领先品牌如何建立线上识别度与信任。',
    sections: [
      ['品牌价值不等于域名成交价', '页面中的金额来自 Brand Finance 品牌估值，并非域名历史成交价或域名估价。高价值品牌会提升对应域名的战略重要性，但两者不能直接画等号。'],
      ['为什么优质域名很重要', '清晰、权威的域名可以减少用户困惑，增加直接访问，并保护品牌认知。全球品牌普遍偏好与品牌完全匹配的 .com 域名，也有品牌使用国家域名或新顶级域名。'],
      ['如何调研一个域名', '先通过目录确认品牌官方网站，再使用 WHOIS 或 RDAP 查询注册商、注册时间及域名状态。部分所有者信息可能受到隐私保护。'],
    ],
    faqTitle: '常见问题',
    faqs: [
      ['哪些域名最有价值？', '域名成交价格与品牌估值是不同指标，因此没有唯一榜单。本目录聚焦全球 500 个最具价值品牌正在使用的主域名。'],
      ['这些金额是百万美元域名成交价吗？', '不是。页面金额是 Brand Finance 发布的品牌估值，不是域名估价或历史成交价格。'],
      ['什么是优质域名？', '优质域名通常简短、易记、易输入、具备商业相关性，并使用可信的域名后缀。搜索需求和买家意图也会影响市场价值。'],
      ['如何查询域名所有者？', '可以使用 WHOIS 或 RDAP 查询域名。结果通常包含注册商和注册状态，但个人所有权信息可能被隐私服务隐藏。'],
    ],
  },
} as const;

export function MillionaireDirectory({ locale = 'en' }: { locale?: string }) {
  const seo = locale.startsWith('zh') ? seoCopy.zh : seoCopy.en;
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [sector, setSector] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<SortMode>('rank');
  const [selected, setSelected] = useState<Brand | null>(null);

  const countries = useMemo(() => [...new Set(brands.map((brand) => brand.country))].sort(), []);
  const sectors = useMemo(() => [...new Set(brands.map((brand) => brand.sector))].sort(), []);
  const visibleBrands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return brands
      .filter((brand) => {
        const matchesQuery = !normalizedQuery || [brand.name, brand.domain, brand.country, brand.sector]
          .some((value) => value.toLowerCase().includes(normalizedQuery));
        const matchesStatus = !status || (status === 'review') === brand.needsReview;
        return matchesQuery && (!country || brand.country === country) && (!sector || brand.sector === sector) && matchesStatus;
      })
      .sort((first, second) => {
        if (sort === 'rank-desc') return second.rank - first.rank;
        if (sort === 'value') return (second.valueUsdM ?? -1) - (first.valueUsdM ?? -1);
        if (sort === 'name') return first.name.localeCompare(second.name);
        return first.rank - second.rank;
      });
  }, [country, query, sector, sort, status]);

  const reset = () => {
    setQuery('');
    setCountry('');
    setSector('');
    setStatus('');
    setSort('rank');
  };

  return (
    <main className="brand-wrap">
      <section className="brand-hero">
        <div>
          <div className="brand-kicker">Brand Finance Global 500 · 2026</div>
          <h1>{seo.heroTitle}</h1>
          <p>{seo.heroDescription}</p>
        </div>
        <div className="brand-stats">
          <div><span>{seo.stats[0]}</span><b>{brands.length}</b></div>
          <div><span>{seo.stats[1]}</span><b>{brands.filter((brand) => brand.domain).length}</b></div>
          <div><span>{seo.stats[2]}</span><b>{brands.filter((brand) => brand.logo).length}</b></div>
          <div><span>{seo.stats[3]}</span><b>{brands.filter((brand) => brand.needsReview).length}</b></div>
        </div>
      </section>

      <section className="brand-controls" aria-label={seo.filtersLabel}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder={seo.searchPlaceholder} />
        <select value={country} onChange={(event) => setCountry(event.target.value)} aria-label={seo.countryLabel}>
          <option value="">{seo.allCountries}</option>
          {countries.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={sector} onChange={(event) => setSector(event.target.value)} aria-label={seo.sectorLabel}>
          <option value="">{seo.allSectors}</option>
          {sectors.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={seo.statusLabel}>
          <option value="">{seo.allStatuses}</option>
          <option value="verified">{seo.verified}</option>
          <option value="review">{seo.needsReview}</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} aria-label={seo.sortLabel}>
          <option value="rank">{seo.sortRankAsc}</option>
          <option value="rank-desc">{seo.sortRankDesc}</option>
          <option value="value">{seo.sortValue}</option>
          <option value="name">{seo.sortName}</option>
        </select>
        <button type="button" onClick={reset}>{seo.reset}</button>
      </section>

      <div className="brand-result"><span><b>{visibleBrands.length}</b> {seo.resultSuffix}</span><span>{seo.resultHint}</span></div>
      <section className="brand-grid">
        {visibleBrands.map((brand) => (
          <button className="brand-card" type="button" onClick={() => setSelected(brand)} key={brand.rank}>
            <span className="brand-rank">{String(brand.rank).padStart(3, '0')}</span>
            <div className="brand-logo">
              {brand.logo ? <img src={`${brand.logo}?v=${brand.verifiedAt}`} alt="" /> : <span>{brand.name.slice(0, 2).toUpperCase()}</span>}
            </div>
            <h2>{brand.name}</h2>
            <div className="brand-domain">{brand.domain || '—'}</div>
            <div className="brand-meta">{brand.country} · {brand.sector}</div>
          </button>
        ))}
        {!visibleBrands.length && <div className="brand-empty">{seo.empty}</div>}
      </section>

      <section className="brand-seo" aria-labelledby="domain-value-guide">
        <div className="brand-seo-intro">
          <div className="brand-kicker">{seo.eyebrow}</div>
          <h2 id="domain-value-guide">{seo.title}</h2>
          <p>{seo.intro}</p>
        </div>
        <div className="brand-seo-grid">
          {seo.sections.map(([title, body]) => (
            <article key={title}><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
        <div className="brand-faq">
          <h2>{seo.faqTitle}</h2>
          {seo.faqs.map(([question, answer]) => (
            <details key={question}><summary>{question}</summary><p>{answer}</p></details>
          ))}
        </div>
      </section>

      {selected && (
        <div className="brand-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
          <section className="brand-modal" role="dialog" aria-modal="true" aria-labelledby="brand-modal-title">
            <header><div><small>{seo.rank} {selected.rank}</small><h2 id="brand-modal-title">{selected.name}</h2></div><button onClick={() => setSelected(null)} aria-label={seo.close}>×</button></header>
            {selected.logo && <img src={`${selected.logo}?v=${selected.verifiedAt}`} alt="" />}
            <dl>
              <dt>{seo.primaryDomain}</dt><dd>{selected.website ? <a href={selected.website} target="_blank" rel="noreferrer">{selected.domain}</a> : '—'}</dd>
              <dt>{seo.country}</dt><dd>{selected.country}</dd>
              <dt>{seo.sector}</dt><dd>{selected.sector}</dd>
              <dt>{seo.brandValue}</dt><dd>{selected.valueUsdM ? `$${selected.valueUsdM.toLocaleString()}M` : '—'}</dd>
              <dt>{seo.status}</dt><dd>{selected.needsReview ? seo.needsReview : seo.verified}</dd>
            </dl>
          </section>
        </div>
      )}
    </main>
  );
}
