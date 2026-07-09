import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const htmlPath = fileURLToPath(new URL('../index.html', import.meta.url));

export function loadCore() {
  const html = readFileSync(htmlPath, 'utf8');
  const m = html.match(/<script id="token-core">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('token-core script not found in index.html');
  const sandbox = { window: {}, module: { exports: {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox, { filename: 'token-core.js' });
  // core assigns to window.TokenCore AND module.exports; prefer the latter
  return sandbox.module.exports.hexof ? sandbox.module.exports : sandbox.window.TokenCore;
}
