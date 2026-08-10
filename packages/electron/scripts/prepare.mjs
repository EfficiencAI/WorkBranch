import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(pkgDir, '..', '..');
const resDir = path.join(pkgDir, 'resources');
const feDist = path.join(root, 'packages', 'frontend', 'dist');
const beSrc = path.join(root, 'packages', 'backend', 'src', 'server.ts');
const sqljsSrc = path.join(root, 'packages', 'backend', 'node_modules', 'sql.js');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

fs.rmSync(resDir, { recursive: true, force: true });
fs.mkdirSync(path.join(resDir, 'backend', 'node_modules'), { recursive: true });
fs.mkdirSync(path.join(resDir, 'frontend'), { recursive: true });

assert(fs.existsSync(path.join(feDist, 'index.html')), 'frontend dist missing, run pnpm build:frontend first');
assert(fs.existsSync(beSrc), 'backend src missing: ' + beSrc);
assert(fs.existsSync(path.join(sqljsSrc, 'dist')), 'sql.js missing in backend node_modules');

fs.cpSync(feDist, path.join(resDir, 'frontend'), { recursive: true });
console.log('Copied frontend dist -> resources/frontend');

await build({
  entryPoints: [beSrc],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: path.join(resDir, 'backend', 'server.bundle.js'),
  external: ['sql.js'],
  logLevel: 'info',
});
console.log('Bundled backend -> resources/backend/server.bundle.js');

fs.cpSync(sqljsSrc, path.join(resDir, 'backend', 'node_modules', 'sql.js'), {
  recursive: true,
  dereference: true,
});
console.log('Copied sql.js -> resources/backend/node_modules/sql.js');
console.log('Prepare done');
