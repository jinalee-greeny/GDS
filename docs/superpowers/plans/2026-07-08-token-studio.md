# Foundations Token Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file browser tool (`tool/index.html`) that lets a designer visually customize the design-system foundation scale tokens with live preview and exports the same 4 artifacts the Python pipeline produces.

**Architecture:** One `config` object is the SSOT. `DEFAULT_CONFIG` embeds the current built values. Pure functions (`buildRamp`, `toDTCG/toCSS/toTailwind/toFigma`, `contrastReport`) derive everything from `config`. All logic lives in one inline `<script id="token-core">` (DOM-free, extractable for Node tests); the UI lives in a second inline `<script>`. The file opens via `file://` with no build step and zero runtime dependencies.

**Tech Stack:** Vanilla HTML/CSS/JS (no framework, no bundler). Tests: Node's built-in `node:test` + `node:assert` + `node:vm` (extract & evaluate the core script). Zero npm dependencies.

## Global Constraints

- **Zero dependencies** — no npm packages in the tool or the tests. Tests use only Node built-ins (`node:test`, `node:assert/strict`, `node:vm`, `node:fs`).
- **file:// compatible** — no ES module `import`, no `fetch`/XHR of local files, no build step. `index.html` must open by double-click.
- **Parity is the acceptance bar** — exporters run on `DEFAULT_CONFIG` must reproduce the committed files exactly:
  - `tokens/tokens.json` and `build/tokens.figma.json`: no trailing newline; `JSON.stringify(obj, null, 2)`.
  - `build/tokens.css`: lines joined by `\n` with a single trailing `\n`.
  - `build/tailwind.preset.js`: `"// Tailwind preset generated from tokens.json (SSOT)\nmodule.exports = " + JSON.stringify(obj, null, 2) + ";\n"`.
- **Key insertion order must match Python** — JSON parity is checked by exact string equality, so build every object with keys in the documented order.
- **Python-compatible rounding** — color hex must match Python's `round()` (round-half-to-even / banker's rounding), not `Math.round`.
- **Color scale steps** (fixed order): `50,100,200,300,400,500,600,700,800,900,950`.
- **Hue order** (fixed): `gray,red,orange,amber,green,teal,blue,violet,pink`.
- **Usability**: the final GUI must pass the Nielsen 10-heuristic checklist in spec §8.1 (Task 14). Every interactive control keyboard-operable; dirty-state visible; destructive resets confirmed; validation badges use text+icon, not color alone.

**Spec:** `docs/superpowers/specs/2026-07-08-token-studio-design.md`

---

## File Structure

- `tool/index.html` — the tool. Contains:
  - `<script id="token-core">` — DOM-free pure logic: `pyRound`, `oklchToSrgb`, `hexof`, `buildRamp`, `DEFAULT_CONFIG`, `cloneConfig`, `toDTCG`, `toCSS`, `toTailwind`, `toFigma`, `contrastReport`, and a `createStore` factory. Exposed on `window.TokenCore` and, when run under Node, on `module.exports`.
  - `<script>` (UI) — reads `window.TokenCore`, renders controls/preview/validation/export, wires DOM events.
- `tool/tests/helpers.mjs` — extracts the `token-core` script from `index.html` and evaluates it in a `vm` sandbox, returning the `TokenCore` object.
- `tool/tests/core.test.mjs` — automated tests for color, exporters, validation, store.
- `tool/tests/parity.test.mjs` — golden parity tests vs the committed `build/` and `tokens/` files.

UI tasks (9–14) are verified manually via `file://` because zero-dependency headless DOM testing is out of scope; each lists concrete observe-steps.

---

## Task 1: Core scaffold + Node test harness + color math (pyRound, hexof)

**Files:**
- Create: `tool/index.html`
- Create: `tool/tests/helpers.mjs`
- Create: `tool/tests/core.test.mjs`

**Interfaces:**
- Produces: `window.TokenCore` / `module.exports` exposing `pyRound(x) -> int`, `oklchToSrgb(L,C,Hdeg) -> [r,g,b]` (0–255 ints), `hexof(L,C,Hdeg) -> "#RRGGBB"`.

