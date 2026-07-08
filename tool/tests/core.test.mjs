import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './helpers.mjs';

const core = loadCore();

test('pyRound uses banker\'s rounding (round half to even)', () => {
  assert.equal(core.pyRound(0.5), 0);
  assert.equal(core.pyRound(1.5), 2);
  assert.equal(core.pyRound(2.5), 2);
  assert.equal(core.pyRound(2.4), 2);
  assert.equal(core.pyRound(2.6), 3);
  assert.equal(core.pyRound(-0.5), 0);
});

test('hexof matches Python OKLCH output for known blue steps', () => {
  // blue hue=255; shared curves Lc/Cm; Cpk=0.180 (see build_tokens.py)
  // step 500 -> Lc=0.638, Cm=1.10 -> #1B8AFF ; step 50 -> Lc=0.972, Cm=0.30 -> #DEF8FF
  assert.equal(core.hexof(0.638, 0.180 * 1.10, 255), '#1B8AFF');
  assert.equal(core.hexof(0.972, 0.180 * 0.30, 255), '#DEF8FF');
  assert.equal(core.hexof(0.262, 0.180 * 0.42, 255), '#062448'); // step 950
});
