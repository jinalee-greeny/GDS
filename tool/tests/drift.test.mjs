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
