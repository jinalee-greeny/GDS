/*__TOKEN_CORE__*/
/*__FIGMA_MAP__*/

// Figma main thread. TokenCore + FigmaMap are injected above as globals.
figma.showUI(__html__, { width: 1200, height: 860, themeColors: true });

var TYPE_MAP = { COLOR: 'COLOR', FLOAT: 'FLOAT', STRING: 'STRING' };

function getOrCreateCollection(name) {
  var cols = figma.variables.getLocalVariableCollections();
  for (var i = 0; i < cols.length; i++) if (cols[i].name === name) return cols[i];
  return figma.variables.createVariableCollection(name);
}

function indexVariables(collection) {
  // name -> Variable, for existing variables in this collection
  var map = {};
  var ids = collection.variableIds;
  for (var i = 0; i < ids.length; i++) {
    var v = figma.variables.getVariableById(ids[i]);
    if (v) map[v.name] = v;
  }
  return map;
}

function applyPlan(config, selection) {
  var plan = FigmaMap.variablesPlan(config, selection, TokenCore);
  var collection = getOrCreateCollection('Foundations');
  var modeId = collection.modes[0].modeId;
  var existing = indexVariables(collection);
  var created = 0, updated = 0, failed = [];
  for (var i = 0; i < plan.length; i++) {
    var item = plan[i];
    try {
      var v = existing[item.name];
      if (v && v.resolvedType !== TYPE_MAP[item.type]) {
        // type changed — remove and recreate to avoid setValueForMode type error
        v.remove(); v = null;
      }
      if (!v) {
        v = figma.variables.createVariable(item.name, collection, TYPE_MAP[item.type]);
        created++;
      } else {
        updated++;
      }
      v.setValueForMode(modeId, item.value);
    } catch (e) {
      failed.push({ name: item.name, error: (e && e.message) ? e.message : String(e) });
    }
  }
  return { created: created, updated: updated, failed: failed };
}

figma.ui.onmessage = function (msg) {
  if (!msg || msg.type !== 'apply') return;
  var result;
  try {
    result = applyPlan(msg.config, msg.selection);
  } catch (e) {
    result = { created: 0, updated: 0, failed: [{ name: '(collection)', error: (e && e.message) ? e.message : String(e) }] };
  }
  figma.ui.postMessage({ type: 'result', created: result.created, updated: result.updated, failed: result.failed });
};
