const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const brands = require('../lib/data/millionaire-domains.json');
const audit = require('../lib/data/brand-directory-audit.json');

test('publishes the complete 500-brand prototype dataset', () => {
  assert.equal(brands.length, 500);

  for (const brand of brands) {
    assert.equal(typeof brand.rank, 'number');
    assert.equal(typeof brand.name, 'string');
    assert.equal(typeof brand.country, 'string');
    assert.equal(typeof brand.sector, 'string');
    assert.ok(brand.valueUsdM === null || brand.valueUsdM > 0);
    assert.equal(typeof brand.logo, 'string');
    assert.equal(typeof brand.needsReview, 'boolean');
  }
});

test('keeps the ranking ordered and includes flagship brands', () => {
  const ranks = brands.map((brand) => brand.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.ok(brands.some((brand) => brand.name === 'Apple'));
  assert.ok(brands.some((brand) => brand.name === 'Microsoft'));
  assert.ok(brands.some((brand) => brand.name === 'Google'));
});

test('every brand has a domain and a local logo asset', () => {
  for (const brand of brands) {
    assert.match(brand.domain, /^[a-z0-9.-]+\.[a-z]{2,}$/i, `${brand.rank} ${brand.name}`);
    assert.ok(brand.logo, `${brand.rank} ${brand.name} has no logo path`);
    const logoPath = path.join(process.cwd(), 'public', brand.logo);
    assert.ok(fs.existsSync(logoPath), `${brand.rank} ${brand.name} logo is missing`);
    assert.ok(fs.statSync(logoPath).size > 100, `${brand.rank} ${brand.name} logo is empty`);
  }
});

test('known harmful or unrelated domain matches cannot regress', () => {
  const blockedDomains = [
    'monstercockland.com',
    'nytimes.com',
    'office.com',
    'bc.game',
    'cnn.com',
    'hcaptcha.com',
    'audible.com',
    'ceeceesclosetnyc.com',
    'warriortrainingalliance.com',
  ];
  assert.deepEqual(brands.filter((brand) => blockedDomains.includes(brand.domain)), []);
});

test('official ranking fields and logos are fully synchronized', () => {
  assert.equal(brands.filter((brand) => brand.valueUsdM !== null).length, 100);
  assert.equal(brands.filter((brand) => brand.logoSource === 'Brand Finance Global 500 2026').length, 500);
  assert.equal(brands.filter((brand) => brand.rankingSource === 'Brand Finance Global 500 2026 official API').length, 500);
  assert.equal(brands.filter((brand) => brand.needsReview).length, 0);
});

test('logo extensions match their real file formats', () => {
  const detectExtension = (buffer) => {
    const head = buffer.subarray(0, 200);
    const text = head.toString('utf8').trimStart();
    if (text.startsWith('<svg') || text.startsWith('<?xml')) return '.svg';
    if (head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
    if (head[0] === 255 && head[1] === 216) return '.jpg';
    if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return '.webp';
    if (head.toString('ascii', 4, 12).includes('ftypavif')) return '.avif';
    if (['GIF87a', 'GIF89a'].includes(head.toString('ascii', 0, 6))) return '.gif';
    return '.unknown';
  };

  for (const brand of brands) {
    const logoPath = path.join(process.cwd(), 'public', brand.logo);
    assert.equal(path.extname(logoPath).toLowerCase(), detectExtension(fs.readFileSync(logoPath)), `${brand.rank} ${brand.name}`);
  }
});

test('every domain has retained verification evidence', () => {
  assert.equal(audit.total, 500);
  assert.equal(audit.records.length, 500);
  assert.equal(audit.records.filter((record) => record.status !== 'verified').length, 0);
  assert.equal(audit.records.filter((record) => record.method === 'manual_review_retained').length, 0);
});

test('publishes the SEO page at the correctly spelled canonical route', () => {
  const canonicalPage = fs.readFileSync(path.join(process.cwd(), 'app/[locale]/million-dollar-domains/page.tsx'), 'utf8');
  const legacyPage = fs.readFileSync(path.join(process.cwd(), 'app/[locale]/million-dolloar-domains/page.tsx'), 'utf8');
  const navigation = fs.readFileSync(path.join(process.cwd(), 'lib/config/navigation.ts'), 'utf8');

  assert.match(canonicalPage, /most valuable domain names/i);
  assert.match(canonicalPage, /FAQPage/);
  assert.match(canonicalPage, /CollectionPage/);
  assert.match(canonicalPage, /canonical: path/);
  assert.match(legacyPage, /redirect\(`\/\$\{locale\}\/million-dollar-domains`\)/);
  assert.match(navigation, /href: '\/million-dollar-domains'/);
  assert.doesNotMatch(navigation, /million-dolloar-domains/);
});

test('localizes all directory interface sections in English and Chinese', () => {
  const component = fs.readFileSync(path.join(process.cwd(), 'components/millionaire-domains/MillionaireDirectory.tsx'), 'utf8');

  for (const copy of [
    'The world’s most valuable brand domains',
    'Search brands, domains, countries, or industries',
    'Frequently asked questions',
    '全球最具价值品牌域名',
    '搜索品牌、域名、国家或行业',
    '常见问题',
  ]) {
    assert.ok(component.includes(copy), `missing localized copy: ${copy}`);
  }
  assert.match(component, /locale\.startsWith\('zh'\)/);
  assert.match(component, /aria-label=\{seo\.filtersLabel\}/);
  assert.match(component, /aria-label=\{seo\.close\}/);
});
