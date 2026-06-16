const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const backendDir = __dirname;
const srcDir = path.join(backendDir, 'src');
const distDir = path.join(backendDir, 'dist');
const androidAssetsDir = path.join(
  backendDir, '..', '..', 'platforms', 'android', 'android', 'app', 'src', 'main', 'assets', 'www', 'nodejs-project'
);

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
      // sql.js 已移除 external，由 esbuild 内联打包以支持 Android 嵌入式环境
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

  console.log('Copying sql.js WASM file...');
  const sqlJsWasmSrc = path.join(backendDir, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const sqlJsWasmDest = path.join(distDir, 'sql-wasm.wasm');
  if (fs.existsSync(sqlJsWasmSrc)) {
    fs.copyFileSync(sqlJsWasmSrc, sqlJsWasmDest);
    console.log('Copied sql-wasm.wasm to dist');
  } else {
    console.warn('Warning: sql-wasm.wasm not found');
  }

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
    
    if (fs.existsSync(sqlJsWasmDest)) {
      fs.copyFileSync(sqlJsWasmDest, path.join(androidAssetsDir, 'sql-wasm.wasm'));
    }
    
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
