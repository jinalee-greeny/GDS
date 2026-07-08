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

test('buildAllRamps reproduces committed gray, red, blue ramps', () => {
  const ramps = core.buildAllRamps(core.DEFAULT_CONFIG);
  const grayExpected = {'50':'#F5F6F8','100':'#E9EBEF','200':'#D7D9DF','300':'#BDC0C7','400':'#A1A4AC','500':'#898B92','600':'#72747B','700':'#5D5F65','800':'#494A4E','900':'#35373A','950':'#242427'};
  const redExpected = {'50':'#FFE8E1','100':'#FFD1C5','200':'#FFAC9E','300':'#FF8477','400':'#FF5D53','500':'#F0443E','600':'#CC3430','700':'#AA2825','800':'#85201D','900':'#621A16','950':'#43100D'};
  const blueExpected = {'50':'#DEF8FF','100':'#BFEFFF','200':'#91DDFF','300':'#63C2FF','400':'#36A4FF','500':'#1B8AFF','600':'#0A72DA','700':'#035EB6','800':'#07498E','900':'#0A3668','950':'#062448'};
  assert.equal(JSON.stringify(ramps.gray), JSON.stringify(grayExpected));
  assert.equal(JSON.stringify(ramps.red), JSON.stringify(redExpected));
  assert.equal(JSON.stringify(ramps.blue), JSON.stringify(blueExpected));
  assert.equal(core.DEFAULT_CONFIG.color.order.length, 9);
});

test('cloneConfig returns an independent deep copy', () => {
  const c = core.cloneConfig(core.DEFAULT_CONFIG);
  c.color.palettes.blue.H = 200;
  assert.equal(core.DEFAULT_CONFIG.color.palettes.blue.H, 255);
});

test('contrastReport reproduces GUIDE.md AA results', () => {
  const rep = core.contrastReport(core.DEFAULT_CONFIG);
  const by = Object.fromEntries(rep.map(r => [r.hue, r]));
  // From docs/GUIDE.md: most hues white=600/black=500; green & teal white=700/black=600
  for (const h of ['gray','red','orange','amber','blue','violet','pink']) {
    assert.equal(by[h].whiteMinStep, '600', h + ' whiteMinStep');
    assert.equal(by[h].blackMaxStep, '500', h + ' blackMaxStep');
  }
  for (const h of ['green','teal']) {
    assert.equal(by[h].whiteMinStep, '700', h + ' whiteMinStep');
    assert.equal(by[h].blackMaxStep, '600', h + ' blackMaxStep');
  }
});

test('store setPath / undo / redo / dirty', () => {
  const s = core.createStore();
  assert.equal(s.isDirty(), false);
  assert.equal(s.canUndo(), false);
  s.setPath(['color','palettes','blue','H'], 200);
  assert.equal(s.get().color.palettes.blue.H, 200);
  assert.equal(s.isDirty(), true);
  assert.equal(s.canUndo(), true);
  s.undo();
  assert.equal(s.get().color.palettes.blue.H, 255);
  assert.equal(s.isDirty(), false);
  s.redo();
  assert.equal(s.get().color.palettes.blue.H, 200);
});

test('store resetGroup restores one group only', () => {
  const s = core.createStore();
  s.setPath(['color','palettes','blue','H'], 200);
  s.setPath(['space','4'], '20px');
  s.resetGroup('color');
  assert.equal(s.get().color.palettes.blue.H, 255);
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
