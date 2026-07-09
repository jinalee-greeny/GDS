import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

test('generated tool/index.html contains the canonical token-core verbatim', () => {
  const core = read('core/token-core.js').replace(/\n$/, '');
  assert.ok(read('tool/index.html').includes(core),
    'tool/index.html is stale — run `python3 build_apps.py`');
});

test('generated tool/index.html contains studio-ui.js and studio.css verbatim', () => {
  const ui = read('core/studio-ui.js').replace(/\n$/, '');
  const css = read('core/studio.css').replace(/\n$/, '');
  const html = read('tool/index.html');
  assert.ok(html.includes(ui), 'studio-ui drift — run build_apps.py');
  assert.ok(html.includes(css), 'studio.css drift — run build_apps.py');
});

test('generated plugin/ui.html contains token-core, studio-ui, figma-map and studio.css verbatim', () => {
  const core = read('core/token-core.js').replace(/\n$/, '');
  const ui = read('core/studio-ui.js').replace(/\n$/, '');
  const figmaMap = read('core/figma-map.js').replace(/\n$/, '');
  const css = read('core/studio.css').replace(/\n$/, '');
  const html = read('plugin/ui.html');
  assert.ok(html.includes(core), 'plugin/ui.html token-core drift — run build_apps.py');
  assert.ok(html.includes(ui), 'plugin/ui.html studio-ui drift — run build_apps.py');
  assert.ok(html.includes(figmaMap), 'plugin/ui.html figma-map drift — run build_apps.py');
  assert.ok(html.includes(css), 'plugin/ui.html studio.css drift — run build_apps.py');
});

test('generated plugin/code.js contains token-core and figma-map verbatim', () => {
  const core = read('core/token-core.js').replace(/\n$/, '');
  const figmaMap = read('core/figma-map.js').replace(/\n$/, '');
  const code = read('plugin/code.js');
  assert.ok(code.includes(core), 'plugin/code.js token-core drift — run build_apps.py');
  assert.ok(code.includes(figmaMap), 'plugin/code.js figma-map drift — run build_apps.py');
});