- [ ] **Step 1: Create the test harness that extracts and evaluates the core script**

Create `tool/tests/helpers.mjs`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const htmlPath = fileURLToPath(new URL('../index.html', import.meta.url));

export function loadCore() {
  const html = readFileSync(htmlPath, 'utf8');
  const m = html.match(/<script id="token-core">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('token-core script not found in index.html');
  const sandbox = { window: {}, module: { exports: {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox, { filename: 'token-core.js' });
  // core assigns to window.TokenCore AND module.exports; prefer the latter
  return sandbox.module.exports.hexof ? sandbox.module.exports : sandbox.window.TokenCore;
}
```

- [ ] **Step 2: Write the failing color-math test**

Create `tool/tests/core.test.mjs`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd tool && node --test tests/core.test.mjs`
Expected: FAIL — `token-core script not found` (index.html does not exist yet).

- [ ] **Step 4: Create index.html with the core script (color math only)**

Create `tool/index.html`:

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Foundations Token Studio</title>
</head>
<body>
<div id="app"></div>

<script id="token-core">
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

  var TokenCore = { pyRound: pyRound, oklchToSrgb: oklchToSrgb, hexof: hexof };
  root.TokenCore = TokenCore;
  if (typeof module !== 'undefined' && module.exports) module.exports = TokenCore;
})(typeof window !== 'undefined' ? window : globalThis);
</script>

<script>
// ---- UI (added in later tasks) ----
</script>
</body>
</html>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd tool && node --test tests/core.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add tool/index.html tool/tests/helpers.mjs tool/tests/core.test.mjs
git commit -m "feat(token-studio): core scaffold + OKLCH color math with Python-parity rounding"
```

---

## Task 2: DEFAULT_CONFIG + buildRamp (full 99-hex golden)

**Files:**
- Modify: `tool/index.html` (extend `token-core`)
- Modify: `tool/tests/core.test.mjs`

**Interfaces:**
- Consumes: `hexof`.
- Produces: `DEFAULT_CONFIG` (object, structure below), `cloneConfig(cfg)`, `buildRamp(hue, cpk, Lc, Cm) -> {step: hex}`, `buildAllRamps(cfg) -> {hueName: {step: hex}}`.

`DEFAULT_CONFIG` shape:
```
{
  steps: [50,...,950],
  curves: { Lc: [...11], Cm: [...11] },
  color: { order: ['gray','red','orange','amber','green','teal','blue','violet','pink'],
           palettes: { gray:{H:268,Cpk:0.010}, red:{H:27,Cpk:0.190}, ... },
           base: { white:'#FFFFFF', black:'#000000' } },
  fontFamily: {...}, fontSize: {...}, fontWeight: {...}, lineHeight: {...},
  letterSpacing: {...}, space: {...}, radius: {...}, borderWidth: {...},
  opacity: {...}, shadow: {...}, zIndex: {...}, breakpoint: {...},
  duration: {...}, easing: {...}
}
```

- [ ] **Step 1: Write the failing test for buildAllRamps parity**

Add to `tool/tests/core.test.mjs`:

```js
test('buildAllRamps reproduces committed gray, red, blue ramps', () => {
  const ramps = core.buildAllRamps(core.DEFAULT_CONFIG);
  assert.deepEqual(ramps.gray, {
    '50':'#F5F6F8','100':'#E9EBEF','200':'#D7D9DF','300':'#BDC0C7','400':'#A1A4AC',
    '500':'#898B92','600':'#72747B','700':'#5D5F65','800':'#494A4E','900':'#35373A','950':'#242427'
  });
  assert.deepEqual(ramps.red, {
    '50':'#FFE8E1','100':'#FFD1C5','200':'#FFAC9E','300':'#FF8477','400':'#FF5D53',
    '500':'#F0443E','600':'#CC3430','700':'#AA2825','800':'#85201D','900':'#621A16','950':'#43100D'
  });
  assert.deepEqual(ramps.blue, {
    '50':'#DEF8FF','100':'#BFEFFF','200':'#91DDFF','300':'#63C2FF','400':'#36A4FF',
    '500':'#1B8AFF','600':'#0A72DA','700':'#035EB6','800':'#07498E','900':'#0A3668','950':'#062448'
  });
  assert.equal(core.DEFAULT_CONFIG.color.order.length, 9);
});

test('cloneConfig returns an independent deep copy', () => {
  const c = core.cloneConfig(core.DEFAULT_CONFIG);
  c.color.palettes.blue.H = 200;
  assert.equal(core.DEFAULT_CONFIG.color.palettes.blue.H, 255);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tool && node --test tests/core.test.mjs`
Expected: FAIL — `core.buildAllRamps is not a function`.

- [ ] **Step 3: Add DEFAULT_CONFIG, cloneConfig, buildRamp, buildAllRamps to token-core**

Insert inside the `token-core` IIFE, before the `TokenCore` object literal. Values copied verbatim from `build_tokens.py`:

```js
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
      out[step] = hexof(Lc[i], cpk * Cm[i], hue);
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
```

Then add them to the `TokenCore` object:
```js
  var TokenCore = { pyRound: pyRound, oklchToSrgb: oklchToSrgb, hexof: hexof,
    DEFAULT_CONFIG: DEFAULT_CONFIG, cloneConfig: cloneConfig,
    buildRamp: buildRamp, buildAllRamps: buildAllRamps };
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd tool && node --test tests/core.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tool/index.html tool/tests/core.test.mjs
git commit -m "feat(token-studio): DEFAULT_CONFIG + ramp generation with 99-hex golden test"
```

---

## Task 3: toDTCG exporter + parity vs tokens.json

**Files:**
- Modify: `tool/index.html` (extend `token-core`)
- Create: `tool/tests/parity.test.mjs`

**Interfaces:**
- Consumes: `DEFAULT_CONFIG`, `buildAllRamps`.
- Produces: `toDTCG(cfg) -> string` (exact `JSON.stringify(obj, null, 2)`, no trailing newline).

DTCG `$type` map (from `build_tokens.py`): color→`color`, font.family→`fontFamily`, font.size→`dimension`, font.weight→`fontWeight`, lineHeight→`number`, letterSpacing→`dimension`, space→`dimension`, radius→`dimension`, borderWidth→`dimension`, opacity→`number`, shadow→`shadow`, zIndex→`number`, breakpoint→`dimension`, duration→`duration`, easing→`cubicBezier`.

Top-level key order: `$description`, `color`, `font`, `lineHeight`, `letterSpacing`, `space`, `radius`, `borderWidth`, `opacity`, `shadow`, `zIndex`, `breakpoint`, `duration`, `easing`. Inside `color`: ramps in hue order, then `base` (`white`,`black`). Inside `font`: `family`, `size`, `weight`.

- [ ] **Step 1: Write the failing parity test**

Create `tool/tests/parity.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCore } from './helpers.mjs';

const core = loadCore();
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

test('toDTCG matches committed tokens/tokens.json exactly', () => {
  assert.equal(core.toDTCG(core.DEFAULT_CONFIG), read('tokens/tokens.json'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tool && node --test tests/parity.test.mjs`
Expected: FAIL — `core.toDTCG is not a function`.

- [ ] **Step 3: Add toDTCG to token-core**

```js
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
```

Add `toDTCG: toDTCG` to the `TokenCore` object.

- [ ] **Step 4: Run to verify it passes**

Run: `cd tool && node --test tests/parity.test.mjs`
Expected: PASS. If it fails on whitespace, diff the first mismatch with:
`node -e "const c=require('./tool/tests/helpers.mjs')" ` — instead, temporarily log `core.toDTCG(core.DEFAULT_CONFIG).slice(0,200)` and compare. Do not change the golden file; fix the exporter.

- [ ] **Step 5: Commit**

```bash
git add tool/index.html tool/tests/parity.test.mjs
git commit -m "feat(token-studio): toDTCG exporter with tokens.json parity test"
```

---

## Task 4: toCSS exporter + parity vs build/tokens.css

**Files:**
- Modify: `tool/index.html`, `tool/tests/parity.test.mjs`

**Interfaces:**
- Consumes: `buildAllRamps`.
- Produces: `toCSS(cfg) -> string` (lines joined by `\n`, single trailing `\n`).

CSS var prefixes & order (from `build_tokens.py`): `:root {`, then per hue in order `--color-{name}-{step}`, then `--color-white`, `--color-black`, then `--font-{k}` (fontFamily), `--font-size-{k}`, `--font-weight-{k}`, `--leading-{k}` (lineHeight), `--tracking-{k}` (letterSpacing), `--space-{k}`, `--radius-{k}`, `--border-{k}` (borderWidth), `--opacity-{k}`, `--shadow-{k}`, `--z-{k}` (zIndex), `--bp-{k}` (breakpoint), `--duration-{k}`, `--ease-{k}` (easing), then `}`. Each var line is indented 2 spaces: `  --name: value;`.

- [ ] **Step 1: Write the failing test**

Add to `tool/tests/parity.test.mjs`:

```js
test('toCSS matches committed build/tokens.css exactly', () => {
  assert.equal(core.toCSS(core.DEFAULT_CONFIG), read('build/tokens.css'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tool && node --test tests/parity.test.mjs`
Expected: FAIL — `core.toCSS is not a function`.

- [ ] **Step 3: Add toCSS to token-core**

```js
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
```

Add `toCSS: toCSS` to `TokenCore`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd tool && node --test tests/parity.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tool/index.html tool/tests/parity.test.mjs
git commit -m "feat(token-studio): toCSS exporter with tokens.css parity test"
```

---

## Task 5: toTailwind exporter + parity vs build/tailwind.preset.js

**Files:**
- Modify: `tool/index.html`, `tool/tests/parity.test.mjs`

**Interfaces:**
- Consumes: `buildAllRamps`.
- Produces: `toTailwind(cfg) -> string`.

Structure (from `build_tokens.py`): `{ theme: { extend: { colors, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, spacing, borderRadius, borderWidth, opacity, boxShadow, zIndex, screens, transitionDuration, transitionTimingFunction } } }`. `colors` = ramps (hue order) then `white`,`black`. `spacing`=space, `borderRadius`=radius, `boxShadow`=shadow, `zIndex`=zIndex, `screens`=breakpoint, `transitionDuration`=duration, `transitionTimingFunction`=easing. Output string = `"// Tailwind preset generated from tokens.json (SSOT)\nmodule.exports = " + JSON.stringify(tw, null, 2) + ";\n"`.

- [ ] **Step 1: Write the failing test**

Add to `tool/tests/parity.test.mjs`:

```js
test('toTailwind matches committed build/tailwind.preset.js exactly', () => {
  assert.equal(core.toTailwind(core.DEFAULT_CONFIG), read('build/tailwind.preset.js'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tool && node --test tests/parity.test.mjs`
Expected: FAIL — `core.toTailwind is not a function`.

- [ ] **Step 3: Add toTailwind to token-core**

```js
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
```

Add `toTailwind: toTailwind` to `TokenCore`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd tool && node --test tests/parity.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tool/index.html tool/tests/parity.test.mjs
git commit -m "feat(token-studio): toTailwind exporter with tailwind.preset.js parity test"
```

---

## Task 6: toFigma exporter + parity vs build/tokens.figma.json

**Files:**
- Modify: `tool/index.html`, `tool/tests/parity.test.mjs`

**Interfaces:**
- Consumes: `buildAllRamps`.
- Produces: `toFigma(cfg) -> string` (`JSON.stringify(obj, null, 2)`, no trailing newline).

Structure (from `build_tokens.py`) — note it includes ONLY this subset, in this order: `color` (ramps in hue order, then `base` with `white`,`black`), `fontFamilies`, `fontSizes`, `fontWeights`, `lineHeights`, `letterSpacing`, `spacing`, `borderRadius`, `borderWidth`, `opacity`, `boxShadow`. Each leaf = `{ value, type }` where `type` is the category name (e.g. color entries use `type:'color'`; fontSizes entries use `type:'fontSizes'`; etc.).

- [ ] **Step 1: Write the failing test**

Add to `tool/tests/parity.test.mjs`:

```js
test('toFigma matches committed build/tokens.figma.json exactly', () => {
  assert.equal(core.toFigma(core.DEFAULT_CONFIG), read('build/tokens.figma.json'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tool && node --test tests/parity.test.mjs`
Expected: FAIL — `core.toFigma is not a function`.

- [ ] **Step 3: Add toFigma to token-core**

```js
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
```

Add `toFigma: toFigma` to `TokenCore`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd tool && node --test tests/parity.test.mjs`
Expected: PASS (4 tests) — full parity across all 4 artifacts.

- [ ] **Step 5: Commit**

```bash
git add tool/index.html tool/tests/parity.test.mjs
git commit -m "feat(token-studio): toFigma exporter with tokens.figma.json parity test"
```

---

## Task 7: WCAG contrast validation (contrastReport)

**Files:**
- Modify: `tool/index.html`, `tool/tests/core.test.mjs`

**Interfaces:**
- Consumes: `buildAllRamps`.
- Produces: `relLuminance(hex) -> number`, `contrastRatio(a,b) -> number`, `contrastReport(cfg) -> [{ hue, whiteMinStep, blackMaxStep }]` where steps are strings or `'—'`.

Logic ported from `build_docs.py`: relative luminance with 0.03928 threshold and 2.4 gamma; ratio `(L+0.05)/(D+0.05)`. For each hue: `whiteMinStep` = min step whose ratio vs `#FFFFFF` ≥ 4.5; `blackMaxStep` = max step whose ratio vs `#000000` ≥ 4.5. Hue order = `gray` first, then the rest of `color.order`.

- [ ] **Step 1: Write the failing test with known-good expectations**

Add to `tool/tests/core.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tool && node --test tests/core.test.mjs`
Expected: FAIL — `core.contrastReport is not a function`.

- [ ] **Step 3: Add contrast functions to token-core**

```js
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
```

Add `relLuminance`, `contrastRatio`, `contrastReport` to `TokenCore`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd tool && node --test tests/core.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tool/index.html tool/tests/core.test.mjs
git commit -m "feat(token-studio): WCAG AA contrast report matching GUIDE.md"
```

---

## Task 8: State store (get/set/reset/undo/redo/load)

**Files:**
- Modify: `tool/index.html`, `tool/tests/core.test.mjs`

**Interfaces:**
- Consumes: `DEFAULT_CONFIG`, `cloneConfig`.
- Produces: `createStore(initial?) -> store` with:
  - `get() -> cfg`
  - `setPath(pathArray, value)` — set a nested value, push previous state to undo stack, clear redo stack, notify subscribers.
  - `undo()`, `redo()` — move between history; return `boolean` (whether it moved).
  - `canUndo() -> bool`, `canRedo() -> bool`
  - `isDirty() -> bool` — differs from `DEFAULT_CONFIG` (deep compare).
  - `resetAll()`, `resetGroup(groupKey)` — restore from `DEFAULT_CONFIG` (whole config or one top-level group), history-tracked.
  - `loadConfig(cfg)` — replace whole config, history-tracked.
  - `subscribe(fn) -> unsubscribe` — `fn(cfg)` called after every mutation.

- [ ] **Step 1: Write the failing store tests**

Add to `tool/tests/core.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tool && node --test tests/core.test.mjs`
Expected: FAIL — `core.createStore is not a function`.

- [ ] **Step 3: Add createStore to token-core**

```js
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
```

Add `createStore: createStore` to `TokenCore`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd tool && node --test`
Expected: PASS (all core + parity tests, 8 tests total).

- [ ] **Step 5: Commit**

```bash
git add tool/index.html tool/tests/core.test.mjs
git commit -m "feat(token-studio): config store with undo/redo, reset, dirty tracking"
```

---

## Task 9: UI shell + color & type (generative) controls

**Files:**
- Modify: `tool/index.html` (UI `<script>` + `<style>` in `<head>`)

**Interfaces:**
- Consumes: `window.TokenCore` (`createStore`, `buildAllRamps`, `contrastReport`).
- Produces (globals for later UI tasks): `window.Studio = { store, refs }` and a `render()` that re-renders on every `store.subscribe`.

This task is verified manually (browser). Build the app skeleton and the two generative editors.

- [ ] **Step 1: Add base layout styles**

In `<head>`, add a `<style>` with: a two-column layout (left = scrollable control panels grouped in collapsible `<details>`; right = sticky preview). Include focus-visible outlines, a `.dirty` badge style, `.badge-pass`/`.badge-fail` with an icon glyph (✓ / ✕) plus text (not color alone). Use system font stack. Keep it minimal and readable.

- [ ] **Step 2: Build the UI bootstrap**

In the UI `<script>`:

```js
(function () {
  var C = window.TokenCore;
  var store = C.createStore();
  var app = document.getElementById('app');
  window.Studio = { store: store, C: C };

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k.slice(0,2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  window.Studio.el = el;

  function render() { /* rebuilt fully in later steps */ }
  window.Studio.render = render;
  store.subscribe(render);
  render();
})();
```

- [ ] **Step 3: Add the color editor**

Extend `render()` to output, for each hue in `store.get().color.order`: a labelled row with a **range slider + number input** for `H` (0–360) and `Cpk` (0–0.4 step 0.005), plus a live 11-swatch strip from `C.buildAllRamps(store.get())[hue]`. Wire `input` events to `store.setPath(['color','palettes',hue,'H'], Number(value))` etc. Add number `<input>`s for the shared curve arrays `curves.Lc[i]` / `curves.Cm[i]` under an "Advanced curve" `<details>`. Each control has an associated `<label for>`.

- [ ] **Step 4: Add the type-scale editor**

For `fontSize`, render a numeric `<input>` per step (value without the `px` suffix, re-append on set) so per-step values are the source of truth. Add a "Modular scale" helper: `base` and `ratio` inputs + an "Apply" button that fills `fontSize` from `round(base * ratio^n)` centered on `md`, via `store.setPath`. Applying is one undoable action.

- [ ] **Step 5: Manual verification**

Open `tool/index.html` via `file://` (double-click). Confirm:
- Moving the blue `H` slider updates its swatch strip live.
- Editing a `fontSize` field updates state (check via `window.Studio.store.get().fontSize` in console).
- "Apply modular scale" fills the fields; one Ctrl/Cmd-Z-equivalent (Task 14 wires the button) is not yet present — for now confirm state changed once.
- No console errors.

- [ ] **Step 6: Commit**

```bash
git add tool/index.html
git commit -m "feat(token-studio): UI shell + generative color & type-scale editors"
```

---

## Task 10: List-scale controls (key/value editors)

**Files:**
- Modify: `tool/index.html`

Verified manually.

- [ ] **Step 1: Build a reusable key/value group editor**

Add a `renderKVGroup(groupKey, opts)` helper that renders, for the object at `store.get()[groupKey]`, one row per entry: a key `<input>`, a value `<input>` (type/placeholder per `opts`), and a "Remove" button. Below the rows, an "Add row" button appends a new empty entry. Editing a value calls `store.setPath([groupKey, key], value)`; renaming a key or add/remove rebuilds the group object (preserving order) and uses `store.setPath` on the whole group via a small `setGroup(groupKey, obj)` that calls `store.setPath([groupKey], obj)`. (Add `setGroup` need not touch core — compose from `setPath` with a one-element path.)

- [ ] **Step 2: Wire all list groups**

Render collapsible `<details>` sections calling `renderKVGroup` for: `space`, `radius`, `borderWidth`, `opacity`, `shadow`, `zIndex`, `breakpoint`, `duration`, `easing`, `fontFamily`, `fontWeight`, `lineHeight`, `letterSpacing`. Group labels in Korean matching the design (e.g. "간격(space)", "모서리(radius)").

- [ ] **Step 3: Guard against invalid keys**

On key rename or add: if the key is empty or duplicates an existing key in that group, reject the edit (revert the input, show an inline message) — do not mutate state. This satisfies heuristic #5 (error prevention).

- [ ] **Step 4: Manual verification**

Open via `file://`. Confirm: editing `space.4` value updates `window.Studio.store.get().space['4']`; adding a row then removing it works; a duplicate key is rejected with a visible message; no console errors.

- [ ] **Step 5: Commit**

```bash
git add tool/index.html
git commit -m "feat(token-studio): key/value editors for all list-type scale groups"
```

---

## Task 11: Live preview panel

**Files:**
- Modify: `tool/index.html`

Verified manually.

- [ ] **Step 1: Build preview renderers**

In the right column, render (all derived from `store.get()`):
- **Color**: a grid of all hue ramps (row per hue, 11 swatches, step label + hex on hover/caption).
- **Type**: a specimen line per `fontSize` step ("다람쥐 헌 쳇바퀴 Ag 123") at that size.
- **Spacing**: horizontal bars sized to each `space` value.
- **Radius**: boxes with each `radius` value.
- **Border/Shadow/Opacity**: sample boxes demonstrating each.
- **Motion**: a box that animates using each `duration`/`easing` on hover or a "Play" button.

- [ ] **Step 2: Ensure preview updates on every change**

Confirm the preview is part of `render()` so `store.subscribe(render)` refreshes it. Keep the right column `position: sticky` so it stays visible while scrolling controls.

- [ ] **Step 3: Manual verification**

Open via `file://`. Change blue `H` → color grid updates; edit `fontSize.6xl` → specimen grows; edit `space.10` → bar length changes; motion demo plays. No console errors.

- [ ] **Step 4: Commit**

```bash
git add tool/index.html
git commit -m "feat(token-studio): live preview panel for all scale groups"
```

---

## Task 12: Live WCAG validation panel

**Files:**
- Modify: `tool/index.html`

Verified manually.

- [ ] **Step 1: Render the contrast report**

Add a "접근성 검증 (WCAG AA 4.5:1)" section that renders `C.contrastReport(store.get())` as a table: hue, white-bg min step, black-bg max step. Each cell shows a **text + icon** badge (✓ 통과 / ✕), never color alone. Include a one-line explanation (mirrors GUIDE.md wording).

- [ ] **Step 2: Add a per-swatch contrast hint**

When a hue's `whiteMinStep` is `'—'` (no step passes on white), show a visible warning row with human-readable guidance ("이 hue는 흰 배경 본문 대비를 통과하는 단계가 없습니다 — 채도/명도를 낮춰보세요"). Satisfies heuristics #9 (help users recognize/recover from errors).

- [ ] **Step 3: Manual verification**

Open via `file://`. Confirm the table matches GUIDE.md defaults (green/teal show 700/600, others 600/500). Lower blue `Cpk` drastically → watch the steps/warnings update live. No console errors.

- [ ] **Step 4: Commit**

```bash
git add tool/index.html
git commit -m "feat(token-studio): live WCAG AA validation panel"
```

---

## Task 13: Export panel (download / copy / preview) + round-trip load

**Files:**
- Modify: `tool/index.html`

Verified manually.

- [ ] **Step 1: Build the export UI**

Add an "내보내기(Export)" section with 4 artifacts. For each: a "미리보기" toggle (shows the generated string in a `<pre>` via `C.toDTCG/toCSS/toTailwind/toFigma(store.get())`), a "복사" button (`navigator.clipboard.writeText`, with a fallback of selecting the `<pre>` text), and a "다운로드" button that creates a `Blob` and triggers download with the correct filename (`tokens.json`, `tokens.css`, `tailwind.preset.js`, `tokens.figma.json`). Add a "전체 다운로드" that downloads all four sequentially.

```js
function download(filename, text, mime) {
  var blob = new Blob([text], { type: mime || 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Add round-trip: load tokens.json**

Add a "tokens.json 불러오기" file `<input type="file">`. On load, read the file text, `JSON.parse`, and reconstruct a `config` from the DTCG structure: read `color.{hue}.{step}` is derived — instead reconstruct editable params by reading `color` ramps back is lossy, so **only restore the directly-stored groups** (`fontSize`, `space`, `radius`, `borderWidth`, `opacity`, `shadow`, `zIndex`, `breakpoint`, `duration`, `easing`, `fontFamily`, `fontWeight`, `lineHeight`, `letterSpacing`) plus `color.base`. For color ramps (which are generated from H/Cpk), leave the current palette params intact and show a note: "컬러 램프는 파라미터에서 생성되므로 tokens.json에서 역복원하지 않습니다." Merge restored groups over the current config via `store.loadConfig(merged)`. Wrap in try/catch; on parse error show a human-readable message.

- [ ] **Step 3: Manual verification**

Open via `file://`. Export tokens.json → downloaded file matches the committed one (diff them). Edit a value, export CSS, confirm the change appears. Load a tokens.json with an edited `space.4` → the field updates; malformed JSON shows an error message, not a crash.

- [ ] **Step 4: Commit**

```bash
git add tool/index.html
git commit -m "feat(token-studio): export panel (download/copy/preview) + tokens.json round-trip"
```

---

## Task 14: Usability & accessibility pass (Nielsen 10-heuristic gate)

**Files:**
- Modify: `tool/index.html`

Verified manually against spec §8.1. This task wires the global controls and closes the heuristic checklist.

- [ ] **Step 1: Global toolbar — state visibility, undo/redo, reset**

Add a sticky top toolbar with: the tool title; a **dirty indicator** ("● 변경됨(기본값과 다름)" when `store.isDirty()`, else "기본값"); **되돌리기/다시실행** buttons bound to `store.undo()/redo()` and disabled per `canUndo()/canRedo()`; a **전체 초기화** button that calls `store.resetAll()` **after a `confirm()`**; keyboard shortcuts Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z (redo). Re-render updates button disabled states.

- [ ] **Step 2: Per-group reset**

Add a small "초기화" button in each group's header calling `store.resetGroup(groupKey)` (with `confirm()` for destructive groups). Heuristic #3 (user control & freedom).

- [ ] **Step 3: Inline help + input constraints**

Give each generative control an inline hint (recommended range). Set `min`/`max`/`step` on numeric inputs (H 0–360, Cpk 0–0.4, sizes ≥ 0) so out-of-range input is prevented; clamp on `change`. Heuristics #5, #6, #10.

- [ ] **Step 4: Accessibility sweep**

Confirm: every control reachable and operable by keyboard (Tab/Shift-Tab/arrows/Enter); visible focus ring on all interactive elements; every input has an associated `<label for>` or `aria-label`; validation badges convey status via text+icon (not color alone); collapsible sections use native `<details>`/`<summary>` (keyboard-accessible). Fix any gaps found.

- [ ] **Step 5: Nielsen 10-heuristic checklist (final gate)**

Walk spec §8.1 items 1–10 in the running app and confirm each; fix anything failing before marking done:
1. State visibility — dirty indicator + live preview ✓
2. Real-world match — token names verbatim ✓
3. User control — undo/redo + resets ✓
4. Consistency — uniform control patterns ✓
5. Error prevention — clamping + duplicate-key guard + confirm on reset ✓
6. Recognition over recall — defaults/units always shown ✓
7. Flexibility — number typing + modular-scale shortcut ✓
8. Minimalist — collapsible groups, preview-forward ✓
9. Error recovery — human-readable validation/parse messages ✓
10. Help — inline hints ✓

- [ ] **Step 6: Full test run + commit**

Run: `cd tool && node --test`
Expected: PASS (all automated core + parity tests).

```bash
git add tool/index.html
git commit -m "feat(token-studio): usability & a11y pass — Nielsen heuristic gate complete"
```

---

## Self-Review Notes

- **Spec coverage:** §3 architecture → Tasks 1–8; §4.1 generative controls → Task 9; §4.2 list controls → Task 10; §5 code units → Tasks 1–8 (oklch/defaults/state/exporters/validate) + 9–13 (ui); §6 preview & validation → Tasks 11–12; §7 export & round-trip → Task 13; §8 parity/success → Tasks 3–6 (parity), 14 (file:// operation); §8.1 heuristics → Task 14. All covered.
- **Types consistent:** `store.setPath`, `buildAllRamps`, `contrastReport`, exporters use identical names across tasks.
- **No placeholders:** all core steps include full code; UI steps give concrete build + observe instructions (UI is untestable headless without adding a dependency, which the zero-dep constraint forbids — verification is explicit manual observe-steps).
