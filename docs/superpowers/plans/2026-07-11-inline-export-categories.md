# Inline Export Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the shared editor left column into 6 categories and co-locate the Figma plugin's export toggles inside those categories/modules (removing the separate output panel), via opt-in hooks so the web app is unaffected.

**Architecture:** `core/studio-ui.js` gains a `CATEGORIES` constant and three optional hooks (`moduleExtras`, `categoryHeaderExtras`, `categoryBodyExtras`); its `render()` groups the existing editor modules into 6 `<section class="category">` blocks instead of a flat list. The web shell passes no hooks (categories only, no export UI). The Figma plugin shell drops its separate `renderOutputTargets` panel and instead supplies the three hooks — per-module toggles, a per-category master, and a composite Text Styles item under Typography. `core/figma-map.js` and `plugin/code.src.js` (the message contract + variable/style writers) are unchanged.

**Tech Stack:** Vanilla JS (no bundler, no npm, no runtime deps), assembled by `python3 build_apps.py` (marker replacement) into `tool/index.html`, `plugin/ui.html`, `plugin/code.js`. Node built-in test runner (`node:test`) for logic. Headless Chrome for DOM smoke.

## Global Constraints

- **SSOT / never hand-edit generated files.** Edit `core/*.js`, `core/studio.css`, `plugin/ui.template.html`, `tool/index.template.html`, `plugin/code.src.js`, `plugin/README.md`. Then run `python3 build_apps.py` to regenerate `tool/index.html`, `plugin/ui.html`, `plugin/code.js`. The drift tests fail if a generated file does not embed its core sources verbatim.
- **Zero dependencies.** No new npm/pip packages, no bundler. `file://`-openable web app; plugin UI is plain JS.
- **Checkbox `checked`/`indeterminate`/`value` are set as DOM PROPERTIES** on the freshly-created node (`node.checked = …`), NEVER through `el()`'s attrs — `el()` does `setAttribute()` for anything that isn't `class`/`on*`/`text`, and `setAttribute('checked', undefined)` stringifies to `"undefined"`, force-checking every box. This is a recurring bug in this codebase; both tasks touch checkboxes.
- **No interactive content inside `<summary>`.** Precedent: `groupResetBtn` and the plugin's old master checkbox were both deliberately kept OUT of `<summary>` (uncertain keyboard/AT behavior on the disclosure toggle). Category headers are plain `<div>`s, not `<summary>`; module `<details>`/`<summary>` structure is unchanged.
- **Every interactive control has an accessible name** — a `<label for>` or an `aria-label`.
- **State preservation is invariant.** Module `<details>` keep their existing stable ids; the `#panel-col` scroll container id is unchanged; the font-family input keeps id `plugin-font-family`. `captureUIState`/`restoreUIState` (focus/caret + `<details open>` + scroll) must keep working across the full `#app` rebuild. Category `<section>`/header wrappers are non-focusable.
- **DOM built only via `el()`/`textContent`** — no `innerHTML` with dynamic strings.
- **Verification model for DOM/UI code:** this codebase has no jsdom harness (zero-deps). DOM-rendering changes are verified by (a) the existing `node:test` logic suite staying green (regression guard), (b) the drift tests green after `build_apps.py`, and (c) a headless Chrome smoke run (no console errors + a screenshot confirming structure). Do NOT add a jsdom/browser test dependency. This is the established pattern from every prior cycle.
- **Chrome smoke command** (macOS): `CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`; run `"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,4400 --screenshot=<out.png> --virtual-time-budget=2000 --enable-logging=stderr --v=1 "file://<abs path to .html>" 2>/tmp/smoke.log`, then check `grep -iE "error|uncaught|exception" /tmp/smoke.log` is empty (ignore benign GPU/GL noise).

---

## File Structure

