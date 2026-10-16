const fs = require('node:fs');
const path = require('node:path');

const dataPath = path.join(process.cwd(), 'lib/data/millionaire-domains.json');
const overrides = require('../lib/data/brand-domain-overrides.json');
const brands = require('../lib/data/millionaire-domains.json');
const verifiedAt = '2026-10-16';

for (const brand of brands) {
  brand.rankingSource = 'Brand Finance Global 500 2026 preview, pages 37-46';
  if (!overrides[String(brand.rank)]) continue;

  const domain = overrides[String(brand.rank)];
  brand.domain = domain;
  brand.website = `https://${domain}`;
  brand.logo = `/brand-directory/logos/${String(brand.rank).padStart(3, '0')}-${brand.name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.png`;
  brand.logoSource = 'Official-domain favicon';
  brand.matchScore = 100;
  brand.needsReview = false;
  brand.domainVerifiedAt = verifiedAt;
}

fs.writeFileSync(dataPath, `${JSON.stringify(brands, null, 2)}\n`);
