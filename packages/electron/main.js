const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

let backend = null;
let server = null;

function resourcesDir() {
  return path.join(__dirname, 'resources');
}

function dataDir() {
  const base =
    process.env.PORTABLE_EXECUTABLE_DIR ||
    (app.isPackaged ? path.dirname(process.execPath) : process.cwd());
  const dir = path.join(base, 'data');
  fs.mkdirSync(path.join(dir, 'workspaces'), { recursive: true });
  return dir;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Backend did not become healthy within ${timeoutMs}ms`);
}

function startBackend(port, dir) {
  const entry = path.join(resourcesDir(), 'backend', 'server.bundle.js');
  if (!fs.existsSync(entry)) {
    throw new Error('Backend bundle missing: ' + entry + ' (run pnpm build:electron prepare first)');
  }
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_PATH: path.join(resourcesDir(), 'backend', 'node_modules'),
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      DATABASE_PATH: path.join(dir, 'workbranch.db'),
      WORKSPACE_BASE_DIR: path.join(dir, 'workspaces'),
    },
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (d) => console.log('[backend]', String(d).trimEnd()));
  child.stderr.on('data', (d) => console.error('[backend-err]', String(d).trimEnd()));
  child.on('exit', (code) => console.log('[backend] exited with code', code));
  return child;
}

function createStaticServer(frontendDir, backendPort) {
  return http.createServer((req, res) => {
    const pathname = (req.url || '/').split('?')[0];
    if (pathname === '/health' || pathname.startsWith('/api')) {
      const proxyReq = http.request(
        {
          host: '127.0.0.1',
          port: backendPort,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Backend unavailable');
      });
      req.pipe(proxyReq);
      return;
    }

    let filePath = path.join(frontendDir, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(frontendDir, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'WorkBranch',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(`http://127.0.0.1:${port}`);
  win.on('closed', () => {
    // window-all-closed will trigger app.quit()
  });
}

app.whenReady().then(async () => {
  try {
    const dir = dataDir();
    const backendPort = await getFreePort();
    const staticPort = await getFreePort();
    backend = startBackend(backendPort, dir);
    await waitForHealth(backendPort);
    server = createStaticServer(path.join(resourcesDir(), 'frontend'), backendPort);
    await new Promise((resolve) => server.listen(staticPort, '127.0.0.1', resolve));
    createWindow(staticPort);
  } catch (err) {
    console.error('[electron] startup failed:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  if (server) {
    server.close();
    server = null;
  }
  if (backend) {
    try {
      backend.kill('SIGTERM');
    } catch {
      backend.kill();
    }
    backend = null;
  }
});
