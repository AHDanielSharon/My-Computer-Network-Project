// Runs the API/socket server and the Vite dev server together.
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const children = [];

function start(name, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[lantern] ${name} exited with code ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
  return child;
}

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {}
  }
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[lantern] Starting API server and Vite dev server...');

start('server', process.execPath, [path.join(root, 'server', 'index.js')]);

setTimeout(() => {
  start('vite', process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')]);
}, 900);
