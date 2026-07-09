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

// applyPlan + its private helpers (TYPE_MAP, getOrCreateCollection, indexVariables) —
// source-sliced straight out of plugin/code.src.js (the real SSOT template source, not
// the generated plugin/code.js) between the `var TYPE_MAP` declaration and the
// `figma.ui.onmessage = ...` line (which runs at import time and must NOT be evaluated
// here — nor must the `figma.showUI(...)` call at the top of the file). This mirrors the
// slice+vm pattern in tool/tests/roundtrip.test.mjs: if applyPlan needed anything beyond
// the injected figma/FigmaMap/TokenCore globals, this eval would throw.
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

// Minimal figma.variables mock covering exactly what applyPlan/getOrCreateCollection/
// indexVariables touch: getLocalVariableCollections, createVariableCollection,
// createVariable (+ its returned variable's setValueForMode/remove), getVariableById.
// Created variables are tracked in `variablesById` so re-apply / removal can find them
// by id (via collection.variableIds) or by name (via indexVariables' own scan).
function createFigmaMock() {
  const collections = [];
  const variablesById = Object.create(null);
  let counter = 0;
  let throwForName = null; // configurable: setValueForMode throws for this variable name

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
    }
  };

  return {
    figma,
    collections,
    variablesById,
    setThrowForName(name) { throwForName = name; }
  };
}

const SELECTION = ['radius']; // small, deterministic group

test('applyPlan: first apply on an empty doc creates every plan item, updates none, fails none', () => {
  const mock = createFigmaMock();
  const applyPlan = loadApplyPlan(mock.figma);
  const plan = FM.variablesPlan(C.DEFAULT_CONFIG, SELECTION, C);

  const result = applyPlan(C.DEFAULT_CONFIG, SELECTION);

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

test('applyPlan: re-applying the same config/selection updates every item, creates none, no duplicate variables or collections (idempotent)', () => {
  const mock = createFigmaMock();
  const applyPlan = loadApplyPlan(mock.figma);
  const plan = FM.variablesPlan(C.DEFAULT_CONFIG, SELECTION, C);

  applyPlan(C.DEFAULT_CONFIG, SELECTION); // first apply
  const before = mock.collections[0].variableIds.slice().sort();

  const result = applyPlan(C.DEFAULT_CONFIG, SELECTION); // re-apply, identical input

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

test('applyPlan: a write failure lands the item only in failed[], not counted as created or updated', () => {
  const mock = createFigmaMock();
  const applyPlan = loadApplyPlan(mock.figma);
  const plan = FM.variablesPlan(C.DEFAULT_CONFIG, SELECTION, C);
  const badName = plan[0].name;
  mock.setThrowForName(badName);

  const result = applyPlan(C.DEFAULT_CONFIG, SELECTION);

  assert.equal(result.created, plan.length - 1);
  assert.equal(result.updated, 0);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].name, badName);
  assert.equal(typeof result.failed[0].error, 'string');
  assert.ok(result.failed[0].error.length > 0);
});

test('applyPlan: a resolvedType mismatch removes+recreates the variable, counting it as created (no duplicate)', () => {
  const mock = createFigmaMock();
  const plan = FM.variablesPlan(C.DEFAULT_CONFIG, SELECTION, C);
  const changedItem = plan[0];
  const wrongType = changedItem.type === 'STRING' ? 'FLOAT' : 'STRING';

  // Pre-seed the collection with a variable of the WRONG type for this name,
  // via the real figma.variables mock (mirrors how an existing Figma doc looks).
  const foundations = mock.figma.variables.createVariableCollection('Foundations');
  const oldVar = mock.figma.variables.createVariable(changedItem.name, foundations, wrongType);
  const oldId = oldVar.id;

  const applyPlan = loadApplyPlan(mock.figma);
  const result = applyPlan(C.DEFAULT_CONFIG, SELECTION);

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
