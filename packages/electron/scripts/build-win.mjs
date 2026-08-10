import { spawnSync } from 'child_process';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const electronPkg = require.resolve('electron/package.json');
const electronDist = path.join(path.dirname(electronPkg), 'dist');

console.log('electronDist=' + electronDist);
const res = spawnSync('electron-builder', ['--win', 'portable', `-c.electronDist=${electronDist}`], {
  stdio: 'inherit',
  shell: true,
});
process.exit(res.status ?? 1);
