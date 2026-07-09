import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadCore } from './helpers.mjs';

// TokenCore (real) via the shared helper.
const C = loadCore();

// FigmaMap (real) — loaded the same way tests load modules (see figma-map.test.mjs):
// vm-eval core/figma-map.js in a sandbox exposing window/module, then pull the export
// off whichever the IIFE attached to.
function loadFigmaMap() {
  const fmPath = fileURLToPath(new URL('../../core/figma-map.js', import.meta.url));
  const src = readFileSync(fmPath, 'utf8');
  const sandbox = { window: {}, module: { exports: {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'figma-map.js' });
  return sandbox.module.exports.variablesPlan ? sandbox.module.exports : sandbox.window.FigmaMap;
}
const FM = loadFigmaMap();

// applyPlan + its private helpers (TYPE_MAP, getOrCreateCollection, indexVariables,
// indexByName, applyVariables, applyEffectStyles, applyTextStyles) — source-sliced
// straight out of plugin/code.src.js (the real SSOT template source, not the generated
// plugin/code.js) between the `var TYPE_MAP` declaration and the `figma.ui.onmessage =
// ...` line (which runs at import time and must NOT be evaluated here — nor must the
// `figma.showUI(...)` call at the top of the file). This mirrors the slice+vm pattern in
// tool/tests/roundtrip.test.mjs: if applyPlan needed anything beyond the injected
// figma/FigmaMap/TokenCore globals, this eval would throw.
function loadApplyPlan(figmaMock) {
  const srcPath = fileURLToPath(new URL('../../plugin/code.src.js', import.meta.url));
  const src = readFileSync(srcPath, 'utf8');
  const start = src.indexOf('var TYPE_MAP');
  const end = src.indexOf('figma.ui.onmessage');
  if (start === -1 || end === -1) {
    throw new Error('applyPlan source region not found in plugin/code.src.js');
  }
  const region = src.slice(start, end);
  const sandbox = { figma: figmaMock, FigmaMap: FM, TokenCore: C, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(region + '\nglobalThis.applyPlan = applyPlan;', sandbox, { filename: 'applyPlan.js' });
  if (typeof sandbox.applyPlan !== 'function') {
    throw new Error('applyPlan did not evaluate to a function');
  }
  return sandbox.applyPlan;
}

// Full figma mock covering everything applyPlan/applyVariables/applyEffectStyles/
// applyTextStyles touch:
//  - variables: getLocalVariableCollections, createVariableCollection, createVariable
//    (+ its returned variable's setValueForMode/remove), getVariableById. Created
//    variables are tracked in `variablesById` so re-apply / removal can find them by id
//    (via collection.variableIds) or by name (via indexVariables' own scan).
//  - effect styles: getLocalEffectStyles/createEffectStyle, registry by id, name lookup
//    via indexByName. Returned style objects expose {id,name,effects,remove()}.
//  - text styles: getLocalTextStyles/createTextStyle, registry by id, same shape plus
//    {fontName,fontSize,lineHeight,letterSpacing}.
//  - loadFontAsync(fontName): resolves normally; rejects when fontName.family matches
//    the harness's configured `missingFamily` (tests the font-fail path in
//    applyTextStyles, which must catch the rejection and push a failed[] entry without
//    aborting the rest of the batch).
function createFigmaMock(opts) {
  opts = opts || {};
  const collections = [];
  const variablesById = Object.create(null);
  const effectStylesById = Object.create(null);
  const textStylesById = Object.create(null);
  let counter = 0;
  let throwForName = null; // configurable: setValueForMode throws for this variable name
  const missingFamily = opts.missingFamily || null;

  const figma = {
    variables: {
      getLocalVariableCollections() { return collections.slice(); },
      createVariableCollection(name) {
        const col = { name, modes: [{ modeId: 'm' }], variableIds: [] };
        collections.push(col);
        return col;
      },
      createVariable(name, collection, type) {
        counter += 1;
        const id = 'var-' + counter;
        const v = {
          id, name, resolvedType: type, values: {},
          setValueForMode(modeId, val) {
            if (throwForName && v.name === throwForName) {
              throw new Error('mock write failure: ' + v.name);
            }
            v.values[modeId] = val;
          },
          remove() {
            delete variablesById[v.id];
            const idx = collection.variableIds.indexOf(v.id);
            if (idx >= 0) collection.variableIds.splice(idx, 1);
          }
        };
        variablesById[id] = v;
        collection.variableIds.push(id);
        return v;
      },
      getVariableById(id) { return variablesById[id] || null; }
    },
    getLocalEffectStyles() { return Object.values(effectStylesById); },
    createEffectStyle() {
      counter += 1;
      const id = 'effect-' + counter;
      const s = {
        id, name: '', effects: [],
        remove() { delete effectStylesById[s.id]; }
      };
      effectStylesById[id] = s;
      return s;
    },
    getLocalTextStyles() { return Object.values(textStylesById); },
    createTextStyle() {
      counter += 1;
      const id = 'text-' + counter;
      const s = {
        id, name: '', fontName: null, fontSize: 0, lineHeight: null, letterSpacing: null,
        remove() { delete textStylesById[s.id]; }
      };
      textStylesById[id] = s;
      return s;
    },
    loadFontAsync(fontName) {
      if (missingFamily && fontName && fontName.family === missingFamily) {
        return Promise.reject(new Error('font not available: ' + fontName.family));
      }
      return Promise.resolve();
    }
  };

  return {
    figma,
    collections,
    variablesById,
    effectStylesById,
    textStylesById,
    setThrowForName(name) { throwForName = name; },
    _effectStyleCount() { return Object.keys(effectStylesById).length; },
    _textStyleCount() { return Object.keys(textStylesById).length; }
  };
}

// Shared harness factory: builds a fresh figma mock + the applyPlan sliced/eval'd
// against it, so every test starts from a clean, isolated sandbox.
function makeHarness(opts) {
  const mock = createFigmaMock(opts);
  const applyPlan = loadApplyPlan(mock.figma);
  return { applyPlan, figma: mock };
}

const SELECTION = ['radius']; // small, deterministic group
const ALL_OFF_TARGETS = { variables: false, textStyles: false, effectStyles: false };

test('applyPlan: first apply on an empty doc creates every plan item, updates none, fails none', async () => {
  const { applyPlan, figma: mock } = makeHarness();
  const plan = FM.variablesPlan(C.DEFAULT_CONFIG, SELECTION, C);

  const result = await applyPlan(C.DEFAULT_CONFIG, SELECTION, { variables: true, textStyles: false, effectStyles: false }, { weights: [], family: 'X' });

  assert.equal(result.created, plan.length);
  assert.equal(result.updated, 0);
  assert.equal(result.failed.length, 0);

  assert.equal(mock.collections.length, 1);
  const foundations = mock.collections[0];
  assert.equal(foundations.name, 'Foundations');
  assert.equal(foundations.variableIds.length, plan.length);

  // Every plan value landed in the (sole) mode of the newly created variables.
  const byName = {};
  foundations.variableIds.forEach((id) => {
    const v = mock.variablesById[id];
    byName[v.name] = v;
  });
  plan.forEach((item) => {
    const v = byName[item.name];
    assert.ok(v, 'missing variable for ' + item.name);
    assert.equal(v.resolvedType, item.type);
    assert.equal(JSON.stringify(v.values.m), JSON.stringify(item.value));
  });
});

test('applyPlan: re-applying the same config/selection updates every item, creates none, no duplicate variables or collections (idempotent)', async () => {
  const { applyPlan, figma: mock } = makeHarness();
  const plan = FM.variablesPlan(C.DEFAULT_CONFIG, SELECTION, C);
  const targets = { variables: true, textStyles: false, effectStyles: false };
  const textOptions = { weights: [], family: 'X' };

  await applyPlan(C.DEFAULT_CONFIG, SELECTION, targets, textOptions); // first apply
  const before = mock.collections[0].variableIds.slice().sort();

  const result = await applyPlan(C.DEFAULT_CONFIG, SELECTION, targets, textOptions); // re-apply, identical input

  assert.equal(result.updated, plan.length);
  assert.equal(result.created, 0);
  assert.equal(result.failed.length, 0);

  // getOrCreateCollection reused the existing 'Foundations' collection — no second one.
  assert.equal(mock.collections.length, 1);

  // No duplicate variables: same variable id set, same count, as after the first apply.
  const after = mock.collections[0].variableIds.slice().sort();
  assert.equal(mock.collections[0].variableIds.length, plan.length);
  assert.equal(JSON.stringify(after), JSON.stringify(before));
});

test('applyPlan: a write failure lands the item only in failed[], not counted as created or updated', async () => {
  const { applyPlan, figma: mock } = makeHarness();
  const plan = FM.variablesPlan(C.DEFAULT_CONFIG, SELECTION, C);
  const badName = plan[0].name;
  mock.setThrowForName(badName);

  const result = await applyPlan(C.DEFAULT_CONFIG, SELECTION, { variables: true, textStyles: false, effectStyles: false }, { weights: [], family: 'X' });

  assert.equal(result.created, plan.length - 1);
  assert.equal(result.updated, 0);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].name, badName);
  assert.equal(typeof result.failed[0].error, 'string');
  assert.ok(result.failed[0].error.length > 0);
});

