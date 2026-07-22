import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadCore } from './helpers.mjs';

const C = loadCore();
const htmlPath = fileURLToPath(new URL('../index.html', import.meta.url));

// Extract the REAL configFromDTCG (and its pure dependencies extractDTCGGroup,
// DTCG_DIRECT_GROUPS, DTCG_FONT_GROUPS) from the UI script in index.html, and
// run it in a vm sandbox bound only with C (TokenCore) + JSON/Object/Array.
// If it needed any other UI closure this evaluation would throw — the fact
// that it runs proves it depends solely on C.cloneConfig + JSON built-ins.
function loadConfigFromDTCG() {
  const html = readFileSync(htmlPath, 'utf8');
  const start = html.indexOf('function extractDTCGGroup(node)');
  const marker = 'window.Studio.configFromDTCG = configFromDTCG;';
  const end = html.indexOf(marker);
  if (start === -1 || end === -1) throw new Error('configFromDTCG source not found in index.html');
  const src = html.slice(start, end);
  const sandbox = { C, JSON, Object, Array, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src + '\nglobalThis.configFromDTCG = configFromDTCG;', sandbox, { filename: 'configFromDTCG.js' });
  if (typeof sandbox.configFromDTCG !== 'function') throw new Error('configFromDTCG did not evaluate to a function');
  return sandbox.configFromDTCG;
}

const configFromDTCG = loadConfigFromDTCG();

const DIRECT_GROUPS = ['fontSize', 'space', 'radius', 'borderWidth', 'opacity', 'shadow',
  'zIndex', 'breakpoint', 'duration', 'easing', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing'];

// JSON.stringify compare throughout: the restored config is built inside the
// vm realm, so its Object/Array constructors differ from this realm's —
// assert.deepEqual would fail on cross-realm prototype checks.
test('round-trip: toDTCG(DEFAULT_CONFIG) restores all 14 direct groups + color', () => {
  const dtcgText = C.toDTCG(C.DEFAULT_CONFIG);
  const result = configFromDTCG(dtcgText, C.DEFAULT_CONFIG);
  assert.equal(result.error, null);
  assert.equal(result.skipped.length, 0);
  for (const g of DIRECT_GROUPS) {
    assert.equal(JSON.stringify(result.config[g]), JSON.stringify(C.DEFAULT_CONFIG[g]), 'group mismatch: ' + g);
  }
  assert.equal(JSON.stringify(result.config.color.order), JSON.stringify(C.DEFAULT_CONFIG.color.order));
});

test('round-trip: color ramps are preserved from current cfg, NOT reverse-engineered', () => {
  const dtcgText = C.toDTCG(C.DEFAULT_CONFIG);
  const result = configFromDTCG(dtcgText, C.DEFAULT_CONFIG);
  assert.equal(JSON.stringify(result.config.color.scales), JSON.stringify(C.DEFAULT_CONFIG.color.scales));
});

test('round-trip: malformed JSON returns an error result, never throws, cfg untouched', () => {
  const current = C.DEFAULT_CONFIG;
  const before = JSON.stringify(current);
  let result;
  assert.doesNotThrow(() => { result = configFromDTCG('{not valid json', current); });
  assert.equal(result.config, null);
  assert.equal(typeof result.error, 'string');
  assert.ok(result.error.length > 0);
  assert.equal(JSON.stringify(current), before); // input config object not mutated
});

test('round-trip: missing group -> present groups restored, absent left as current', () => {
  // Build a valid DTCG doc then delete the `space` group entirely.
  const dtcg = JSON.parse(C.toDTCG(C.DEFAULT_CONFIG));
  delete dtcg.space;
  // Give the CURRENT config a distinct space value so we can prove it survives.
  const current = C.cloneConfig(C.DEFAULT_CONFIG);
  current.space = { '0': '0px', '99': '999px' };
  const result = configFromDTCG(JSON.stringify(dtcg), current);
  assert.equal(result.error, null);
  // absent group: left exactly as current
  assert.equal(JSON.stringify(result.config.space), JSON.stringify(current.space));
  // present group: restored from the file (equals DEFAULT_CONFIG's radius)
  assert.equal(JSON.stringify(result.config.radius), JSON.stringify(C.DEFAULT_CONFIG.radius));
});

test('round-trip: wrong-shape leaf skips that group, others still restore, no throw', () => {
  const dtcg = JSON.parse(C.toDTCG(C.DEFAULT_CONFIG));
  dtcg.space = { '0': { $type: 'dimension', $value: '0px' }, '1': 'not-a-leaf-object' };
  let result;
  assert.doesNotThrow(() => { result = configFromDTCG(JSON.stringify(dtcg), C.DEFAULT_CONFIG); });
  assert.equal(result.error, null);
  assert.ok(result.skipped.includes('space'));
  // skipped group falls back to current value (not corrupted)
  assert.equal(JSON.stringify(result.config.space), JSON.stringify(C.DEFAULT_CONFIG.space));
  // a valid sibling group still restores
  assert.equal(JSON.stringify(result.config.radius), JSON.stringify(C.DEFAULT_CONFIG.radius));
});
