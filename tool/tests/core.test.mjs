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

test('buildAllRamps returns the stored manual scales', () => {
  const ramps = core.buildAllRamps(core.DEFAULT_CONFIG);
  const grayExpected = {'50':'#F5F6F8','100':'#E9EBEF','200':'#D7D9DF','300':'#BDC0C7','400':'#A1A4AC','500':'#898B92','600':'#72747B','700':'#5D5F65','800':'#494A4E','900':'#35373A'};
  const redExpected = {'50':'#FFE8E1','100':'#FFD1C5','200':'#FFAC9E','300':'#FF8477','400':'#FF5D53','500':'#F0443E','600':'#CC3430','700':'#AA2825','800':'#85201D','900':'#621A16'};
  const blueExpected = {'50':'#DEF8FF','100':'#BFEFFF','200':'#91DDFF','300':'#63C2FF','400':'#36A4FF','500':'#1B8AFF','600':'#0A72DA','700':'#035EB6','800':'#07498E','900':'#0A3668'};
  assert.equal(JSON.stringify(ramps.gray), JSON.stringify(grayExpected));
  assert.equal(JSON.stringify(ramps.red), JSON.stringify(redExpected));
  assert.equal(JSON.stringify(ramps.blue), JSON.stringify(blueExpected));
  // single-value scales are one-step maps
  assert.equal(JSON.stringify(ramps.black), JSON.stringify({ base: '#000000' }));
  // alpha scales carry #RRGGBBAA values
  assert.equal(ramps['black-alpha']['40'], '#00000066');
  assert.equal(core.DEFAULT_CONFIG.color.order.length, 8);
});

test('cloneConfig returns an independent deep copy', () => {
  const c = core.cloneConfig(core.DEFAULT_CONFIG);
  c.color.scales.blue['500'] = '#000000';
  assert.equal(core.DEFAULT_CONFIG.color.scales.blue['500'], '#1B8AFF');
});

test('contrastReport reproduces GUIDE.md AA results', () => {
  const rep = core.contrastReport(core.DEFAULT_CONFIG);
  const by = Object.fromEntries(rep.map(r => [r.hue, r]));
  // Order-based first/last passing step (manual model). gray/red/blue: white=600/black=500.
  for (const h of ['gray','red','blue']) {
    assert.equal(by[h].whiteMinStep, '600', h + ' whiteMinStep');
    assert.equal(by[h].blackMaxStep, '500', h + ' blackMaxStep');
  }
  assert.equal(by.green.whiteMinStep, '700');
  assert.equal(by.green.blackMaxStep, '600');
  // single-value scales: black passes on white only, white on black only
  assert.equal(by.black.whiteMinStep, 'base');
  assert.equal(by.black.blackMaxStep, '—');
  assert.equal(by.white.whiteMinStep, '—');
  assert.equal(by.white.blackMaxStep, 'base');
});

test('store setPath / undo / redo / dirty', () => {
  const s = core.createStore();
  assert.equal(s.isDirty(), false);
  assert.equal(s.canUndo(), false);
  s.setPath(['color','scales','blue','500'], '#123456');
  assert.equal(s.get().color.scales.blue['500'], '#123456');
  assert.equal(s.isDirty(), true);
  assert.equal(s.canUndo(), true);
  s.undo();
  assert.equal(s.get().color.scales.blue['500'], '#1B8AFF');
  assert.equal(s.isDirty(), false);
  s.redo();
  assert.equal(s.get().color.scales.blue['500'], '#123456');
});

test('store resetGroup restores one group only', () => {
  const s = core.createStore();
  s.setPath(['color','scales','blue','500'], '#123456');
  s.setPath(['space','4'], '20px');
  s.resetGroup('color');
  assert.equal(s.get().color.scales.blue['500'], '#1B8AFF');
  assert.equal(s.get().space['4'], '20px'); // untouched
});

test('store subscribe fires on mutation', () => {
  const s = core.createStore();
  let calls = 0;
  const off = s.subscribe(() => { calls++; });
  s.setPath(['space','4'], '20px');
  assert.equal(calls, 1);
  off();
  s.setPath(['space','4'], '24px');
  assert.equal(calls, 1);
});