- **Modify `core/studio-ui.js`** — capture 3 new opt-in hooks in `createStudio`; add `CATEGORIES` + `KV_MAP` + `renderModule` + `renderCategory`; rewrite `render()`'s left-column construction to group modules into categories; remove the now-unused `renderListPanels`.
- **Modify `core/studio.css`** — add shared `.category` / `.category-header` / `.category-title` / `.module-row` rules (+ dark-mode override). Used by both shells.
- **Modify `plugin/ui.template.html`** — remove `renderOutputTargets` (separate panel); add `CAT_EXPORT` + `moduleExtras`/`categoryHeaderExtras`/`categoryBodyExtras`; pass the 3 hooks to `createStudio` instead of `rightColumnExtras`; add plugin-only export-toggle CSS; remove dead plugin CSS. CTA/apply/onmessage unchanged.
- **Modify `plugin/README.md`** — describe the inline-toggle model (replacing the "Output categories" separate-panel wording).
- **Unchanged (confirm only):** `core/figma-map.js`, `core/token-core.js`, `plugin/code.src.js`, `tool/index.template.html` (web shell already passes no hooks).
- **Regenerated:** `tool/index.html`, `plugin/ui.html`, `plugin/code.js`.

---

## Task 1: Shared category restructure + opt-in hooks (`core/studio-ui.js` + `core/studio.css`)

**Files:**
- Modify: `core/studio-ui.js`
- Modify: `core/studio.css`
- Regenerate: `tool/index.html`, `plugin/ui.html`, `plugin/code.js` (via `build_apps.py`)
- Verify: `tool/tests/*.mjs` (existing suite), headless Chrome on `tool/index.html`

**Interfaces:**
- Consumes: existing `renderColorPanel(cfg)`, `renderTypePanel(cfg)`, `renderKVSection(groupKey, labelText, opts)`, `KV_GROUPS`, `el`, `detailsAttrs`, `captureUIState`/`restoreUIState`.
- Produces (for Task 2): `createStudio(opts)` now reads three OPTIONAL hooks, each `-> Node|null`:
  - `opts.moduleExtras(groupKey, cfg)` — injected as the first child of a module's `.module-row`, before the module `<details>`.
  - `opts.categoryHeaderExtras(categoryKey, cfg)` — injected as the first child of `.category-header`, before the `.category-title`.
  - `opts.categoryBodyExtras(categoryKey, cfg)` — appended as the last child of a `.category` section.
  - Category keys: `'color'`, `'typography'`, `'spacing'`, `'effects'`, `'motion'`, `'layout'`. Module (group) keys per category: color=[`color`]; typography=[`fontSize`,`fontFamily`,`fontWeight`,`lineHeight`,`letterSpacing`]; spacing=[`space`,`radius`,`borderWidth`]; effects=[`opacity`,`shadow`]; motion=[`duration`,`easing`]; layout=[`zIndex`,`breakpoint`].
  - When a hook is not supplied it defaults to `function () { return null; }`, so nothing is injected.

- [ ] **Step 1: Capture the three hooks in `createStudio`.**

In `core/studio-ui.js`, immediately after the existing `rightColumnExtras` line (currently line 15):

```js
    var rightColumnExtras = opts.rightColumnExtras || function () { return null; };
    var moduleExtras = opts.moduleExtras || function () { return null; };
    var categoryHeaderExtras = opts.categoryHeaderExtras || function () { return null; };
    var categoryBodyExtras = opts.categoryBodyExtras || function () { return null; };
```

(Only the three `moduleExtras`/`categoryHeaderExtras`/`categoryBodyExtras` lines are added; the `rightColumnExtras` line is unchanged.)

- [ ] **Step 2: Add `CATEGORIES`, `KV_MAP`, `renderModule`, `renderCategory` and remove `renderListPanels`.**

Replace the existing `renderListPanels` function (currently lines 445–449):

```js
  function renderListPanels() {
    return KV_GROUPS.map(function (entry) {
      return renderKVSection(entry[0], entry[1], entry[2]);
    });
  }
```

with this block:

