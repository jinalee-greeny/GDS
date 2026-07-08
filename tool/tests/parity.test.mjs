import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCore } from './helpers.mjs';

const core = loadCore();
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

test('toDTCG matches committed tokens/tokens.json exactly', () => {
  assert.equal(core.toDTCG(core.DEFAULT_CONFIG), read('tokens/tokens.json'));
});
