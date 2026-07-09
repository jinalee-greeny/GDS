(function (root) {
  'use strict';

  function hexToFigmaRGB(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16) / 255,
      g: parseInt(hex.slice(3, 5), 16) / 255,
      b: parseInt(hex.slice(5, 7), 16) / 255
    };
  }

  var GROUP_KEYS = ['color','space','radius','borderWidth','fontSize','opacity',
    'lineHeight','zIndex','breakpoint','duration','fontFamily','fontWeight',
    'letterSpacing','easing','shadow'];

  var FLOAT_GROUPS = { space:1, radius:1, borderWidth:1, fontSize:1, opacity:1,
    lineHeight:1, zIndex:1, breakpoint:1, duration:1 };
  var STRING_GROUPS = { fontFamily:1, fontWeight:1, letterSpacing:1, easing:1, shadow:1 };

  function toFloat(v) { return parseFloat(v); } // 'px'/'ms'/'0.4'/'1.25' -> number

  function variablesPlan(config, selection, C) {
    var sel = {};
    (selection || []).forEach(function (k) { sel[k] = 1; });
    var out = [];
    if (sel.color) {
      var ramps = C.buildAllRamps(config);
      config.color.order.forEach(function (hue) {
        config.steps.forEach(function (step) {
          out.push({ name: 'color/' + hue + '/' + step, type: 'COLOR',
            value: hexToFigmaRGB(ramps[hue][step]) });
        });
      });
      out.push({ name: 'color/base/white', type: 'COLOR', value: hexToFigmaRGB(config.color.base.white) });
      out.push({ name: 'color/base/black', type: 'COLOR', value: hexToFigmaRGB(config.color.base.black) });
    }
    GROUP_KEYS.forEach(function (g) {
      if (g === 'color' || !sel[g]) return;
      var group = config[g];
      if (!group) return;
      Object.keys(group).forEach(function (key) {
        var raw = group[key];
        if (FLOAT_GROUPS[g]) out.push({ name: g + '/' + key, type: 'FLOAT', value: toFloat(raw) });
        else if (STRING_GROUPS[g]) out.push({ name: g + '/' + key, type: 'STRING', value: String(raw) });
      });
    });
    return out;
  }

  var FigmaMap = { hexToFigmaRGB: hexToFigmaRGB, variablesPlan: variablesPlan, GROUP_KEYS: GROUP_KEYS };
  root.FigmaMap = FigmaMap;
  if (typeof module !== 'undefined' && module.exports) module.exports = FigmaMap;
})(typeof window !== 'undefined' ? window : globalThis);
