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

function indexByName(styles) {
  var map = {};
  for (var i = 0; i < styles.length; i++) map[styles[i].name] = styles[i];
  return map;
}

function applyVariables(config, selection, acc) {
  var plan = FigmaMap.variablesPlan(config, selection, TokenCore);
  var collection = getOrCreateCollection('Foundations');
  var modeId = collection.modes[0].modeId;
  var existing = indexVariables(collection);
  for (var i = 0; i < plan.length; i++) {
    var item = plan[i];
    try {
      var v = existing[item.name];
      if (v && v.resolvedType !== TYPE_MAP[item.type]) {
        // type changed — remove and recreate to avoid setValueForMode type error
        v.remove(); v = null;
      }
      var isNew = !v;
      if (isNew) v = figma.variables.createVariable(item.name, collection, TYPE_MAP[item.type]);
      v.setValueForMode(modeId, item.value);
      // count only after the write succeeds; on throw the item lands only in failed[]
      if (isNew) acc.created++; else acc.updated++;
    } catch (e) { acc.failed.push({ name: item.name, error: (e && e.message) ? e.message : String(e) }); }
  }
}

async function applyEffectStyles(config, acc) {
  var plan = FigmaMap.effectStylePlan(config);
  var existing = indexByName(await figma.getLocalEffectStylesAsync());
  for (var i = 0; i < plan.length; i++) {
    var item = plan[i];
    try {
      var s = existing[item.name], isNew = !s;
      if (isNew) { s = figma.createEffectStyle(); s.name = item.name; }
      s.effects = item.effects;
      if (isNew) acc.created++; else acc.updated++;
    } catch (e) { acc.failed.push({ name: item.name, error: (e && e.message) ? e.message : String(e) }); }
  }
}

async function applyTextStyles(config, textOptions, acc) {
  var plan = FigmaMap.textStylePlan(config, textOptions.weights, textOptions.family);
  var existing = indexByName(await figma.getLocalTextStylesAsync());
  for (var i = 0; i < plan.length; i++) {
    var item = plan[i];
    try {
      await figma.loadFontAsync(item.fontName);
      var s = existing[item.name], isNew = !s;
      if (isNew) { s = figma.createTextStyle(); s.name = item.name; }
      s.fontName = item.fontName;
      s.fontSize = item.fontSize;
      s.lineHeight = item.lineHeight;
      s.letterSpacing = item.letterSpacing;
      if (isNew) acc.created++; else acc.updated++;
    } catch (e) {
      var m = (e && e.message) ? e.message : String(e);
      acc.failed.push({ name: item.name, error: '폰트 \'' + item.fontName.family + ' ' + item.fontName.style + '\'을 사용할 수 없습니다: ' + m });
    }
  }
}

async function applyPlan(config, selection, targets, textOptions) {
  var acc = { created: 0, updated: 0, failed: [] };
  targets = targets || { variables: true };
  if (targets.variables) applyVariables(config, selection, acc);
  if (targets.effectStyles) await applyEffectStyles(config, acc);
  if (targets.textStyles) await applyTextStyles(config, textOptions || { weights: [], family: '' }, acc);
  return acc;
}

figma.ui.onmessage = async function (msg) {
  if (!msg || msg.type !== 'apply') return;
  var result;
  try {
    result = await applyPlan(msg.config, msg.selection, msg.targets, msg.textOptions);
  } catch (e) {
    result = { created: 0, updated: 0, failed: [{ name: '(apply)', error: (e && e.message) ? e.message : String(e) }] };
  }
  figma.ui.postMessage({ type: 'result', created: result.created, updated: result.updated, failed: result.failed });
};
