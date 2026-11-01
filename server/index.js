import express from 'express';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { CERTS_DIR, CLIENT_DIST, PORT, TMP_DIR, USE_HTTPS, VERSION } from './config.js';
import { ensureCertificates, inviteUrls, primaryUrl, setActivePort } from './network.js';
import { initApi } from './api.js';
import { initRealtime } from './realtime.js';
import { ensureDefaultGroup, pruneSessions, reconcileCalls } from './db.js';

const app = express();
app.disable('x-powered-by');

initApi(app);

app.get('/lantern-cert.pem', (_req, res) => {
  const certPath = path.join(CERTS_DIR, 'cert.pem');
  if (!fs.existsSync(certPath)) {
    return res.status(404).type('text/plain').send('No certificate has been generated. This server is running over HTTP.');
  }
  res.setHeader('Content-Type', 'application/x-pem-file');
  res.setHeader('Content-Disposition', 'attachment; filename="lantern-cert.pem"');
  res.sendFile(certPath);
});

if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(
    express.static(CLIENT_DIST, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('html')
      .send(
        `<body style="font-family:system-ui;background:#0b0f16;color:#e9eef7;padding:48px;line-height:1.6">
          <h1>Lantern server is running</h1>
          <p>The interface has not been built yet. Run <code style="background:#1a2230;padding:3px 6px;border-radius:6px">npm run build</code> and refresh.</p>
        </body>`,
      );
  });
}

function cleanupInterruptedUploads() {
  try {
    const entries = fs.readdirSync(TMP_DIR);
    for (const entry of entries) {
      try {
        fs.unlinkSync(path.join(TMP_DIR, entry));
      } catch {}
    }
    if (entries.length) {
      console.log(`[lantern] Removed ${entries.length} interrupted upload file(s).`);
    }
  } catch {}
}

cleanupInterruptedUploads();
pruneSessions();
ensureDefaultGroup();
const interruptedCalls = reconcileCalls();
if (interruptedCalls) {
  console.log(`[lantern] Closed ${interruptedCalls} call(s) interrupted by a restart.`);
}

let server;
let protocol = 'http';
if (USE_HTTPS) {
  const pems = ensureCertificates();
  if (pems) {
    server = https.createServer({ key: pems.key, cert: pems.cert }, app);
    protocol = 'https';
    if (pems.generated) console.log('[lantern] Generated a fresh self-signed TLS certificate for this network.');
  } else {
    console.warn('[lantern] Falling back to HTTP. Camera and microphone need HTTPS on other devices.');
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

server.requestTimeout = 0;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 65_000;
server.maxRequestsPerSocket = 0;

initRealtime(server);

const MAX_PORT_ATTEMPTS = 6;
let attempt = 0;

function listen(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
      attempt += 1;
      const next = port + 1;
      console.warn(`[lantern] Port ${port} is busy, trying ${next}...`);
      setTimeout(() => listen(next), 250);
    } else {
      console.error('[lantern] Server error:', err.message);
      process.exit(1);
    }
  });
  server.listen(port, '0.0.0.0', () => {
    setActivePort(port);
    printBanner();
  });
}

async function printBanner() {
  const urls = inviteUrls();
  const shown = primaryUrl();
  const line = '─'.repeat(62);
  console.log(`\n\x1b[38;5;208m${line}\x1b[0m`);
  console.log(`\x1b[1m  LANTERN\x1b[0m  \x1b[2mv${VERSION} · local-first chat for your Wi-Fi\x1b[0m`);
  console.log(`\x1b[38;5;208m${line}\x1b[0m`);
  console.log(`  Server ready on ${protocol.toUpperCase()}`);
  for (const entry of urls) console.log(`  \x1b[36m→\x1b[0m ${entry.url}`);
  console.log(`\n  Invite someone: open the URL above on their phone (same Wi-Fi).`);
  console.log(`  Files are stored in: ${path.join(process.cwd(), 'data')}`);
  if (protocol === 'https') {
    console.log(`  \x1b[33mThe certificate is self-signed: accept the browser warning once.\x1b[0m`);
  }
  console.log(`\x1b[38;5;208m${line}\x1b[0m\n`);
  try {
    const qr = await QRCode.toString(shown, { type: 'terminal', small: true, margin: 1 });
    console.log(qr);
  } catch {}
}

listen(PORT);

function shutdown(signal) {
  console.log(`\n[lantern] ${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
