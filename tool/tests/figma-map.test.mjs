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

test('GROUP_KEYS excludes shadow (shadow is Effect-Style-only)', () => {
  assert.ok(!FM.GROUP_KEYS.includes('shadow'));
  assert.equal(FM.GROUP_KEYS.length, 14);
});

test('variablesPlan emits no shadow/* entries', () => {
  const plan = FM.variablesPlan(C.DEFAULT_CONFIG, FM.GROUP_KEYS.concat(['shadow']), C);
  assert.ok(!plan.some(p => p.name.indexOf('shadow/') === 0));
});

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

test('shadowToEffects parses a single CSS drop shadow', () => {
  const e = FM.shadowToEffects('0 2px 6px rgba(0,0,0,0.10)');
  assert.equal(e.length, 1);
  assert.equal(JSON.stringify(e[0]), JSON.stringify({
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.1 },
    offset: { x: 0, y: 2 },
    radius: 6,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL'
  }));
});

test('shadowToEffects supports spread and multiple comma-separated shadows', () => {
  const e = FM.shadowToEffects('0 1px 2px 1px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.1)');
  assert.equal(e.length, 2);
  assert.equal(e[0].spread, 1);
  assert.equal(JSON.stringify(e[0].offset), JSON.stringify({ x: 0, y: 1 }));
  assert.equal(e[0].radius, 2);
  assert.equal(e[1].spread, 0);
  assert.equal(e[1].radius, 8);
});

test('shadowToEffects parses hex color with default full alpha', () => {
  const e = FM.shadowToEffects('0 0 4px #FF0000');
  assert.equal(JSON.stringify(e[0].color), JSON.stringify({ r: 1, g: 0, b: 0, a: 1 }));
});

test('effectStylePlan maps all shadow tokens in order', () => {
  const plan = FM.effectStylePlan(C.DEFAULT_CONFIG);
  assert.equal(JSON.stringify(plan.map(p => p.name)),
    JSON.stringify(['shadow/sm','shadow/md','shadow/lg','shadow/xl','shadow/2xl']));
  const md = plan.find(p => p.name === 'shadow/md');
  assert.equal(md.effects[0].radius, 6);
  assert.equal(md.effects[0].offset.y, 2);
});

test('textStylePlan builds size x weight styles with mapped font style names', () => {
  const plan = FM.textStylePlan(C.DEFAULT_CONFIG, ['regular','bold'], 'Pretendard');
  // 11 sizes x 2 weights = 22
  assert.equal(plan.length, 22);
  const mdBold = plan.find(p => p.name === 'text/md/bold');
  assert.equal(JSON.stringify(mdBold), JSON.stringify({
    name: 'text/md/bold',
    fontSize: 16,
    fontName: { family: 'Pretendard', style: 'Bold' },
    lineHeight: { unit: 'PERCENT', value: 150 },
    letterSpacing: { unit: 'PERCENT', value: 0 }
  }));
  // family override respected; unselected weight absent
  assert.ok(plan.every(p => p.fontName.family === 'Pretendard'));
  assert.ok(!plan.some(p => p.name.endsWith('/medium')));
});

test('textStylePlan empty weights -> empty plan', () => {
  assert.equal(JSON.stringify(FM.textStylePlan(C.DEFAULT_CONFIG, [], 'X')), JSON.stringify([]));
});

test('shadowToEffects parses plain rgb() (no alpha) color', () => {
  const e = FM.shadowToEffects('0 1px 2px rgb(255,0,0)');
  assert.equal(JSON.stringify(e[0].color), JSON.stringify({ r: 1, g: 0, b: 0, a: 1 }));
  assert.equal(JSON.stringify(e[0].offset), JSON.stringify({ x: 0, y: 1 }));
  assert.equal(e[0].radius, 2);
  assert.equal(e[0].spread, 0);
});

test('shadowToEffects parses 3-digit hex color and does not leak NaN lengths', () => {
  const e = FM.shadowToEffects('0 0 4px #f00');
  assert.equal(JSON.stringify(e[0].color), JSON.stringify({ r: 1, g: 0, b: 0, a: 1 }));
  assert.equal(e[0].radius, 4);
  assert.equal(JSON.stringify(e[0].offset), JSON.stringify({ x: 0, y: 0 }));
});

test('textStylePlan falls back to Regular style for unknown weight keys', () => {
  const plan = FM.textStylePlan(C.DEFAULT_CONFIG, ['bogus'], 'Pretendard');
  const first = plan.find(p => p.name.endsWith('/bogus'));
  assert.ok(first);
  assert.equal(first.fontName.style, 'Regular');
});