```js
  // ---- Category grouping ------------------------------------------------
  // The flat editor modules (color, type scale, and the KV list groups) are
  // organized into 6 user-facing categories, shared by both shells. Module
  // <details> ids are unchanged, so open/close + focus + scroll preservation
  // (captureUIState/restoreUIState) is unaffected — only the wrapping DOM and
  // the module ORDER within the left column change. The plugin shell injects
  // per-module and per-category export toggles via the three opt-in hooks
  // (moduleExtras / categoryHeaderExtras / categoryBodyExtras); the web shell
  // passes none, so it gets categorized editing with no export UI.
  var CATEGORIES = [
    { key: 'color', name: 'Color', modules: ['color'] },
    { key: 'typography', name: 'Typography', modules: ['fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing'] },
    { key: 'spacing', name: 'Spacing & Sizing', modules: ['space', 'radius', 'borderWidth'] },
    { key: 'effects', name: 'Effects', modules: ['opacity', 'shadow'] },
    { key: 'motion', name: 'Motion', modules: ['duration', 'easing'] },
    { key: 'layout', name: 'Layout', modules: ['zIndex', 'breakpoint'] }
  ];

  // group key -> {label, opts} for the KV-backed modules (everything except
  // 'color' and 'fontSize', which have bespoke renderers).
  var KV_MAP = {};
  KV_GROUPS.forEach(function (e) { KV_MAP[e[0]] = { label: e[1], opts: e[2] }; });

  function renderModule(groupKey, cfg) {
    if (groupKey === 'color') return renderColorPanel(cfg);
    if (groupKey === 'fontSize') return renderTypePanel(cfg);
    var entry = KV_MAP[groupKey];
    return renderKVSection(groupKey, entry.label, entry.opts);
  }

  function renderCategory(cat, cfg) {
    var headerExtra = categoryHeaderExtras(cat.key, cfg);
    var headerChildren = (headerExtra ? [headerExtra] : [])
      .concat([el('span', { class: 'category-title', text: cat.name })]);
    var header = el('div', { class: 'category-header' }, headerChildren);

    var moduleRows = cat.modules.map(function (groupKey) {
      var extra = moduleExtras(groupKey, cfg);
      var moduleNode = renderModule(groupKey, cfg);
      var rowChildren = (extra ? [extra] : []).concat([moduleNode]);
      return el('div', { class: 'module-row' }, rowChildren);
    });

    var children = [header].concat(moduleRows);
    var bodyExtra = categoryBodyExtras(cat.key, cfg);
    if (bodyExtra) children.push(bodyExtra);
    return el('section', { class: 'category' }, children);
  }
```

- [ ] **Step 3: Rewrite the left-column construction in `render()`.**

In `render()`, replace the current `leftCol` assignment (currently lines 752–755):

```js
    var leftCol = el('div', { class: 'panel-col', id: 'panel-col' }, [
      renderColorPanel(cfg),
      renderTypePanel(cfg)
    ].concat(renderListPanels()).concat(extrasArr));
```

with:

```js
    var leftCol = el('div', { class: 'panel-col', id: 'panel-col' },
      CATEGORIES.map(function (cat) { return renderCategory(cat, cfg); }).concat(extrasArr));
```

`extrasArr` (from `rightColumnExtras`) is preserved and still appended at the end of the left column — the web shell's export/import section keeps its exact slot. The `rightColumnExtras(cfg)` call and the `extras`/`extrasArr` lines above it are unchanged.

- [ ] **Step 4: Add shared category CSS to `core/studio.css`.**

Insert these rules immediately after the `.group-body { … }` rule (currently line 35):

```css
  .category-header { display: flex; align-items: center; gap: 8px; margin: 20px 0 8px; }
  .panel-col > .category:first-child .category-header { margin-top: 0; }
  .category-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
  .module-row { display: flex; align-items: flex-start; gap: 8px; }
  .module-row > details { flex: 1 1 auto; min-width: 0; }
```

And add this line inside the existing `@media (prefers-color-scheme: dark)` block (e.g. right after the `.field-hint, .panel-hint { color: #999; }` line, currently line 151):

```css
    .category-title { color: #999; }
```

- [ ] **Step 5: Regenerate and run the full suite.**

Run:
```bash
python3 build_apps.py
cd tool && node --test
```
Expected: `wrote tool/index.html` / `wrote plugin/ui.html` / `wrote plugin/code.js`, then **46/46 pass** (all existing tests, including the four drift tests, stay green — the restructure changes DOM assembly only, no logic/exporters/figma-map, and the drift tests confirm the regenerated files embed the edited `studio-ui.js` + `studio.css` verbatim).

- [ ] **Step 6: Headless Chrome smoke — web app.**

