import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';
import { CERTS_DIR, PORT, USE_HTTPS } from './config.js';

export function lanAddresses() {
  const out = [];
  const interfaces = os.networkInterfaces();
  for (const [name, list] of Object.entries(interfaces)) {
    for (const info of list || []) {
      if (info.family === 'IPv4' && !info.internal) {
        out.push({ name, address: info.address });
      }
    }
  }
  return out;
}

export function primaryAddress() {
  const all = lanAddresses();
  const preferred = all.find((a) => /wi-?fi|wlan|wireless|ethernet|en0|eth0/i.test(a.name)) || all[0];
  return preferred?.address || '127.0.0.1';
}

let activePort = PORT;

export function setActivePort(port) {
  activePort = port;
}

export function primaryUrl() {
  const scheme = USE_HTTPS ? 'https' : 'http';
  return `${scheme}://${primaryAddress()}:${activePort}`;
}

export function inviteUrls() {
  const scheme = USE_HTTPS ? 'https' : 'http';
  const primary = primaryAddress();
  const ordered = [...lanAddresses()].sort((a, b) =>
    a.address === primary ? -1 : b.address === primary ? 1 : 0,
  );
  const list = [{ label: 'localhost', url: `${scheme}://localhost:${activePort}` }];
  for (const { name, address } of ordered) {
    list.push({ label: name, url: `${scheme}://${address}:${activePort}` });
  }
  return list;
}

// Generates a self-signed certificate that covers every LAN IP currently in use.
// Browsers will show a one-time warning; the README explains how to trust the CA.
export function ensureCertificates() {
  const keyPath = process.env.KEY_FILE || path.join(CERTS_DIR, 'key.pem');
  const certPath = process.env.CERT_FILE || path.join(CERTS_DIR, 'cert.pem');

  if (process.env.KEY_FILE && process.env.CERT_FILE) {
    return { key: fs.readFileSync(process.env.KEY_FILE), cert: fs.readFileSync(process.env.CERT_FILE), generated: false };
  }

  const ips = ['127.0.0.1', ...lanAddresses().map((a) => a.address)];
  const metaPath = path.join(CERTS_DIR, 'meta.json');
  let existingMeta = null;
  try {
    existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {}

  const sameIps =
    existingMeta &&
    Array.isArray(existingMeta.ips) &&
    existingMeta.ips.length === ips.length &&
    [...existingMeta.ips].sort().join(',') === [...ips].sort().join(',') &&
    fs.existsSync(keyPath) &&
    fs.existsSync(certPath);

  if (sameIps) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), generated: false };
  }

  try {
    const pems = selfsigned.generate(
      [{ name: 'commonName', value: 'Lantern LAN Chat' }],
      {
        days: 825,
        keySize: 2048,
        algorithm: 'sha256',
        extensions: [
          { name: 'basicConstraints', cA: true },
          { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, keyCertSign: true },
          {
            name: 'subjectAltName',
            altNames: [
              { type: 2, value: 'localhost' },
              { type: 2, value: os.hostname() },
              ...ips.map((ip) => ({ type: 7, ip })),
            ],
          },
        ],
      },
    );
    fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
    fs.writeFileSync(certPath, pems.cert);
    fs.writeFileSync(metaPath, JSON.stringify({ ips, created: Date.now() }, null, 2));
    return { key: pems.private, cert: pems.cert, generated: true };
  } catch (err) {
    console.error('[lantern] Could not generate a TLS certificate:', err.message);
    return null;
  }
}
