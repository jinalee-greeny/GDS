import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadCore } from './helpers.mjs';

const C = loadCore();
const fmPath = fileURLToPath(new URL('../../core/figma-map.js', import.meta.url));
function loadFigmaMap() {
  const src = readFileSync(fmPath, 'utf8');
  const sandbox = { window: {}, module: { exports: {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'figma-map.js' });
  return sandbox.module.exports.variablesPlan ? sandbox.module.exports : sandbox.window.FigmaMap;
}
const FM = loadFigmaMap();

// NOTE: object comparisons use JSON.stringify (order-sensitive deep equality) rather than
// assert.deepEqual because figma-map is loaded in a separate vm realm; strict deepEqual fails
// its cross-realm prototype identity check. Matches the pattern in tool/tests/core.test.mjs.
// Expected literals are written in the impl's key order ({r,g,b}; {name,type,value}).
test('hexToFigmaRGB converts hex to 0-1 floats', () => {
  assert.equal(JSON.stringify(FM.hexToFigmaRGB('#000000')), JSON.stringify({ r: 0, g: 0, b: 0 }));
  assert.equal(JSON.stringify(FM.hexToFigmaRGB('#FFFFFF')), JSON.stringify({ r: 1, g: 1, b: 1 }));
  const g = FM.hexToFigmaRGB('#808080');
  assert.ok(Math.abs(g.r - 128/255) < 1e-9 && g.r === g.g && g.g === g.b);
});

test('variablesPlan color entries are COLOR with slash names', () => {
  const plan = FM.variablesPlan(C.DEFAULT_CONFIG, ['color'], C);
  const blue500 = plan.find(p => p.name === 'color/blue/500');
  assert.equal(blue500.type, 'COLOR');
  assert.equal(JSON.stringify(blue500.value), JSON.stringify(FM.hexToFigmaRGB('#1B8AFF')));
  // white/black base included
  assert.ok(plan.find(p => p.name === 'color/base/white'));
});

test('variablesPlan numeric groups are FLOAT with units stripped', () => {
  const plan = FM.variablesPlan(C.DEFAULT_CONFIG, ['space','radius','opacity','duration'], C);
  assert.equal(JSON.stringify(plan.find(p => p.name === 'space/4')), JSON.stringify({ name: 'space/4', type: 'FLOAT', value: 16 }));
  assert.equal(JSON.stringify(plan.find(p => p.name === 'radius/md')), JSON.stringify({ name: 'radius/md', type: 'FLOAT', value: 6 }));
  assert.equal(JSON.stringify(plan.find(p => p.name === 'opacity/40')), JSON.stringify({ name: 'opacity/40', type: 'FLOAT', value: 0.4 }));
  assert.equal(JSON.stringify(plan.find(p => p.name === 'duration/base')), JSON.stringify({ name: 'duration/base', type: 'FLOAT', value: 200 }));
});

test('variablesPlan string groups are STRING', () => {
  const plan = FM.variablesPlan(C.DEFAULT_CONFIG, ['fontFamily','easing','fontWeight'], C);
  assert.equal(plan.find(p => p.name === 'fontFamily/sans').type, 'STRING');
  assert.equal(plan.find(p => p.name === 'easing/standard').type, 'STRING');
  // fontWeight is STRING per mapping
  assert.equal(plan.find(p => p.name === 'fontWeight/bold').type, 'STRING');
});

test('selection filters groups; empty selection -> empty plan; idempotent', () => {
  const only = FM.variablesPlan(C.DEFAULT_CONFIG, ['radius'], C);
  assert.ok(only.every(p => p.name.startsWith('radius/')));
  assert.equal(JSON.stringify(FM.variablesPlan(C.DEFAULT_CONFIG, [], C)), JSON.stringify([]));
  const a = FM.variablesPlan(C.DEFAULT_CONFIG, FM.GROUP_KEYS, C);
  const b = FM.variablesPlan(C.DEFAULT_CONFIG, FM.GROUP_KEYS, C);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
