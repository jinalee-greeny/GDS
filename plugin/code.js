// ---- pure, DOM-free core. Exposed on window.TokenCore and module.exports ----
(function (root) {
  'use strict';

  // Python round(): round half to even
  function pyRound(x) {
    var f = Math.floor(x);
    var diff = x - f;
    if (diff < 0.5) return f;
    if (diff > 0.5) return f + 1;
    return (f % 2 === 0) ? f : f + 1;
  }

  // OKLCH -> sRGB (ported verbatim from build_tokens.py)
  function oklchToSrgb(L, C, Hdeg) {
    var h = Hdeg * Math.PI / 180;
    var a = C * Math.cos(h), b = C * Math.sin(h);
    var l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    var m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    var s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    var r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    var bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    function enc(x) {
      x = Math.max(0, Math.min(1, x));
      return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    }
    return [r, g, bb].map(function (v) { return pyRound(enc(v) * 255); });
  }

  function hex2(n) { return ('0' + n.toString(16).toUpperCase()).slice(-2); }
  function hexof(L, C, Hdeg) {
    var rgb = oklchToSrgb(L, C, Hdeg);
    return '#' + hex2(rgb[0]) + hex2(rgb[1]) + hex2(rgb[2]);
  }

  var DEFAULT_CONFIG = {
    steps: [50,100,200,300,400,500,600,700,800,900,950],
    curves: {
      Lc: [0.972,0.940,0.885,0.808,0.720,0.638,0.560,0.487,0.410,0.335,0.262],
      Cm: [0.30,0.55,0.85,1.05,1.15,1.10,1.00,0.88,0.72,0.55,0.42]
    },
    color: {
      order: ['gray','red','orange','amber','green','teal','blue','violet','pink'],
      palettes: {
        gray:{H:268,Cpk:0.010}, red:{H:27,Cpk:0.190}, orange:{H:55,Cpk:0.170},
        amber:{H:82,Cpk:0.165}, green:{H:150,Cpk:0.150}, teal:{H:185,Cpk:0.120},
        blue:{H:255,Cpk:0.180}, violet:{H:290,Cpk:0.190}, pink:{H:350,Cpk:0.185}
      },
      base: { white:'#FFFFFF', black:'#000000' }
    },
    fontFamily: {
      sans: "Pretendard, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      serif: "'Noto Serif KR', Georgia, 'Times New Roman', serif",
      mono: "'JetBrains Mono', SFMono-Regular, Menlo, Consolas, monospace"
    },
    fontSize: {'2xs':'11px','xs':'12px','sm':'14px','md':'16px','lg':'18px','xl':'20px',
               '2xl':'24px','3xl':'30px','4xl':'36px','5xl':'48px','6xl':'60px'},
    fontWeight: {regular:'400',medium:'500',semibold:'600',bold:'700'},
    lineHeight: {none:'1',tight:'1.25',snug:'1.375',normal:'1.5',relaxed:'1.625',loose:'2'},
    letterSpacing: {tighter:'-0.05em',tight:'-0.025em',normal:'0em',wide:'0.025em',wider:'0.05em'},
    space: {'0':'0px','1':'4px','2':'8px','3':'12px','4':'16px','5':'20px','6':'24px','8':'32px',
            '10':'40px','12':'48px','16':'64px','20':'80px','24':'96px'},
    radius: {none:'0px',xs:'2px',sm:'4px',md:'6px',lg:'8px',xl:'12px','2xl':'16px','3xl':'24px',full:'9999px'},
    borderWidth: {none:'0px',sm:'1px',md:'2px',lg:'4px'},
    opacity: {'0':'0','5':'0.05','10':'0.1','20':'0.2','40':'0.4','60':'0.6','80':'0.8','100':'1'},
    shadow: {sm:'0 1px 2px rgba(0,0,0,0.08)',md:'0 2px 6px rgba(0,0,0,0.10)',lg:'0 6px 16px rgba(0,0,0,0.12)',
             xl:'0 12px 28px rgba(0,0,0,0.16)','2xl':'0 24px 48px rgba(0,0,0,0.20)'},
    zIndex: {base:'0',dropdown:'1000',sticky:'1100',overlay:'1300',modal:'1400',popover:'1500',toast:'1600',tooltip:'1700'},
    breakpoint: {sm:'640px',md:'768px',lg:'1024px',xl:'1280px','2xl':'1536px'},
    duration: {fast:'100ms',base:'200ms',slow:'300ms',slower:'500ms'},
    easing: {standard:'cubic-bezier(0.4,0,0.2,1)',decelerate:'cubic-bezier(0,0,0.2,1)',
             accelerate:'cubic-bezier(0.4,0,1,1)',linear:'linear'}
  };

  function cloneConfig(cfg) { return JSON.parse(JSON.stringify(cfg)); }

  function buildRamp(hue, cpk, Lc, Cm) {
    var out = {};
    for (var i = 0; i < DEFAULT_CONFIG.steps.length; i++) {
      var step = DEFAULT_CONFIG.steps[i];
      out[String(step)] = hexof(Lc[i], cpk * Cm[i], hue);
    }
    return out;
  }

  function buildAllRamps(cfg) {
    var out = {};
    cfg.color.order.forEach(function (name) {
      var p = cfg.color.palettes[name];
      out[name] = buildRamp(p.H, p.Cpk, cfg.curves.Lc, cfg.curves.Cm);
    });
    return out;
  }

  function toCSS(cfg) {
    var ramps = buildAllRamps(cfg);
    var L = [':root {'];
    var push = function (name, val) { L.push('  --' + name + ': ' + val + ';'); };
    cfg.color.order.forEach(function (name) {
      Object.keys(ramps[name]).forEach(function (s) { push('color-' + name + '-' + s, ramps[name][s]); });
    });
    push('color-white', cfg.color.base.white);
    push('color-black', cfg.color.base.black);
    var each = function (obj, pre) { Object.keys(obj).forEach(function (k) { push(pre + k, obj[k]); }); };
    each(cfg.fontFamily, 'font-');
    each(cfg.fontSize, 'font-size-');
    each(cfg.fontWeight, 'font-weight-');
    each(cfg.lineHeight, 'leading-');
    each(cfg.letterSpacing, 'tracking-');
    each(cfg.space, 'space-');
    each(cfg.radius, 'radius-');
    each(cfg.borderWidth, 'border-');
    each(cfg.opacity, 'opacity-');
    each(cfg.shadow, 'shadow-');
    each(cfg.zIndex, 'z-');
    each(cfg.breakpoint, 'bp-');
    each(cfg.duration, 'duration-');
    each(cfg.easing, 'ease-');
    L.push('}');
    return L.join('\n') + '\n';
  }

  var DTCG_DESC = 'Master Design System Preset — Foundations (primitive layer). Platform-agnostic, DTCG-aligned.';
  function grp(obj, ttype) {
    var out = {};
    Object.keys(obj).forEach(function (k) { out[k] = { $type: ttype, $value: obj[k] }; });
    return out;
  }
  function toDTCG(cfg) {
    var ramps = buildAllRamps(cfg);
    var color = {};
    cfg.color.order.forEach(function (name) {
      var g = {};
      Object.keys(ramps[name]).forEach(function (s) { g[s] = { $type: 'color', $value: ramps[name][s] }; });
      color[name] = g;
    });
    color.base = grp(cfg.color.base, 'color');
    var dtcg = {
      $description: DTCG_DESC,
      color: color,
      font: { family: grp(cfg.fontFamily, 'fontFamily'), size: grp(cfg.fontSize, 'dimension'), weight: grp(cfg.fontWeight, 'fontWeight') },
      lineHeight: grp(cfg.lineHeight, 'number'),
      letterSpacing: grp(cfg.letterSpacing, 'dimension'),
      space: grp(cfg.space, 'dimension'),
      radius: grp(cfg.radius, 'dimension'),
      borderWidth: grp(cfg.borderWidth, 'dimension'),
      opacity: grp(cfg.opacity, 'number'),
      shadow: grp(cfg.shadow, 'shadow'),
      zIndex: grp(cfg.zIndex, 'number'),
      breakpoint: grp(cfg.breakpoint, 'dimension'),
      duration: grp(cfg.duration, 'duration'),
      easing: grp(cfg.easing, 'cubicBezier')
    };
    return JSON.stringify(dtcg, null, 2);
  }

  function toTailwind(cfg) {
    var ramps = buildAllRamps(cfg);
    var colors = {};
    cfg.color.order.forEach(function (name) { colors[name] = ramps[name]; });
    colors.white = cfg.color.base.white;
    colors.black = cfg.color.base.black;
    var tw = { theme: { extend: {
      colors: colors,
      fontFamily: cfg.fontFamily,
      fontSize: cfg.fontSize,
      fontWeight: cfg.fontWeight,
      lineHeight: cfg.lineHeight,
      letterSpacing: cfg.letterSpacing,
      spacing: cfg.space,
      borderRadius: cfg.radius,
      borderWidth: cfg.borderWidth,
      opacity: cfg.opacity,
      boxShadow: cfg.shadow,
      zIndex: cfg.zIndex,
      screens: cfg.breakpoint,
      transitionDuration: cfg.duration,
      transitionTimingFunction: cfg.easing
    } } };
    return '// Tailwind preset generated from tokens.json (SSOT)\nmodule.exports = ' + JSON.stringify(tw, null, 2) + ';\n';
  }

  function tsGrp(obj, type) {
    var out = {};
    Object.keys(obj).forEach(function (k) { out[k] = { value: obj[k], type: type }; });
    return out;
  }
  function toFigma(cfg) {
    var ramps = buildAllRamps(cfg);
    var color = {};
    cfg.color.order.forEach(function (name) {
      var g = {};
      Object.keys(ramps[name]).forEach(function (s) { g[s] = { value: ramps[name][s], type: 'color' }; });
      color[name] = g;
    });
    color.base = { white: { value: cfg.color.base.white, type: 'color' }, black: { value: cfg.color.base.black, type: 'color' } };
    var out = {
      color: color,
      fontFamilies: tsGrp(cfg.fontFamily, 'fontFamilies'),
      fontSizes: tsGrp(cfg.fontSize, 'fontSizes'),
      fontWeights: tsGrp(cfg.fontWeight, 'fontWeights'),
      lineHeights: tsGrp(cfg.lineHeight, 'lineHeights'),
      letterSpacing: tsGrp(cfg.letterSpacing, 'letterSpacing'),
      spacing: tsGrp(cfg.space, 'spacing'),
      borderRadius: tsGrp(cfg.radius, 'borderRadius'),
      borderWidth: tsGrp(cfg.borderWidth, 'borderWidth'),
      opacity: tsGrp(cfg.opacity, 'opacity'),
      boxShadow: tsGrp(cfg.shadow, 'boxShadow')
    };
    return JSON.stringify(out, null, 2);
  }

  function relLuminance(hex) {
    var ch = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16) / 255; });
    var f = function (c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(ch[0]) + 0.7152 * f(ch[1]) + 0.0722 * f(ch[2]);
  }

  function contrastRatio(a, b) {
    var la = relLuminance(a), lb = relLuminance(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  function contrastReport(cfg) {
    var ramps = buildAllRamps(cfg);
    var hues = ['gray'].concat(cfg.color.order.filter(function (n) { return n !== 'gray'; }));
    return hues.map(function (name) {
      var ramp = ramps[name];
      var steps = Object.keys(ramp);
      var onWhite = steps.filter(function (s) { return contrastRatio(ramp[s], '#FFFFFF') >= 4.5; });
      var onBlack = steps.filter(function (s) { return contrastRatio(ramp[s], '#000000') >= 4.5; });
      var minS = onWhite.length ? String(Math.min.apply(null, onWhite.map(Number))) : '—';
      var maxS = onBlack.length ? String(Math.max.apply(null, onBlack.map(Number))) : '—';
      return { hue: name, whiteMinStep: minS, blackMaxStep: maxS };
    });
  }

  function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function createStore(initial) {
    var current = cloneConfig(initial || DEFAULT_CONFIG);
    var undoStack = [], redoStack = [], subs = [];
    function notify() { subs.forEach(function (fn) { fn(current); }); }
    function commit(next) {
      undoStack.push(current);
      redoStack = [];
      current = next;
      notify();
    }
    function setPath(path, value) {
      var next = cloneConfig(current), node = next;
      for (var i = 0; i < path.length - 1; i++) node = node[path[i]];
      node[path[path.length - 1]] = value;
      commit(next);
    }
    return {
      get: function () { return current; },
      setPath: setPath,
      undo: function () { if (!undoStack.length) return false; redoStack.push(current); current = undoStack.pop(); notify(); return true; },
      redo: function () { if (!redoStack.length) return false; undoStack.push(current); current = redoStack.pop(); notify(); return true; },
      canUndo: function () { return undoStack.length > 0; },
      canRedo: function () { return redoStack.length > 0; },
      isDirty: function () { return !deepEqual(current, DEFAULT_CONFIG); },
      resetAll: function () { commit(cloneConfig(DEFAULT_CONFIG)); },
      resetGroup: function (key) { var next = cloneConfig(current); next[key] = cloneConfig(DEFAULT_CONFIG[key]); commit(next); },
      loadConfig: function (cfg) { commit(cloneConfig(cfg)); },
      subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (s) { return s !== fn; }); }; }
    };
  }

  var TokenCore = { pyRound: pyRound, oklchToSrgb: oklchToSrgb, hexof: hexof,
    DEFAULT_CONFIG: DEFAULT_CONFIG, cloneConfig: cloneConfig,
    buildRamp: buildRamp, buildAllRamps: buildAllRamps, toCSS: toCSS, toDTCG: toDTCG, toTailwind: toTailwind, toFigma: toFigma,
    relLuminance: relLuminance, contrastRatio: contrastRatio, contrastReport: contrastReport, createStore: createStore };
  root.TokenCore = TokenCore;
  if (typeof module !== 'undefined' && module.exports) module.exports = TokenCore;
})(typeof window !== 'undefined' ? window : globalThis);
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
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  function shadowToEffects(css) {
    return splitTopLevel(css).map(function (part) {
      var s = part.trim();
      var color = parseShadowColor(s);
      // strip the color token, then read leading length numbers: x y blur [spread]
      var lengths = s.replace(/rgba?\([^)]+\)/i, '').replace(/#[0-9a-f]{6}/i, '')
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
      var isNew = !v;
      if (isNew) v = figma.variables.createVariable(item.name, collection, TYPE_MAP[item.type]);
      v.setValueForMode(modeId, item.value);
      // count only after the write succeeds; on throw the item lands only in failed[]
      if (isNew) created++; else updated++;
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
