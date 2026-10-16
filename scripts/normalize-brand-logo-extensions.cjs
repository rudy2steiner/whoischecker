const fs = require('node:fs');
const path = require('node:path');

const dataPath = path.join(process.cwd(), 'lib/data/millionaire-domains.json');
const brands = require('../lib/data/millionaire-domains.json');

const detectExtension = (buffer) => {
  const head = buffer.subarray(0, 200);
  const text = head.toString('utf8').trimStart();
  if (text.startsWith('<svg') || text.startsWith('<?xml')) return '.svg';
  if (head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
  if (head[0] === 255 && head[1] === 216) return '.jpg';
  if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (head.toString('ascii', 4, 12).includes('ftypavif')) return '.avif';
  if (['GIF87a', 'GIF89a'].includes(head.toString('ascii', 0, 6))) return '.gif';
  throw new Error('Unsupported logo format');
};

for (const brand of brands) {
  const currentPath = path.join(process.cwd(), 'public', brand.logo);
  const extension = detectExtension(fs.readFileSync(currentPath));
  if (path.extname(currentPath).toLowerCase() === extension) continue;

  const nextPath = currentPath.replace(/\.[^.]+$/, extension);
  fs.renameSync(currentPath, nextPath);
  brand.logo = brand.logo.replace(/\.[^.]+$/, extension);
}

fs.writeFileSync(dataPath, `${JSON.stringify(brands, null, 2)}\n`);