Run the Global-Constraints Chrome command against `file:///Users/jinalee/Desktop/design-system-preset/tool/index.html`, output to `/private/tmp/claude-501/-Users-jinalee-Desktop-design-system-preset/79e956ca-d818-4d4b-80a5-8e5ce06264cf/scratchpad/web-categories.png`.
Expected: `grep -iE "error|uncaught|exception" /tmp/smoke.log` is empty (ignore GPU/GL noise). Screenshot shows the left column as six category sections — **Color, Typography, Spacing & Sizing, Effects, Motion, Layout** — each with an uppercase category title header followed by its module `<details>` (Color under Color; the five type modules under Typography in order fontSize→fontFamily→fontWeight→lineHeight→letterSpacing; etc.), the export/import section still at the very bottom, and NO export toggles/checkboxes beside modules or headers. Toolbar + preview + WCAG panel render normally.

- [ ] **Step 7: Commit.**

```bash
git add core/studio-ui.js core/studio.css tool/index.html plugin/ui.html plugin/code.js
git commit -m "feat(inline-export): categorize shared editor into 6 categories + add opt-in export hooks"
```

---

## Task 2: Plugin inline export toggles (`plugin/ui.template.html` + `plugin/README.md`)

**Files:**
- Modify: `plugin/ui.template.html`
- Modify: `plugin/README.md`
- Regenerate: `plugin/ui.html` (and, harmlessly, `tool/index.html`/`plugin/code.js`) via `build_apps.py`
- Verify: `tool/tests/*.mjs` (existing suite), headless Chrome on `plugin/ui.html`

**Interfaces:**
- Consumes (from Task 1): `createStudio` reading `moduleExtras(groupKey, cfg)`, `categoryHeaderExtras(categoryKey, cfg)`, `categoryBodyExtras(categoryKey, cfg)`; category keys `color/typography/spacing/effects/motion/layout`; `studio.el`, `studio.render`.
- Consumes (unchanged): `FM.GROUP_KEYS` (14 variable groups, no `shadow`); the Apply message contract `{type:'apply', config, selection, targets:{variables,textStyles,effectStyles}, textOptions:{weights,family}}`; `{type:'result', created, updated, failed}`.
- Produces: no exported interface (leaf shell).

- [ ] **Step 1: Replace the taxonomy/state block with `CAT_EXPORT` + helpers.**

In `plugin/ui.template.html`, replace the current `CATEGORIES` constant AND the leaf/master helper block (currently lines 70–106: the `// ---- Output category taxonomy` comment through the end of `setCategory`) with:

```js
  // ---- Export taxonomy: maps each shared editor category (by the category
  // KEY that core/studio-ui.js passes to the hooks) to its exportable items —
  // variable groups (-> `selection`) and style kinds (-> targets.textStyles /
  // targets.effectStyles). shadow is NOT here: it is exported as an Effect
  // Style via its own module toggle (see moduleExtras), not as a variable.
  var CAT_EXPORT = {
    color: { name: 'Color', vars: ['color'], styles: [] },
    typography: { name: 'Typography', vars: ['fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing'], styles: ['text'] },
    spacing: { name: 'Spacing & Sizing', vars: ['space', 'radius', 'borderWidth'], styles: [] },
    effects: { name: 'Effects', vars: ['opacity'], styles: ['effect'] },
    motion: { name: 'Motion', vars: ['duration', 'easing'], styles: [] },
    layout: { name: 'Layout', vars: ['zIndex', 'breakpoint'], styles: [] }
  };

  // Leaf state helpers over `selection` (variable groups) and
  // `targets.{textStyles,effectStyles}` (style kinds).
  function varOn(g) { return selection.indexOf(g) >= 0; }
  function setVar(g, on) {
    var i = selection.indexOf(g);
    if (on && i < 0) selection.push(g);
    else if (!on && i >= 0) selection.splice(i, 1);
  }
  function styleOn(kind) { return kind === 'text' ? targets.textStyles : targets.effectStyles; }
  function setStyle(kind, on) { if (kind === 'text') targets.textStyles = on; else targets.effectStyles = on; }
  // catStates: {all, none} across every exportable item (vars + styles) in a
  // category — drives the header master checkbox's checked/indeterminate.
  function catStates(spec) {
    var arr = spec.vars.map(varOn).concat(spec.styles.map(styleOn));
    return { all: arr.length > 0 && arr.every(Boolean), none: arr.every(function (x) { return !x; }) };
  }
  function setCategoryExport(spec, on) {
    spec.vars.forEach(function (g) { setVar(g, on); });
    spec.styles.forEach(function (k) { setStyle(k, on); });
  }
```

