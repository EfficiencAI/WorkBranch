const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const backendDir = __dirname;
const srcDir = path.join(backendDir, 'src');
const distDir = path.join(backendDir, 'dist');
const androidAssetsDir = path.join(
  backendDir, '..', '..', 'platforms', 'android', 'android', 'app', 'src', 'main', 'assets', 'www', 'nodejs-project'
);

/**
 * Copy a node_modules package (selected files only) to Android assets.
 */
function copyNativeModule(pkgName, files) {
  const srcPkg = path.join(backendDir, '..', '..', 'node_modules', pkgName);
  const destPkg = path.join(androidAssetsDir, pkgName);
  if (!fs.existsSync(srcPkg)) {
    console.warn(`WARNING: ${pkgName} not found at ${srcPkg}`);
    return;
  }
  fs.mkdirSync(destPkg, { recursive: true });
  for (const f of files) {
    const src = path.join(srcPkg, f);
    const dest = path.join(destPkg, f);
    if (fs.statSync(src).isDirectory()) {
      copyDir(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
  console.log(`  Copied ${pkgName} (${files.join(', ')})`);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function build() {
  console.log('Building backend with esbuild...');

  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  await esbuild.build({
    entryPoints: [path.join(srcDir, 'server.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: path.join(distDir, 'server.bundle.js'),
    format: 'cjs',
    sourcemap: true,
    external: [
      'sql.js',
    ],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    logLevel: 'info',
  });

  console.log('Fixing Unicode property escapes...');
  let bundleContent = fs.readFileSync(path.join(distDir, 'server.bundle.js'), 'utf8');
  
  bundleContent = bundleContent.replace(/\\p\{Lu\}/g, 'A-Z');
  bundleContent = bundleContent.replace(/\\p\{Ll\}/g, 'a-z');
  bundleContent = bundleContent.replace(/\\p\{Alpha\}/g, 'A-Za-z');
  bundleContent = bundleContent.replace(/\\p\{N\}/g, '0-9');
  bundleContent = bundleContent.replace(/\\p\{Letter\}/g, 'A-Za-z');
  bundleContent = bundleContent.replace(/\\p\{Number\}/g, '0-9');
  
  console.log('Disabling worker threads for Android...');
  bundleContent = bundleContent.replace(
    /function createWorker\(stream, opts\) \{[\s\S]*?const worker = new Worker\(toExecute, \{[\s\S]*?\}\);/g,
    'function createWorker(stream, opts) { return { on: () => {}, postMessage: () => {}, terminate: () => {} };'
  );
  
  fs.writeFileSync(path.join(distDir, 'server.bundle.js'), bundleContent);
  console.log('Fixed Unicode property escapes and disabled worker threads');

  console.log('Build complete!');

  console.log('Copying to Android assets...');
  if (fs.existsSync(androidAssetsDir)) {
    const destDistDir = path.join(androidAssetsDir, 'dist');
    if (fs.existsSync(destDistDir)) {
      fs.rmSync(destDistDir, { recursive: true, force: true });
    }
    fs.mkdirSync(destDistDir, { recursive: true });
    
    fs.copyFileSync(
      path.join(distDir, 'server.bundle.js'),
      path.join(destDistDir, 'server.bundle.js')
    );

    // Copy sql.js runtime files (JS + WASM)
    copyNativeModule('sql.js', [
      'dist', 'package.json',
    ]);
    console.log('Copied sql.js to Android assets');

    console.log('Copied to Android assets');
  }

  const indexJs = `const path = require('path');
const serverPath = path.join(__dirname, 'dist', 'server.bundle.js');
require(serverPath);
`;
  fs.writeFileSync(path.join(androidAssetsDir, 'index.js'), indexJs);
  console.log('Created index.js entry point');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
