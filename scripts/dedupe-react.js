/**
 * Dedupe React under cnpm's isolated `.store` layout.
 *
 * cnpm/npminstall hoists a *physical copy* of react/react-dom/scheduler into the
 * top-level node_modules while keeping another copy in `.store`. Webpack then bundles
 * two React instances, which breaks SSR (`useContext` null dispatcher) and React Server
 * Components (`React.cache` missing). Replacing the hoisted copies with symlinks into
 * `.store` collapses them to a single instance while preserving each package's `exports`
 * map (so the `react-server` condition keeps resolving correctly).
 *
 * No-op on flat (npm) installs where `.store` does not exist.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'node_modules');
const store = path.join(root, '.store');
const packages = ['react', 'react-dom', 'scheduler'];

if (!fs.existsSync(store)) {
  process.exit(0);
}

for (const pkg of packages) {
  const target = path.join(root, pkg);
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch {
    continue; // not installed at top level
  }
  if (stat.isSymbolicLink()) continue; // already deduped

  const match = fs
    .readdirSync(store)
    .find((d) => d === pkg || d.startsWith(`${pkg}@`));
  if (!match) continue;

  const storePkg = path.join(store, match, 'node_modules', pkg);
  if (!fs.existsSync(storePkg)) continue;

  fs.rmSync(target, { recursive: true, force: true });
  fs.symlinkSync(path.relative(root, storePkg), target, 'dir');
  console.log(`[dedupe-react] linked ${pkg} -> ${path.relative(root, storePkg)}`);
}
