import type { Metadata } from 'next';
import { unstable_setRequestLocale } from 'next-intl/server';
import { MillionaireDirectory } from '@/components/millionaire-domains/MillionaireDirectory';
import '../million-dolloar-domains/million-dolloar-domains.css';

interface Props {
  params: { locale: string };
}

const descriptions = {
  en: 'Explore 500 valuable domain names used by the world’s leading brands, with official websites, logos, industries, countries, and Brand Finance valuations.',
  zh: '浏览全球 500 个高价值品牌使用的主域名、官方网站、Logo、行业、国家及 Brand Finance 品牌估值。',
};

export function generateMetadata({ params: { locale } }: Props): Metadata {
  const isChinese = locale.startsWith('zh');
  const path = `/${locale}/million-dollar-domains`;
  const title = isChinese
    ? '全球最具价值品牌域名：500 强域名目录 | Whois Checker'
    : 'Most Valuable Domain Names: 500 Global Brand Domains';
  const description = isChinese ? descriptions.zh : descriptions.en;

  return {
    title,
    description,
    keywords: ['most valuable domain names', 'most expensive domains', 'premium domain names', 'domain worth', 'brand domains'],
    alternates: {
      canonical: path,
      languages: {
        en: '/en/million-dollar-domains',
        zh: '/zh/million-dollar-domains',
      },
    },
    openGraph: { title, description, type: 'website', url: path },
  };
}

export default function MillionDollarDomainsPage({ params: { locale } }: Props) {
  unstable_setRequestLocale(locale);
  const isChinese = locale.startsWith('zh');
  const faq = isChinese
    ? [
      ['哪些域名最有价值？', '域名成交价格与品牌估值是不同指标。本目录聚焦全球 500 个最具价值品牌正在使用的主域名。'],
      ['这些金额是域名成交价吗？', '不是。页面金额是 Brand Finance 发布的品牌估值，并非域名估价或历史成交价格。'],
      ['什么是优质域名？', '优质域名通常简短、易记、易输入、具备商业相关性，并使用可信的域名后缀。'],
      ['如何查询域名所有者？', '可以使用 WHOIS 或 RDAP 查询注册商及注册状态，所有者信息可能受到隐私保护。'],
    ]
    : [
      ['What are the most valuable domain names?', 'Domain sale prices and brand valuations are different metrics. This directory focuses on the primary domains used by the world’s 500 most valuable brands.'],
      ['Are these domain sale prices?', 'No. The figures are Brand Finance brand valuations, not domain appraisal estimates or historical domain sale prices.'],
      ['What makes a domain name premium?', 'Premium domains are typically concise, memorable, easy to type, commercially relevant, and built on a trusted extension.'],
      ['How can I find out who owns a domain?', 'Use a WHOIS or RDAP lookup to review registrar and registration data. Ownership information may be privacy protected.'],
    ];
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: isChinese ? '全球最具价值品牌域名' : 'Most Valuable Domain Names',
        description: isChinese ? descriptions.zh : descriptions.en,
        inLanguage: isChinese ? 'zh-CN' : 'en',
        mainEntity: { '@type': 'ItemList', numberOfItems: 500 },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map(([name, text]) => ({
          '@type': 'Question',
          name,
          acceptedAnswer: { '@type': 'Answer', text },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <MillionaireDirectory locale={locale} />
    </>
  );
}
