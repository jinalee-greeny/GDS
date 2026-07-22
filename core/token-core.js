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
    // Manual color model: each scale is an ordered map of step-name -> hex,
    // fully user-editable (add/rename/delete scales and steps, edit values).
    // A single-value color (black/white) is just a one-step scale. Ramps are
    // stored, not generated — buildRamp/curves remain only for optional
    // "auto-fill from OKLCH" convenience.
    color: {
      order: ['black','white','black-alpha','white-alpha','gray','red','blue','green'],
      scales: {
        black: { base:'#000000' },
        white: { base:'#FFFFFF' },
        // Alpha scales: a base color at increasing opacity, stored as #RRGGBBAA
        // (dedicated tokens for overlays/scrims/tints — distinct from element opacity).
        'black-alpha': {'5':'#0000000D','10':'#0000001A','20':'#00000033','40':'#00000066','60':'#00000099','80':'#000000CC'},
        'white-alpha': {'5':'#FFFFFF0D','10':'#FFFFFF1A','20':'#FFFFFF33','40':'#FFFFFF66','60':'#FFFFFF99','80':'#FFFFFFCC'},
        gray:{'50':'#F5F6F8','100':'#E9EBEF','200':'#D7D9DF','300':'#BDC0C7','400':'#A1A4AC','500':'#898B92','600':'#72747B','700':'#5D5F65','800':'#494A4E','900':'#35373A'},
        red:{'50':'#FFE8E1','100':'#FFD1C5','200':'#FFAC9E','300':'#FF8477','400':'#FF5D53','500':'#F0443E','600':'#CC3430','700':'#AA2825','800':'#85201D','900':'#621A16'},
        blue:{'50':'#DEF8FF','100':'#BFEFFF','200':'#91DDFF','300':'#63C2FF','400':'#36A4FF','500':'#1B8AFF','600':'#0A72DA','700':'#035EB6','800':'#07498E','900':'#0A3668'},
        green:{'50':'#E1FFE6','100':'#C4FBCE','200':'#99F1AC','300':'#6BDC88','400':'#3DC267','500':'#21A651','600':'#0E8C41','700':'#067334','800':'#095A28','900':'#0C421E'}
      }
    },
    fontFamily: {
      sans: "Pretendard, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      serif: "Pretendard, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      mono: "Pretendard, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    },
    fontSize: {'xs':'12px','sm':'14px','md':'16px','lg':'18px','xl':'20px',
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

  // Manual model: ramps are the stored step->hex maps (values are the source
  // of truth, not generated). Kept as {scale: {step: hex}} so every downstream
  // consumer (preview, contrast, exporters) is unchanged.
  function buildAllRamps(cfg) {
    var out = {};
    cfg.color.order.forEach(function (name) { out[name] = cfg.color.scales[name] || {}; });
    return out;
  }
  // A single-step scale (e.g. black/white) exports as a flat color, not a group.
  function colorEntries(ramp) {
    var keys = Object.keys(ramp);
    return { single: keys.length === 1, keys: keys };
  }

  function toCSS(cfg) {
    var ramps = buildAllRamps(cfg);
    var L = [':root {'];
    var push = function (name, val) { L.push('  --' + name + ': ' + val + ';'); };
    cfg.color.order.forEach(function (name) {
      var e = colorEntries(ramps[name]);
      if (e.single) push('color-' + name, ramps[name][e.keys[0]]);
      else e.keys.forEach(function (s) { push('color-' + name + '-' + s, ramps[name][s]); });
    });
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
      var e = colorEntries(ramps[name]);
      if (e.single) { color[name] = { $type: 'color', $value: ramps[name][e.keys[0]] }; return; }
      var g = {};
      e.keys.forEach(function (s) { g[s] = { $type: 'color', $value: ramps[name][s] }; });
      color[name] = g;
    });
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
    cfg.color.order.forEach(function (name) {
      var e = colorEntries(ramps[name]);
      colors[name] = e.single ? ramps[name][e.keys[0]] : ramps[name];
    });
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
      var e = colorEntries(ramps[name]);
      if (e.single) { color[name] = { value: ramps[name][e.keys[0]], type: 'color' }; return; }
      var g = {};
      e.keys.forEach(function (s) { g[s] = { value: ramps[name][s], type: 'color' }; });
      color[name] = g;
    });
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

  // Step names are now arbitrary (manual model), so pick by ORDER not numeric
  // value: on white the first passing step (lightest), on black the last
  // passing step (darkest). Robust to single-step scales and non-numeric names.
  function contrastReport(cfg) {
    var ramps = buildAllRamps(cfg);
    return cfg.color.order.map(function (name) {
      var ramp = ramps[name];
      var steps = Object.keys(ramp);
      var onWhite = steps.filter(function (s) { return contrastRatio(ramp[s], '#FFFFFF') >= 4.5; });
      var onBlack = steps.filter(function (s) { return contrastRatio(ramp[s], '#000000') >= 4.5; });
      return {
        hue: name,
        whiteMinStep: onWhite.length ? onWhite[0] : '—',
        blackMaxStep: onBlack.length ? onBlack[onBlack.length - 1] : '—'
      };
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
