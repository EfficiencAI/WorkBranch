const assert = require('assert');
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const backendDir = __dirname;
const srcDir = path.join(backendDir, 'src');
const distDir = path.join(backendDir, 'dist');
const androidRootDir = path.join(backendDir, '..', '..', 'android');
const androidAssetsDir = path.join(
  androidRootDir, 'app', 'src', 'main', 'assets', 'www', 'nodejs-project'
);
const cordovaPluginDir = path.join(androidRootDir, 'capacitor-cordova-android-plugins');
const cordovaPluginWwwDir = path.join(cordovaPluginDir, 'src', 'main', 'assets', 'www');
const cordovaNativeDir = path.join(cordovaPluginDir, 'src', 'main', 'libs', 'cdvnodejsmobile');
const cordovaWebPluginListPath = path.join(
  androidRootDir, 'app', 'src', 'main', 'assets', 'public', 'cordova_plugins.js'
);

/**
 * Copy a node_modules package (selected files only) to Android assets.
 */
function copyNativeModule(pkgName, files) {
  const srcPkg = path.join(backendDir, 'node_modules', pkgName);
  const destPkg = path.join(androidAssetsDir, pkgName);
  assert(fs.existsSync(srcPkg), 'Missing ' + pkgName + ' at ' + srcPkg);
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

function replaceRequired(filePath, before, after) {
  const content = fs.readFileSync(filePath, 'utf8');
  const occurrences = content.split(before).length - 1;
  assert.strictEqual(occurrences, 1, 'Expected one occurrence in ' + filePath + ', found ' + occurrences);
  fs.writeFileSync(filePath, content.replace(before, after));
}

function prepareCordovaPlugin() {
  console.log('Preparing nodejs-mobile Cordova compatibility...');
  fs.mkdirSync(cordovaPluginWwwDir, { recursive: true });

  const gradlePath = path.join(cordovaPluginDir, 'build.gradle');
  const gradleMarker = '// PLUGIN GRADLE EXTENSIONS END';
  const indent = ' '.repeat(2);
  const gradleOverride = [
    gradleMarker,
    '',
    'android {',
    indent + 'externalNativeBuild {',
    indent.repeat(2) + 'cmake {',
    indent.repeat(3) + 'path "src/main/libs/cdvnodejsmobile/CMakeLists.txt"',
    indent.repeat(2) + '}',
    indent + '}',
    '}',
  ].join('\n');
  replaceRequired(gradlePath, gradleMarker, gradleOverride);

  const cmakePath = path.join(cordovaNativeDir, 'CMakeLists.txt');
  replaceRequired(cmakePath, 'include_directories(libnode/include/node/)', 'include_directories(include/node/)');
  replaceRequired(
    cmakePath,
    '${CMAKE_SOURCE_DIR}/libnode/bin/${ANDROID_ABI}/libnode.so',
    '${CMAKE_SOURCE_DIR}/bin/${ANDROID_ABI}/libnode.so'
  );

  for (const abi of ['armeabi-v7a', 'arm64-v8a', 'x86_64']) {
    const abiDir = path.join(cordovaNativeDir, 'bin', abi);
    const gzipPath = path.join(abiDir, 'libnode.so.gz');
    const outputPath = path.join(abiDir, 'libnode.so');
    assert(fs.existsSync(gzipPath), 'Missing ' + gzipPath);
    fs.writeFileSync(outputPath, zlib.gunzipSync(fs.readFileSync(gzipPath)));
  }
  console.log('Prepared nodejs-mobile Cordova compatibility');
}

function disableCordovaWebPluginBridge() {
  const content = fs.readFileSync(cordovaWebPluginListPath, 'utf8');
  const listStartMarker = '    module.exports = [';
  const listEndMarker = '    ];';
  const metadataMarker = '    module.exports.metadata =';

  assert.strictEqual(content.split(listStartMarker).length - 1, 1, 'Unexpected Cordova plugin list start');
  assert.strictEqual(content.split(metadataMarker).length - 1, 1, 'Unexpected Cordova plugin metadata');
  assert(content.includes('@red-mobile/nodejs-mobile-cordova.nodejs'), 'Missing nodejs web plugin');
  assert(content.includes('@red-mobile/nodejs-mobile-cordova.nodejs_events'), 'Missing nodejs events web plugin');

  const listStart = content.indexOf(listStartMarker);
  const listEnd = content.indexOf(listEndMarker, listStart);
  assert(listEnd > listStart, 'Unexpected Cordova plugin list end');

  const updated = content.slice(0, listStart)
    + '    module.exports = [];'
    + content.slice(listEnd + listEndMarker.length);
  fs.writeFileSync(cordovaWebPluginListPath, updated);
  console.log('Disabled obsolete nodejs-mobile web plugin bridge');
}

async function build() {
  prepareCordovaPlugin();
  disableCordovaWebPluginBridge();
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
