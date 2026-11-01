import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CLIENT_DIST = path.join(ROOT, 'dist');
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
export const FILES_DIR = path.join(DATA_DIR, 'files');
export const AVATARS_DIR = path.join(DATA_DIR, 'avatars');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const CERTS_DIR = path.join(DATA_DIR, 'certs');

export const PORT = Number(process.env.PORT || 8443);
export const USE_HTTPS = process.env.HTTPS !== '0';
export const APP_NAME = 'Lantern';
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 2048) * 1024 * 1024;
export const VERSION = '1.0.0';

for (const dir of [DATA_DIR, FILES_DIR, AVATARS_DIR, TMP_DIR, CERTS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
