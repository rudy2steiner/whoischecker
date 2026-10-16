const fs = require('node:fs');
const path = require('node:path');

const publication = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).data;
const countries = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).data;
const industries = JSON.parse(fs.readFileSync(process.argv[4], 'utf8')).data;
const current = require('../lib/data/millionaire-domains.json');
const overrides = require('../lib/data/brand-domain-overrides.json');
const publishedValues = require('../lib/data/brand-values-top100.json');
const ranking = publication.rankings.find((item) => item.slug === 'global-2026');
const countryById = new Map(countries.map((item) => [item.id, item.name]));
const industryById = new Map(industries.map((item) => [item.id, item.name]));
const currentByRank = new Map(current.map((item) => [item.rank, item]));
const logoExtension = (url) => {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  if (extension === '.jpeg') return '.jpg';
  return ['.png', '.jpg', '.svg', '.webp', '.gif'].includes(extension) ? extension : '.png';
};

const brands = ranking.brand_details
  .sort((first, second) => first.rank - second.rank)
  .map((official) => {
    const previous = currentByRank.get(official.rank) ?? {};
    const domain = overrides[String(official.rank)] ?? previous.domain ?? '';
    const logo = `/brand-directory/logos/${String(official.rank).padStart(3, '0')}-${official.slug}${logoExtension(official.logo.url)}`;
    return {
      rank: official.rank,
      name: official.name,
      country: countryById.get(official.country_of_domicile_id),
      sector: industryById.get(official.industry_id),
      valueUsdM: publishedValues[String(official.rank)] ?? (official.brand_value ? Math.round(official.brand_value) : null),
      domain,
      website: domain ? `https://${domain}` : '',
      logo,
      logoSource: 'Brand Finance Global 500 2026',
      logoUrl: official.logo?.url ?? '',
      matchScore: overrides[String(official.rank)] ? 100 : previous.matchScore ?? 0,
      needsReview: !domain || (!overrides[String(official.rank)] && (previous.needsReview || previous.matchScore < 90)),
      rankingSource: 'Brand Finance Global 500 2026 official API',
      verifiedAt: '2026-10-16'
    };
  });

fs.writeFileSync(path.join(process.cwd(), 'lib/data/millionaire-domains.json'), `${JSON.stringify(brands, null, 2)}\n`);
for (const brand of brands) {
  if (brand.logoUrl) process.stdout.write(`${brand.logoUrl}\tpublic${brand.logo}\n`);
}