test('applyPlan: a resolvedType mismatch removes+recreates the variable, counting it as created (no duplicate)', async () => {
  const { figma: mock } = makeHarness();
  const plan = FM.variablesPlan(C.DEFAULT_CONFIG, SELECTION, C);
  const changedItem = plan[0];
  const wrongType = changedItem.type === 'STRING' ? 'FLOAT' : 'STRING';

  // Pre-seed the collection with a variable of the WRONG type for this name,
  // via the real figma.variables mock (mirrors how an existing Figma doc looks).
  const foundations = mock.figma.variables.createVariableCollection('Foundations');
  const oldVar = mock.figma.variables.createVariable(changedItem.name, foundations, wrongType);
  const oldId = oldVar.id;

  const applyPlan = loadApplyPlan(mock.figma);
  const result = await applyPlan(C.DEFAULT_CONFIG, SELECTION, { variables: true, textStyles: false, effectStyles: false }, { weights: [], family: 'X' });

  assert.equal(result.created, plan.length); // type-changed item counted as created, not updated
  assert.equal(result.updated, 0);
  assert.equal(result.failed.length, 0);

  // No second collection created — the pre-seeded one was reused.
  assert.equal(mock.collections.length, 1);

  // Old variable is gone; no duplicate for that name.
  assert.equal(mock.variablesById[oldId], undefined);
  assert.equal(foundations.variableIds.length, plan.length);
  assert.ok(!foundations.variableIds.includes(oldId));

  const replacement = foundations.variableIds
    .map((id) => mock.variablesById[id])
    .find((v) => v.name === changedItem.name);
  assert.ok(replacement, 'replacement variable for ' + changedItem.name + ' not found');
  assert.equal(replacement.resolvedType, changedItem.type);
  assert.equal(JSON.stringify(replacement.values.m), JSON.stringify(changedItem.value));
});

