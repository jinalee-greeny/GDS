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

test('toCSS matches committed build/tokens.css exactly', () => {
  assert.equal(core.toCSS(core.DEFAULT_CONFIG), read('build/tokens.css'));
});

test('toTailwind matches committed build/tailwind.preset.js exactly', () => {
  assert.equal(core.toTailwind(core.DEFAULT_CONFIG), read('build/tailwind.preset.js'));
});

test('toFigma matches committed build/tokens.figma.json exactly', () => {
  assert.equal(core.toFigma(core.DEFAULT_CONFIG), read('build/tokens.figma.json'));
});
