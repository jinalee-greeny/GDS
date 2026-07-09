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

  var WEIGHT_STYLE_MAP = { regular: 'Regular', medium: 'Medium', semibold: 'SemiBold', bold: 'Bold' };

  // split on commas that are NOT inside parentheses (rgba(...) contains commas)
  function splitTopLevel(s) {
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    if (cur.trim() !== '') out.push(cur);
    return out;
  }

  function parseShadowColor(token) {
    var m = token.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      var parts = m[1].split(',').map(function (p) { return parseFloat(p); });
      return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255, a: parts.length > 3 ? parts[3] : 1 };
    }
    var hx = token.match(/#([0-9a-f]{6})/i);
    if (hx) {
      var h = hx[1];
      return { r: parseInt(h.slice(0,2),16)/255, g: parseInt(h.slice(2,4),16)/255, b: parseInt(h.slice(4,6),16)/255, a: 1 };
    }
    var hx3 = token.match(/#([0-9a-f])([0-9a-f])([0-9a-f])\b/i);
    if (hx3) {
      var h6 = hx3[1] + hx3[1] + hx3[2] + hx3[2] + hx3[3] + hx3[3];
      return { r: parseInt(h6.slice(0,2),16)/255, g: parseInt(h6.slice(2,4),16)/255, b: parseInt(h6.slice(4,6),16)/255, a: 1 };
    }
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  function shadowToEffects(css) {
    return splitTopLevel(css).map(function (part) {
      var s = part.trim();
      var color = parseShadowColor(s);
      // strip the color token, then read leading length numbers: x y blur [spread]
      var lengths = s.replace(/rgba?\([^)]+\)/i, '').replace(/#[0-9a-f]{6}|#[0-9a-f]{3}\b/i, '')
        .trim().split(/\s+/).filter(function (t) { return t !== ''; })
        .map(function (t) { return parseFloat(t); });
      return {
        type: 'DROP_SHADOW',
        color: color,
        offset: { x: lengths[0] || 0, y: lengths[1] || 0 },
        radius: lengths[2] || 0,
        spread: lengths[3] || 0,
        visible: true,
        blendMode: 'NORMAL'
      };
    });
  }

  function effectStylePlan(config) {
    return Object.keys(config.shadow).map(function (key) {
      return { name: 'shadow/' + key, effects: shadowToEffects(config.shadow[key]) };
    });
  }

  function textStylePlan(config, weights, family) {
    var out = [];
    var lh = parseFloat(config.lineHeight.normal) * 100;
    var ls = parseFloat(config.letterSpacing.normal) * 100; // em -> percent
    Object.keys(config.fontSize).forEach(function (sizeKey) {
      (weights || []).forEach(function (wKey) {
        out.push({
          name: 'text/' + sizeKey + '/' + wKey,
          fontSize: parseFloat(config.fontSize[sizeKey]),
          fontName: { family: family, style: WEIGHT_STYLE_MAP[wKey] || 'Regular' },
          lineHeight: { unit: 'PERCENT', value: lh },
          letterSpacing: { unit: 'PERCENT', value: ls }
        });
      });
    });
    return out;
  }

  var FigmaMap = { hexToFigmaRGB: hexToFigmaRGB, variablesPlan: variablesPlan, GROUP_KEYS: GROUP_KEYS,
    shadowToEffects: shadowToEffects, effectStylePlan: effectStylePlan, textStylePlan: textStylePlan, WEIGHT_STYLE_MAP: WEIGHT_STYLE_MAP };
  root.FigmaMap = FigmaMap;
  if (typeof module !== 'undefined' && module.exports) module.exports = FigmaMap;
})(typeof window !== 'undefined' ? window : globalThis);