- [ ] **Step 2: Replace `renderOutputTargets` with the three hook functions.**

Replace the entire `renderOutputTargets` function (currently the block from its leading comment `// rightColumnExtras(cfg): six collapsible output-CATEGORY groups…` at line 118 through the function's closing `}` at line 209) with:

```js
  // ---- Export toggles, injected INTO the shared editor categories via the
  // three createStudio hooks (no separate output panel). Each is called by
  // studio.render() on every store change, so each rebuilds fresh nodes and
  // sets .checked/.indeterminate/.value as DOM PROPERTIES on the fresh node
  // (never via el() attrs — see the checked-attr bug note).

  // moduleExtras: the per-module toggle placed left of each editor module.
  // Variable groups -> a checkbox bound to `selection`. The shadow module ->
  // a checkbox bound to targets.effectStyles ("Effect", since shadow is an
  // Effect Style, not a variable). Modules with no export target -> null.
  function moduleExtras(groupKey) {
    var el = studio.el;
    if (groupKey === 'shadow') {
      var sid = 'ex-shadow';
      var scb = el('input', { type: 'checkbox', id: sid, 'aria-label': 'shadow를 Effect Style로 내보내기',
        onchange: function (e) { targets.effectStyles = e.target.checked; studio.render(); } });
      scb.checked = targets.effectStyles;
      return el('label', { class: 'export-toggle', for: sid, title: 'Effect Style로 내보내기' }, [scb, ' Effect']);
    }
    if (FM.GROUP_KEYS.indexOf(groupKey) < 0) return null; // not a variable group
    var id = 'ex-var-' + groupKey;
    var cb = el('input', { type: 'checkbox', id: id, 'aria-label': groupKey + '를 Variable로 내보내기',
      onchange: function (e) { setVar(groupKey, e.target.checked); studio.render(); } });
    cb.checked = varOn(groupKey);
    return el('label', { class: 'export-toggle', for: id, title: 'Variable로 내보내기' }, [cb, ' Var']);
  }

  // categoryHeaderExtras: the category master toggle in the category header.
  // Checked when all exportable items are on, indeterminate when some are;
  // toggling sets every item in the category. Given an aria-label (the header
  // title span beside it is a sibling, not a <label>, so the checkbox needs
  // its own accessible name).
  function categoryHeaderExtras(catKey) {
    var el = studio.el;
    var spec = CAT_EXPORT[catKey];
    if (!spec) return null;
    var id = 'ex-cat-' + catKey;
    var states = catStates(spec);
    var master = el('input', { type: 'checkbox', id: id, 'aria-label': spec.name + ' 전체 내보내기',
      onchange: function (e) { setCategoryExport(spec, e.target.checked); studio.render(); } });
    master.checked = states.all;
    master.indeterminate = !states.all && !states.none;
    return el('label', { class: 'export-master', for: id, title: spec.name + ' 전체 내보내기' }, [master]);
  }

  // categoryBodyExtras: only Typography gets one — the composite Text Styles
  // item (checkbox + weight checks + font-family input), appended at the end
  // of the Typography category body. It has no editor module of its own (it
  // is a synthesized output), so it lives here, not as a moduleExtras cell.
  // The font input keeps the stable id 'plugin-font-family' so the shared
  // render()'s focus/caret-preservation re-latches onto it across rebuilds.
  function categoryBodyExtras(catKey) {
    if (catKey !== 'typography') return null;
    var el = studio.el;
    var id = 'ex-style-text';
    var cb = el('input', { type: 'checkbox', id: id,
      onchange: function (e) { targets.textStyles = e.target.checked; studio.render(); } });
    cb.checked = targets.textStyles;
    var children = [el('label', { class: 'sel-row', for: id }, [cb, ' Text Styles'])];
    if (targets.textStyles) {
      var weightChecks = ['regular', 'medium', 'semibold', 'bold'].map(function (w) {
        var wid = 'wt-' + w;
        var wcb = el('input', { type: 'checkbox', id: wid,
          onchange: function (e) {
            var i = textWeights.indexOf(w);
            if (e.target.checked && i < 0) textWeights.push(w);
            else if (!e.target.checked && i >= 0) textWeights.splice(i, 1);
          } });
        wcb.checked = textWeights.indexOf(w) >= 0;
        return el('label', { class: 'wt-row', for: wid }, [wcb, ' ' + w]);
      });
      var fontInputId = 'plugin-font-family';
      var fontLabel = el('label', { class: 'font-label', for: fontInputId, text: '폰트 패밀리' });
      var fontInput = el('input', { type: 'text', id: fontInputId, class: 'font-input',
        value: fontFamily, 'aria-label': '폰트 패밀리',
        oninput: function (e) { fontFamily = e.target.value; } });
      children.push(el('div', { class: 'sel-grid' }, weightChecks));
      children.push(fontLabel);
      children.push(fontInput);
    }
    return el('div', { class: 'export-textstyles' }, children);
  }
```

- [ ] **Step 3: Pass the three hooks to `createStudio` (drop `rightColumnExtras`).**

Replace the `createStudio` call (currently lines 254–259):

```js
  var studio = window.StudioUI.createStudio({
    C: C, store: store,
    appEl: document.getElementById('app'),
    toolbarEl: document.getElementById('toolbar'),
    rightColumnExtras: renderOutputTargets
  });
```

with:

```js
  var studio = window.StudioUI.createStudio({
    C: C, store: store,
    appEl: document.getElementById('app'),
    toolbarEl: document.getElementById('toolbar'),
    moduleExtras: moduleExtras,
    categoryHeaderExtras: categoryHeaderExtras,
    categoryBodyExtras: categoryBodyExtras
  });
```

`renderCTA`, the `var studio` forward-reference pattern (hooks close over `studio`, which is assigned before `studio.render()` runs), `window.onmessage`, and the final `studio.render()` are all unchanged.

- [ ] **Step 4: Update the plugin `<style>` block — add export-toggle CSS, remove dead rules.**

In the plugin `<style>` block, REMOVE these now-unused rules (the old separate-panel styles): the entire `.group { … }` rule, the `.group-title { … }` rule, and the `.cat-master { … }` rule. Keep `.sel-grid`, `.sel-row`, `.wt-row`, `.font-input`, `.font-label`, `#cta-bar` + `.cta-*`, and `#app { padding-bottom: 64px; }` (all still used). In the dark-mode block, remove the now-dead `.group { background:…; border-color:…; }` rule; keep the `#cta-bar` and `.cta-fails` dark overrides.

Then ADD these light-mode rules (e.g. right after the `.sel-row, .wt-row { … }` rule):

```css
.export-toggle { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: #555; white-space: nowrap; padding-top: 10px; cursor: pointer; }
.export-master { display: inline-flex; align-items: center; }
.export-textstyles { margin: 6px 0 12px; padding: 8px 10px; border: 1px dashed #ccc; border-radius: 6px; }
```

And ADD these to the `@media (prefers-color-scheme: dark)` block:

```css
  .export-toggle { color: #aaa; }
  .export-textstyles { border-color: #444; }
```

- [ ] **Step 5: Update the top-of-IIFE header comment.**

The plugin shell's opening comment block (currently lines 51–59) describes owning "the output-target section (a 6-category tree … supplied to createStudio() via rightColumnExtras)". Update it to describe the new model: the shell injects per-module + per-category export toggles into the shared editor categories via the `moduleExtras`/`categoryHeaderExtras`/`categoryBodyExtras` hooks (no separate output panel), plus the sticky bottom "Figma에 적용" CTA bar. Keep it factually accurate to the code below it.

- [ ] **Step 6: Regenerate and run the full suite.**

Run:
```bash
python3 build_apps.py
cd tool && node --test
```
Expected: clean regeneration, **46/46 pass**. The drift test `generated plugin/ui.html contains token-core, studio-ui, figma-map and studio.css verbatim` confirms the edited template still embeds the cores; `figma-map`/`plugin-apply` tests are untouched (the Apply message shape is unchanged).

- [ ] **Step 7: Parse check the plugin UI script.**

Run:
```bash
node --input-type=module -e "import {readFileSync} from 'fs'; const h=readFileSync('plugin/ui.html','utf8'); const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(s=>s.includes('createStudio')); new Function(m[0]); console.log('plugin ui script parse OK');"
```
Expected: `plugin ui script parse OK` (catches syntax errors the drift test cannot).

- [ ] **Step 8: Headless Chrome smoke — plugin UI.**

Run the Global-Constraints Chrome command against `file:///Users/jinalee/Desktop/design-system-preset/plugin/ui.html`, output to `/private/tmp/claude-501/-Users-jinalee-Desktop-design-system-preset/79e956ca-d818-4d4b-80a5-8e5ce06264cf/scratchpad/plugin-inline.png`.
Expected: `grep -iE "error|uncaught|exception" /tmp/smoke.log` empty. Screenshot shows: six category sections, each header with a master export checkbox (left of the uppercase title) reflecting all/some/none (Effects and Typography show indeterminate by default — style leaves off, var leaves on); a `Var` toggle left of each variable module; an `Effect` toggle left of the shadow module (under Effects); the composite **Text Styles** item at the bottom of Typography (checkbox unchecked by default, so weight checks + font input are hidden); NO separate output panel; the fixed bottom `Figma에 적용` bar present. Toggle the Text Styles checkbox path is not scriptable in a static smoke, so confirm structure only.

- [ ] **Step 9: Update `plugin/README.md`.**

Replace the "## Use" list and the "## Output categories" section with wording for the inline model. Concretely:

Under **## Use**, replace the middle two bullets so it reads:
```markdown
## Use
- Tweak tokens in the panel (same editor as the web app), now organized into 6 categories.
- Turn on what to export using the toggles inside each category (see next section).
- Click "Figma에 적용" (always visible at the bottom) → writes every checked item.
- Re-applying updates in place (no duplicates).
```

Replace the **## Output categories** section body with:
```markdown
## Export toggles (inline)
Export options live inside the editor, not in a separate panel. Each category header has a master checkbox that turns the whole category on/off (and shows all/some/none); each editor module has its own toggle to its left — `Var` for variable groups, `Effect` for the shadow module (shadow is exported ONLY as an Effect Style, never a variable). Typography also has a composite **Text Styles** item at the bottom: check it to reveal the weight checkboxes + font-family input.

"Figma에 적용" (always visible at the bottom) writes the checked items. Failure reasons (e.g. an unavailable font) are listed in the bottom bar.
```

Leave the two "Manual QA" checklists and the "## Note" section as-is except: in the first "## Manual QA checklist", change the "Deselect some categories/leaves" bullet to "Deselect some categories/module toggles → only checked items written." In "### Manual QA (Figma desktop)", change the first bullet to "Six categories render, each header with a master export toggle + per-module toggles; the master reflects all/some/none."

- [ ] **Step 10: Commit.**

```bash
git add plugin/ui.template.html plugin/ui.html plugin/README.md tool/index.html plugin/code.js
git commit -m "feat(inline-export): co-locate plugin export toggles in editor categories; remove separate panel"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** §2 decisions all mapped — 6 categories (T1 CATEGORIES), shared/web-categorized (T1 render + no hooks in web shell), plugin-only toggles via hooks (T1 hooks + T2 wiring), category master + per-module (T2 categoryHeaderExtras + moduleExtras), no nested collapsible (categories are `<section>`/`<div>` headers, modules stay `<details>`), shadow→Effect Style (T2 moduleExtras shadow branch), Text Styles composite in Typography (T2 categoryBodyExtras), separate panel removed (T2 Step 2 + Step 3 dropping rightColumnExtras). §7 tests: existing suite + drift + Chrome smoke both apps. §8 outputs all covered.
- **Type consistency:** hook names identical across T1 (defined) and T2 (passed): `moduleExtras`/`categoryHeaderExtras`/`categoryBodyExtras`. Category keys identical in T1 `CATEGORIES` and T2 `CAT_EXPORT` (`color/typography/spacing/effects/motion/layout`). `FM.GROUP_KEYS` used for the variable/shadow discrimination in `moduleExtras`.
- **Placeholder scan:** none — every code step shows full code; the README step gives exact replacement text.
- **Focus/state:** module `<details>` ids unchanged (renderModule delegates to the unchanged renderers); `#panel-col` unchanged; `plugin-font-family` id preserved. Category wrappers non-focusable.