test('apply with effectStyles target creates effect styles idempotently', async () => {
  const { applyPlan, figma } = makeHarness();
  const targets = { variables: false, textStyles: false, effectStyles: true };
  const r1 = await applyPlan(C.DEFAULT_CONFIG, [], targets, { weights: [], family: 'X' });
  assert.equal(r1.created, 5); // 5 shadow tokens
  assert.equal(r1.failed.length, 0);
  const r2 = await applyPlan(C.DEFAULT_CONFIG, [], targets, { weights: [], family: 'X' });
  assert.equal(r2.updated, 5);
  assert.equal(r2.created, 0);
  assert.equal(figma._effectStyleCount(), 5); // no duplicates
});

test('apply with textStyles target loads fonts and creates styles', async () => {
  const { applyPlan } = makeHarness();
  const targets = { variables: false, textStyles: true, effectStyles: false };
  const r = await applyPlan(C.DEFAULT_CONFIG, [], targets, { weights: ['regular'], family: 'Pretendard' });
  assert.equal(r.created, 11); // 11 sizes x 1 weight
  assert.equal(r.failed.length, 0);
});

test('text style with an unavailable font lands only in failed[], not counted', async () => {
  const { applyPlan, figma } = makeHarness({ missingFamily: 'Pretendard' });
  const targets = { variables: false, textStyles: true, effectStyles: false };
  const r = await applyPlan(C.DEFAULT_CONFIG, [], targets, { weights: ['regular'], family: 'Pretendard' });
  assert.equal(r.created, 0);
  assert.equal(r.failed.length, 11);
  assert.ok(/Pretendard/.test(r.failed[0].error));
});

test('variables still work through the targets gate', async () => {
  const { applyPlan } = makeHarness();
  const targets = { variables: true, textStyles: false, effectStyles: false };
  const r = await applyPlan(C.DEFAULT_CONFIG, ['radius'], targets, { weights: [], family: 'X' });
  assert.ok(r.created > 0);
});

test('apply with all targets off performs no writes and returns zeroed result', async () => {
  const { applyPlan, figma } = makeHarness();
  const r = await applyPlan(C.DEFAULT_CONFIG, SELECTION, ALL_OFF_TARGETS, { weights: [], family: 'X' });
  assert.equal(r.created, 0);
  assert.equal(r.updated, 0);
  assert.equal(r.failed.length, 0);
  assert.equal(figma.collections.length, 0);
});
