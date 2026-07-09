import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const corePath = fileURLToPath(new URL('../../core/token-core.js', import.meta.url));

export function loadCore() {
  const src = readFileSync(corePath, 'utf8');
  const sandbox = { window: {}, module: { exports: {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'token-core.js' });
  return sandbox.module.exports.hexof ? sandbox.module.exports : sandbox.window.TokenCore;
}
