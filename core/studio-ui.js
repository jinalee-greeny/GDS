// ---- Shared editor UI: control panels, previews, contrast panel, toolbar,
// capture/restore-on-rebuild, and the createStudio() factory. Consumed by
// both the web app (tool/) and the Figma plugin UI via createStudio({...}).
// Web-shell-only export/import UI is NOT here — it is supplied by the shell
// via opts.rightColumnExtras (see render() below). CSS lives in the sibling
// core/studio.css file, not in this module.
(function (root) {
  'use strict';

  function createStudio(opts) {
    var C = opts.C;
    var store = opts.store;
    var app = opts.appEl;
    var toolbarNode = opts.toolbarEl;
    var rightColumnExtras = opts.rightColumnExtras || function () { return null; };
    var moduleExtras = opts.moduleExtras || function () { return null; };
    var categoryHeaderExtras = opts.categoryHeaderExtras || function () { return null; };
    var categoryBodyTop = opts.categoryBodyTop || function () { return null; };
    var categoryBodyExtras = opts.categoryBodyExtras || function () { return null; };
    // How depth-2 modules are laid out inside a category. 'tabs' (web shell):
    // one module shown at a time via a tab bar. 'accordion' (default, plugin):
    // each module is its own collapsible — required there because the plugin
    // injects a per-module export toggle (moduleExtras) that must stay visible
    // alongside every module, which a one-at-a-time tab view would hide.
    var moduleLayout = opts.moduleLayout || 'accordion';
    var categoryTabState = {}; // cat.key -> active module groupKey (tabs mode)
    // Overall shell layout. 'master-detail' (web): a top domain selector shows
    // ONE domain at a time with its preview (left) beside its settings (right).
    // 'stacked' (default, plugin): all categories + full preview, as the plugin
    // export workflow needs every category's toggles visible at once.
    var layout = opts.layout || 'stacked';
    var activeDomain = 'color'; // master-detail: selected domain key

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function getAtPath(obj, path) {
    var node = obj;
    for (var i = 0; i < path.length; i++) node = node[path[i]];
    return node;
  }

  // ---- Cross-cutting UI state preserved across the full-rebuild render() ---
  // render() nukes and rebuilds the whole DOM on every store change (see
  // render() below). Besides focus/caret (pre-existing), two more pieces of
  // transient UI state must survive that rebuild or every keystroke would
  // visibly disrupt the user (heuristic #1/#3): which <details> groups are
  // open, and how far the two scrollable columns are scrolled. Both are
  // captured from the live DOM right before innerHTML='' and written back
  // right after the new tree is appended (see captureUIState/restoreUIState).
  var detailsOpenState = {}; // id -> boolean, persists across renders
  // Set by a control right before it triggers a store change whose newly-
  // created DOM node (e.g. a freshly-added kv row) should receive focus once
  // render() finishes rebuilding — used when there is no PRE-EXISTING node/id
  // for the focus-preservation-by-activeElement path to latch onto. Consumed
  // (read once, then cleared) inside restoreUIState().
  var pendingFocusId = null;
  // Modular-scale Base/Ratio are ephemeral helper inputs — they are NOT part
  // of the config (only the "Apply modular scale" button writes their effect
  // into cfg.fontSize). Because render() rebuilds their DOM on every store
  // change, rendering them from string literals would silently revert a
  // typed-but-not-yet-applied value on any unrelated re-render. Backing them
  // with this module-scoped state (updated on their oninput) makes the typed
  // VALUE persist across rebuilds, the same way ids make focus persist.
  var modScaleState = { base: '16', ratio: '1.25' };
  function isDetailsOpen(id, defaultOpen) {
    return Object.prototype.hasOwnProperty.call(detailsOpenState, id) ? detailsOpenState[id] : defaultOpen;
  }
  // Builds the attrs object for a <details id> whose open/closed state should
  // persist. `defaultOpen` only applies the FIRST time this id is ever seen
  // (i.e. first paint) — after that, whatever the user last left it as wins.
  function detailsAttrs(id, defaultOpen, extraClass) {
    var attrs = { id: id };
    if (extraClass) attrs.class = extraClass;
    if (isDetailsOpen(id, defaultOpen)) attrs.open = 'open';
    return attrs;
  }

  // The per-group "초기화" (reset) button is rendered as the FIRST child of the
  // group BODY (inside <details>, after </summary>) — NOT inside <summary>.
  // A <button> nested in <summary> competes with the disclosure toggle and
  // has uncertain keyboard/AT behavior, so it lives in the body instead. It's
  // visible whenever the group is expanded, which is exactly when the user is
  // editing/resetting that group, and its Enter/Space activation only fires
  // the reset (never toggles the disclosure) because it no longer sits on the
  // summary's event path.
  function groupResetBtn(labelText, groupKey) {
    return el('button', {
      type: 'button', class: 'group-reset-btn',
      'aria-label': labelText + ' group: reset to defaults',
      onclick: function () {
        if (window.confirm(labelText + ' 그룹을 기본값으로 되돌릴까요? (실행 취소로 복구 가능)')) {
          store.resetGroup(groupKey);
        }
      }
    }, iconLabel('reset', 'Reset'));
  }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      var deferredValue, hasValue = false;
      Object.keys(attrs).forEach(function (k) {
        if (k === 'value') { deferredValue = attrs[k]; hasValue = true; return; }
        if (k === 'class') n.className = attrs[k];
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (k === 'text') n.textContent = attrs[k];
        else n.setAttribute(k, attrs[k]);
      });
      // Apply `value` LAST: a range input clamps/snaps to its CURRENT
      // min/max/step, so setting value before those (via attribute order) pegs
      // it to the defaults (max 100, step 1) — e.g. H 268 -> 100, Cpk 0.19 -> 0.
      if (hasValue) n.value = deferredValue;
    }
    (children || []).forEach(function (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  // Phosphor Icons (regular, MIT) — https://github.com/phosphor-icons/core
  // Inlined as raw path data because this app must run offline: the Figma
  // plugin manifest is networkAccess:none and the web build is a single
  // self-contained HTML file, so no CDN/npm import is possible.
  var ICONS = {
    undo: 'M236,144a68.07,68.07,0,0,1-68,68H80a12,12,0,0,1,0-24h88a44,44,0,0,0,0-88H61l27.52,27.51a12,12,0,0,1-17,17l-48-48a12,12,0,0,1,0-17l48-48a12,12,0,1,1,17,17L61,76H168A68.08,68.08,0,0,1,236,144Z',
    redo: 'M167.51,127.51,195,100H88a44,44,0,0,0,0,88h88a12,12,0,0,1,0,24H88A68,68,0,0,1,88,76H195L167.51,48.49a12,12,0,1,1,17-17l48,48a12,12,0,0,1,0,17l-48,48a12,12,0,0,1-17-17Z',
    reset: 'M228,128a100,100,0,0,1-98.66,100H128a99.39,99.39,0,0,1-68.62-27.29,12,12,0,0,1,16.48-17.45,76,76,0,1,0-1.57-109c-.13.13-.25.25-.39.37L54.89,92H72a12,12,0,0,1,0,24H24a12,12,0,0,1-12-12V56a12,12,0,0,1,24,0V76.72L57.48,57.06A100,100,0,0,1,228,128Z',
    trash: 'M216,48H180V36A28,28,0,0,0,152,8H104A28,28,0,0,0,76,36V48H40a12,12,0,0,0,0,24h4V208a20,20,0,0,0,20,20H192a20,20,0,0,0,20-20V72h4a12,12,0,0,0,0-24ZM100,36a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4V48H100Zm88,168H68V72H188ZM116,104v64a12,12,0,0,1-24,0V104a12,12,0,0,1,24,0Zm48,0v64a12,12,0,0,1-24,0V104a12,12,0,0,1,24,0Z',
    plus: 'M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z'
  };
  // SVG needs the SVG namespace, so it can't go through el() (createElement).
  function icon(name) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 256 256');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', ICONS[name]);
    p.setAttribute('fill', 'currentColor');
    svg.appendChild(p);
    return svg;
  }
  // Icon + text label as a button's children (icon leads, text follows).
  function iconLabel(name, text) { return [icon(name), el('span', { text: text })]; }

  var FONT_SIZE_ORDER = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'];

  // A color field = a labelled range slider + paired number input, both driving
  // the same palette key. During a slider DRAG we only repaint live (no store
  // write, so the DOM node survives and keeps pointer capture); we commit once
  // on 'change' (drag end / keyboard commit) for exactly one undo step. The
  // number input commits on its own 'input' (safe: render() restores focus/caret).
  // min/max/step constrain what can be typed (error prevention, heuristic #5);
  // the number field still commits live on every keystroke (unchanged from
  // before, so typing/undo granularity isn't regressed) but a 'change'
  // handler clamps the FINAL value once the user leaves the field, so an
  // out-of-range value never persists past a blur/Enter. Clamping on every
  // keystroke instead would snap the displayed value mid-type, fighting the
  // user — brief calls for "clamp on change" specifically.
  function colorField(hue, keyName, labelText, value, min, max, step, refs, hintText) {
    var baseId = 'ctl-color-' + hue + '-' + keyName;
    var hintId = baseId + '-hint';
    function commitClamped(raw) {
      // On blur/Enter: if the field is empty or non-numeric, restore it to
      // the live store value instead of snapping to 0 — a blurred-empty
      // field must never linger blank nor corrupt the palette.
      if (raw === '' || isNaN(Number(raw))) {
        number.value = String(store.get().color.palettes[hue][keyName]);
        return;
      }
      store.setPath(['color', 'palettes', hue, keyName], clamp(Number(raw), min, max));
    }
    var number = el('input', {
      type: 'number', id: baseId, value: String(value),
      min: String(min), max: String(max), step: String(step), 'aria-describedby': hintId,
      oninput: function (e) {
        var raw = e.target.value;
        // Don't commit while the field is mid-edit-empty or non-numeric; this
        // lets the user clear-and-retype without the value snapping to 0 and
        // triggering a rebuild.
        if (raw === '' || isNaN(Number(raw))) return;
        store.setPath(['color', 'palettes', hue, keyName], Number(raw));
      },
      onchange: function (e) { commitClamped(e.target.value); }
    });
    var range = el('input', {
      type: 'range', id: baseId + '-range', 'aria-label': labelText + ' (slider)', 'aria-describedby': hintId,
      value: String(value), min: String(min), max: String(max), step: String(step),
      oninput: function (e) {
        var v = Number(e.target.value);
        number.value = String(v);        // keep paired number in sync, no commit
        refs.repaint();                  // live swatch repaint, DOM preserved
      },
      onchange: function (e) { commitClamped(e.target.value); }
    });
    refs[keyName] = { number: number, range: range };
    var label = el('label', { for: baseId, text: labelText });
    var hint = el('span', { id: hintId, class: 'field-hint', text: hintText || '' });
    return el('div', { class: 'field-row' }, [label, range, number, hint]);
  }

  function renderHueRow(cfg, ramps, hue) {
    var p = cfg.color.palettes[hue];
    var swatchNodes = {};
    var swatches = C.DEFAULT_CONFIG.steps.map(function (step) {
      var hex = ramps[hue][String(step)];
      var node = el('div', {
        class: 'swatch', id: 'swatch-' + hue + '-' + step,
        style: 'background:' + hex, title: hue + ' ' + step + ' ' + hex
      });
      swatchNodes[String(step)] = node;
      return node;
    });
    var strip = el('div', { class: 'swatch-strip', role: 'img', 'aria-label': hue + ' ramp preview' }, swatches);

    var refs = {
      // recompute this hue's ramp from the CURRENT live control values and
      // repaint the existing swatch nodes in place (no rebuild).
      repaint: function () {
        var liveH = Number(refs.H.range.value);
        var liveCpk = Number(refs.Cpk.range.value);
        var ramp = C.buildRamp(liveH, liveCpk, cfg.curves.Lc, cfg.curves.Cm);
        C.DEFAULT_CONFIG.steps.forEach(function (step) {
          var hex = ramp[String(step)];
          var node = swatchNodes[String(step)];
          node.style.background = hex;
          node.title = hue + ' ' + step + ' ' + hex;
        });
      }
    };

    var hRow = colorField(hue, 'H', 'H', p.H, 0, 360, 1, refs, '권장 범위 0–360 (색상 각도)');
    var cpkRow = colorField(hue, 'Cpk', 'Cpk', p.Cpk, 0, 0.4, 0.005, refs, '권장 범위 0–0.4 (채도 피크)');
    return el('div', { class: 'hue-row' }, [
      el('div', { class: 'hue-title', text: hue }),
      hRow, cpkRow, strip
    ]);
  }

  function renderCurveEditor(cfg) {
    function curveCell(id, label, path, v, lo, hi, step) {
      var input = el('input', {
        type: 'number', id: id, value: String(v), min: String(lo), max: String(hi), step: String(step),
        oninput: function (e) {
          var raw = e.target.value;
          if (raw === '' || isNaN(Number(raw))) return; // allow clear-and-retype
          store.setPath(path, Number(raw));
        },
        onchange: function (e) {
          var raw = e.target.value;
          if (raw === '' || isNaN(Number(raw))) { input.value = String(getAtPath(store.get(), path)); return; }
          store.setPath(path, clamp(Number(raw), lo, hi));
        }
      });
      var lbl = el('label', { for: id, text: label });
      return el('div', { class: 'curve-cell' }, [lbl, input]);
    }
    var lcCells = cfg.curves.Lc.map(function (v, i) {
      return curveCell('ctl-curve-Lc-' + i, 'Lc[' + C.DEFAULT_CONFIG.steps[i] + ']', ['curves', 'Lc', i], v, 0, 1, 0.001);
    });
    var cmCells = cfg.curves.Cm.map(function (v, i) {
      return curveCell('ctl-curve-Cm-' + i, 'Cm[' + C.DEFAULT_CONFIG.steps[i] + ']', ['curves', 'Cm', i], v, 0, 2, 0.01);
    });
    return el('details', detailsAttrs('grp-curves', false), [
      el('summary', { text: 'Advanced curve (shared Lc / Cm)' }),
      el('div', { class: 'group-body' }, [
        groupResetBtn('Advanced curve (shared Lc / Cm)', 'curves'),
        el('p', { class: 'panel-hint', text: '권장 범위 — Lc(밝기): 0–1, Cm(채도 배율): 0–2. 11스텝(50–950) 공통 커브.' }),
        el('h2', { text: 'Lc (lightness per step)' }),
        el('div', { class: 'curve-grid' }, lcCells),
        el('h2', { text: 'Cm (chroma multiplier per step)' }),
        el('div', { class: 'curve-grid' }, cmCells)
      ])
    ]);
  }

  // Module bodies are split out (colorPanelBody/typePanelBody/kvSectionBody)
  // so the tab layout can render just the content, while the accordion layout
  // wraps the same body in a <details>. Titled "Palette" (not "Color") so it
  // doesn't just echo its parent category "Color".
  function colorPanelBody(cfg) {
    var ramps = C.buildAllRamps(cfg);
    var rows = cfg.color.order.map(function (hue) { return renderHueRow(cfg, ramps, hue); });
    return el('div', { class: 'group-body' }, [groupResetBtn('Palette', 'color')].concat(rows).concat([renderCurveEditor(cfg)]));
  }
  function renderColorPanel(cfg) {
    return el('details', detailsAttrs('grp-color', true, 'group'), [
      el('summary', { text: 'Palette' }), colorPanelBody(cfg)
    ]);
  }

  function typePanelBody(cfg) {
    var rows = FONT_SIZE_ORDER.map(function (key) {
      var id = 'ctl-fontsize-' + key;
      var px = parseFloat(cfg.fontSize[key]);
      var input = el('input', {
        type: 'number', id: id, value: String(px), min: '0', step: '1',
        oninput: function (e) {
          var raw = e.target.value;
          if (raw === '' || isNaN(Number(raw))) return; // allow clear-and-retype
          store.setPath(['fontSize', key], String(Number(raw)) + 'px'); // stays 'Npx'
        },
        onchange: function (e) {
          var raw = e.target.value;
          if (raw === '' || isNaN(Number(raw))) { input.value = String(parseFloat(store.get().fontSize[key])); return; }
          store.setPath(['fontSize', key], String(clamp(Number(raw), 0, 999)) + 'px');
        }
      });
      var label = el('label', { for: id, text: key });
      return el('div', { class: 'type-row' }, [label, input, el('span', { text: 'px' })]);
    });

    var baseId = 'ctl-modscale-base', ratioId = 'ctl-modscale-ratio';
    var baseInput = el('input', {
      type: 'number', id: baseId, value: modScaleState.base, min: '0', step: '1',
      oninput: function (e) { modScaleState.base = e.target.value; },
      onchange: function (e) {
        var v = String(clamp(Number(e.target.value), 0, 999));
        e.target.value = v; modScaleState.base = v;
      }
    });
    var ratioInput = el('input', {
      type: 'number', id: ratioId, value: modScaleState.ratio, min: '0.1', step: '0.01',
      oninput: function (e) { modScaleState.ratio = e.target.value; },
      onchange: function (e) {
        var v = String(clamp(Number(e.target.value), 0.1, 10));
        e.target.value = v; modScaleState.ratio = v;
      }
    });
    var applyBtn = el('button', {
      type: 'button', text: 'Apply modular scale',
      onclick: function () {
        var base = clamp(Number(modScaleState.base), 0, 999);
        var ratio = clamp(Number(modScaleState.ratio), 0.1, 10);
        var mdIndex = FONT_SIZE_ORDER.indexOf('md');
        var next = {};
        FONT_SIZE_ORDER.forEach(function (key, i) {
          var n = i - mdIndex;
          var px = C.pyRound(base * Math.pow(ratio, n));
          next[key] = String(px) + 'px';
        });
        store.setPath(['fontSize'], next);
      }
    });
    var modScale = el('div', { class: 'modular-scale' }, [
      el('div', { class: 'field' }, [el('label', { for: baseId, text: 'Base (px)' }), baseInput]),
      el('div', { class: 'field' }, [el('label', { for: ratioId, text: 'Ratio' }), ratioInput]),
      applyBtn
    ]);

    return el('div', { class: 'group-body' }, [
      groupResetBtn('Type Scale', 'fontSize'),
      el('p', { class: 'panel-hint', text: 'px 단위, 0 이상의 정수 권장. 각 스텝은 개별 수동값 — "Apply modular scale"로 base×ratio 커브를 일괄 채운 뒤 개별 수정할 수 있습니다.' })
    ].concat(rows).concat([modScale]));
  }
  function renderTypePanel(cfg) {
    return el('details', detailsAttrs('grp-fontSize', true, 'group'), [
      el('summary', { text: 'Type Scale' }), typePanelBody(cfg)
    ]);
  }

  // ---- List-scale (key/value) editors ----------------------------------
  // A "group" is a flat object like cfg.space = {'0':'0px','1':'4px',...}.
  // Renaming/adding/removing a key rebuilds the whole object (order preserved
  // via the live key list, then a single setGroup commit) rather than
  // mutating in place, since plain JS objects have no stable key-rename op.
  function setGroup(groupKey, obj) {
    store.setPath([groupKey], obj);
  }

  function showKVMessage(msgEl, text) {
    if (!msgEl) return;
    msgEl.textContent = text;
    if (msgEl._kvClearTimer) clearTimeout(msgEl._kvClearTimer);
    msgEl._kvClearTimer = setTimeout(function () { msgEl.textContent = ''; }, 4000);
  }

  // Renders one row per entry of store.get()[groupKey], plus an "Add row"
  // button. Row ids are INDEX-based (ctl-kv-<groupKey>-<i>-key/-val), not
  // key-based, because the key text itself is editable — an id derived from
  // the key would change out from under focus-preservation on every
  // keystroke of a rename. Index stays stable across re-renders as long as
  // rows aren't added/removed, which is exactly when focus needs to survive
  // (plain value edits, and key edits prior to the commit that revalidates).
  function renderKVGroup(groupKey, opts) {
    opts = opts || {};
    var labelText = opts.label || groupKey;
    var placeholder = opts.placeholder || '';
    var cfg = store.get();
    var group = cfg[groupKey] || {};
    var keys = Object.keys(group);

    var rows = keys.map(function (key, i) {
      var keyId = 'ctl-kv-' + groupKey + '-' + i + '-key';
      var valId = 'ctl-kv-' + groupKey + '-' + i + '-val';
      var msgId = 'ctl-kv-' + groupKey + '-' + i + '-msg';

      // Key rename commits on 'change' (blur/Enter), not 'input'. Unlike
      // value edits, a key is validated (non-empty, unique in this group)
      // before it can commit; validating per-keystroke would revert the
      // field mid-edit (e.g. the instant a user backspaces it to empty),
      // making it impossible to actually clear-and-retype a key. Committing
      // once the user leaves the field keeps the guard from fighting typing.
      var keyInput = el('input', {
        type: 'text', id: keyId, class: 'kv-key', value: key,
        'aria-label': labelText + ' key ' + (i + 1),
        onkeydown: function (e) { if (e.key === 'Enter') e.target.blur(); },
        onchange: function (e) {
          var newKey = e.target.value;
          var msgEl = document.getElementById(msgId);
          if (newKey === key) return; // unchanged, nothing to do
          var liveGroup = store.get()[groupKey];
          var liveKeys = Object.keys(liveGroup);
          if (newKey === '') {
            e.target.value = key;
            showKVMessage(msgEl, '키는 비워둘 수 없습니다.');
            return;
          }
          if (liveKeys.indexOf(newKey) !== -1) {
            e.target.value = key;
            showKVMessage(msgEl, '이미 존재하는 키입니다: ' + newKey);
            return;
          }
          var next = {};
          liveKeys.forEach(function (k) {
            next[k === key ? newKey : k] = liveGroup[k];
          });
          setGroup(groupKey, next);
        }
      });

      var valInput = el('input', {
        type: 'text', id: valId, class: 'kv-val', value: group[key], placeholder: placeholder,
        'aria-label': labelText + ' value (' + key + ')',
        oninput: function (e) {
          store.setPath([groupKey, key], e.target.value);
        }
      });

      var removeBtn = el('button', {
        type: 'button', class: 'kv-del-btn', 'aria-label': 'Delete ' + labelText + ' item: ' + key,
        onclick: function () {
          var liveGroup = store.get()[groupKey];
          var next = {};
          Object.keys(liveGroup).forEach(function (k) { if (k !== key) next[k] = liveGroup[k]; });
          setGroup(groupKey, next);
        }
      }, [icon('trash')]); // icon-only (aria-label carries the meaning); the
      // label repeats on every KV row, so text would just add clutter.

      // role="alert" already implies an assertive live region on its own;
      // pairing it with aria-live="polite" is redundant (and contradictory —
      // alert=assertive vs polite) so role="alert" alone is kept.
      var msg = el('span', { id: msgId, class: 'kv-msg', role: 'alert' });

      return el('div', { class: 'kv-row' }, [keyInput, valInput, removeBtn, msg]);
    });

    var addBtn = el('button', {
      type: 'button', class: 'kv-add-row',
      onclick: function () {
        var liveGroup = store.get()[groupKey];
        var liveKeys = Object.keys(liveGroup);
        var base = 'new', candidate = base, n = 1;
        while (liveKeys.indexOf(candidate) !== -1) { candidate = base + n; n++; }
        var next = {};
        liveKeys.forEach(function (k) { next[k] = liveGroup[k]; });
        next[candidate] = opts.newValue != null ? opts.newValue : '';
        // The new row will render at index liveKeys.length (Object.keys order:
        // integer-like keys ascending first, then insertion order for the
        // rest — a freshly-added non-numeric key like "new"/"new1" always
        // sorts last). No id exists yet to focus-preserve onto, so stash the
        // id render() should focus once the new row exists (cheap win for
        // heuristic #7: keep typing straight into the new key without a
        // manual click).
        pendingFocusId = 'ctl-kv-' + groupKey + '-' + liveKeys.length + '-key';
        setGroup(groupKey, next);
      }
    }, iconLabel('plus', 'Add row'));

    return el('div', { class: 'kv-group-body' }, rows.concat([addBtn]));
  }

  function kvSectionBody(groupKey, labelText, opts) {
    var sectionOpts = Object.assign({ label: labelText }, opts || {});
    return el('div', { class: 'group-body' }, [groupResetBtn(labelText, groupKey), renderKVGroup(groupKey, sectionOpts)]);
  }
  function renderKVSection(groupKey, labelText, opts) {
    return el('details', detailsAttrs('grp-' + groupKey, false, 'group'), [
      el('summary', { text: labelText }), kvSectionBody(groupKey, labelText, opts)
    ]);
  }

  var KV_GROUPS = [
    ['space', 'Space', { placeholder: '예: 16px' }],
    ['radius', 'Radius', { placeholder: '예: 8px' }],
    ['borderWidth', 'Border width', { placeholder: '예: 2px' }],
    ['opacity', 'Opacity', { placeholder: '예: 0.5' }],
    ['shadow', 'Shadow', { placeholder: '예: 0 2px 6px rgba(0,0,0,.1)' }],
    ['zIndex', 'Z-index', { placeholder: '예: 1000' }],
    ['breakpoint', 'Breakpoint', { placeholder: '예: 768px' }],
    ['duration', 'Duration', { placeholder: '예: 200ms' }],
    ['easing', 'Easing', { placeholder: '예: cubic-bezier(0.4,0,0.2,1)' }],
    ['fontFamily', 'Font family', { placeholder: '예: Pretendard, sans-serif' }],
    ['fontWeight', 'Font weight', { placeholder: '예: 600' }],
    ['lineHeight', 'Line height', { placeholder: '예: 1.5' }],
    ['letterSpacing', 'Letter spacing', { placeholder: '예: 0.025em' }]
  ];

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

  function moduleTitle(groupKey) {
    if (groupKey === 'color') return 'Palette';
    if (groupKey === 'fontSize') return 'Type Scale';
    return KV_MAP[groupKey] ? KV_MAP[groupKey].label : groupKey;
  }
  function renderModuleBody(groupKey, cfg) {
    if (groupKey === 'color') return colorPanelBody(cfg);
    if (groupKey === 'fontSize') return typePanelBody(cfg);
    var entry = KV_MAP[groupKey];
    return kvSectionBody(groupKey, entry.label, entry.opts);
  }

  // Tabs layout (web shell): one module body shown at a time under a tab bar.
  // A single-module category needs no tabs — its body shows directly (which
  // also drops the otherwise-redundant module title, e.g. COLOR's "Palette").
  // Active tab persists in categoryTabState across full re-renders; switching
  // a tab only swaps the panel contents (no store write, no global rebuild).
  function renderTabbedModules(cat, cfg) {
    if (cat.modules.length === 1) return [renderModuleBody(cat.modules[0], cfg)];
    var active = cat.modules.indexOf(categoryTabState[cat.key]) === -1
      ? cat.modules[0] : categoryTabState[cat.key];
    var panel = el('div', { class: 'mod-tabpanel' }, [renderModuleBody(active, cfg)]);
    var tabs = cat.modules.map(function (groupKey) {
      var btn = el('button', {
        type: 'button', class: 'mod-tab', role: 'tab',
        'aria-selected': groupKey === active ? 'true' : 'false',
        onclick: function () {
          categoryTabState[cat.key] = groupKey;
          tabs.forEach(function (b) { b.setAttribute('aria-selected', 'false'); });
          btn.setAttribute('aria-selected', 'true');
          panel.innerHTML = '';
          panel.appendChild(renderModuleBody(groupKey, store.get()));
        }
      }, [moduleTitle(groupKey)]);
      return btn;
    });
    return [el('div', { class: 'mod-tabs', role: 'tablist' }, tabs), panel];
  }

  // A category is now itself a collapsible <details> (default closed), whose
  // <summary> is the category header and whose body holds the module
  // <details> (2-level nesting). Open/close persistence works unchanged:
  // captureUIState scans document.querySelectorAll('details[id]') globally, so
  // the category <details id="cat-*"> is captured/restored alongside the
  // module <details> inside it. categoryHeaderExtras feeds the summary and
  // MUST be non-interactive (no interactive content in <summary> — see the
  // groupResetBtn precedent); categoryBodyTop is the first body row (the
  // plugin's interactive category master lives here, not in the summary).
  function renderCategory(cat, cfg, defaultOpen) {
    var headerExtra = categoryHeaderExtras(cat.key, cfg);
    var summaryChildren = [el('span', { class: 'category-title', text: cat.name })]
      .concat(headerExtra ? [headerExtra] : []);
    var summary = el('summary', { class: 'category-header' }, summaryChildren);

    var moduleNodes;
    if (moduleLayout === 'tabs') {
      moduleNodes = renderTabbedModules(cat, cfg);
    } else {
      moduleNodes = cat.modules.map(function (groupKey) {
        var extra = moduleExtras(groupKey, cfg);
        var moduleNode = renderModule(groupKey, cfg);
        var rowChildren = (extra ? [extra] : []).concat([moduleNode]);
        return el('div', { class: 'module-row' }, rowChildren);
      });
    }

    var bodyTop = categoryBodyTop(cat.key, cfg);
    var bodyExtra = categoryBodyExtras(cat.key, cfg);
    var bodyChildren = (bodyTop ? [bodyTop] : []).concat(moduleNodes);
    if (bodyExtra) bodyChildren.push(bodyExtra);
    var body = el('div', { class: 'category-body' }, bodyChildren);

    return el('details', detailsAttrs('cat-' + cat.key, !!defaultOpen, 'category'), [summary, body]);
  }

  // ---- Responsive Edit | Preview tab bar (narrow viewports only) ---------
  // On wide screens both columns show side-by-side and .app-tabs is CSS-
  // hidden. On narrow screens (plugin) only the active pane shows and this
  // segmented control switches between them. activeTab persists across the
  // full-rebuild render() the same way detailsOpenState does; switching tabs
  // is a pure view toggle (no store write), so it updates #app's data-tab and
  // the buttons' aria-selected in place rather than triggering a re-render.
  var activeTab = 'edit'; // 'edit' | 'preview'
  function setActiveTab(id) {
    activeTab = id;
    var a = document.getElementById('app');
    if (a) a.setAttribute('data-tab', id);
    var tabs = document.querySelectorAll('.app-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute('aria-selected', tabs[i].getAttribute('data-tab') === id ? 'true' : 'false');
    }
  }
  function renderAppTabs() {
    function tab(id, label) {
      return el('button', {
        type: 'button', class: 'app-tab', role: 'tab', 'data-tab': id,
        'aria-selected': activeTab === id ? 'true' : 'false',
        text: label,
        onclick: function () { setActiveTab(id); }
      });
    }
    return el('div', { class: 'app-tabs', role: 'tablist', 'aria-label': 'Edit / Preview' },
      [tab('edit', 'Edit'), tab('preview', 'Preview')]);
  }

  // ---- Live preview panel (right column) --------------------------------
  // Read-only: every renderer below derives its output purely from
  // store.get() (and C.buildAllRamps for color), never writes to the store,
  // and contains no focusable controls — so it cannot interfere with the
  // focus-preservation logic in render().
  var TYPE_SAMPLE = '다람쥐 헌 쳇바퀴에 타고파 Ag 123';

  function renderColorPreview(cfg, ramps) {
    var rows = cfg.color.order.map(function (hue) {
      var swatches = C.DEFAULT_CONFIG.steps.map(function (step) {
        var hex = ramps[hue][String(step)];
        return el('div', { class: 'pv-color-swatch', style: 'background:' + hex, title: hue + ' ' + step + ' ' + hex });
      });
      var captions = C.DEFAULT_CONFIG.steps.map(function (step) {
        return el('div', { class: 'pv-color-caption', text: String(step) });
      });
      var col = el('div', { class: 'pv-color-col' }, [
        el('div', { class: 'pv-color-strip', role: 'img', 'aria-label': hue + ' ramp' }, swatches),
        el('div', { class: 'pv-color-caption-row' }, captions)
      ]);
      return el('div', { class: 'pv-color-row' }, [el('div', { class: 'pv-color-label', text: hue }), col]);
    });
    return el('div', { class: 'pv-block' }, [el('h3', { text: 'Color' })].concat(rows));
  }

  function renderTypePreview(cfg) {
    var rows = FONT_SIZE_ORDER.map(function (key) {
      var px = cfg.fontSize[key];
      var line = el('div', {
        class: 'pv-type-line',
        style: 'font-size:' + px + ';font-family:' + cfg.fontFamily.sans + ';',
        text: TYPE_SAMPLE
      });
      return el('div', { class: 'pv-type-row' }, [el('div', { class: 'pv-type-label', text: key + ' / ' + px }), line]);
    });
    return el('div', { class: 'pv-block' }, [el('h3', { text: 'Type' })].concat(rows));
  }

  function renderSpacingPreview(cfg) {
    var rows = Object.keys(cfg.space).map(function (key) {
      var val = cfg.space[key];
      var bar = el('div', { class: 'pv-space-bar', style: 'width:' + val });
      return el('div', { class: 'pv-space-row' }, [el('div', { class: 'pv-space-label', text: key + ' / ' + val }), bar]);
    });
    return el('div', { class: 'pv-block' }, [el('h3', { text: 'Spacing' })].concat(rows));
  }

  function renderRadiusPreview(cfg) {
    var items = Object.keys(cfg.radius).map(function (key) {
      var val = cfg.radius[key];
      var box = el('div', { class: 'pv-radius-box', style: 'border-radius:' + val });
      return el('div', { class: 'pv-item' }, [box, el('div', { class: 'pv-item-label', text: key + ' / ' + val })]);
    });
    return el('div', { class: 'pv-block' }, [el('h3', { text: 'Radius' }), el('div', { class: 'pv-flex-wrap' }, items)]);
  }

  function renderBorderPreview(cfg) {
    var items = Object.keys(cfg.borderWidth).map(function (key) {
      var val = cfg.borderWidth[key];
      var box = el('div', { class: 'pv-border-box', style: 'border-style:solid;border-width:' + val });
      return el('div', { class: 'pv-item' }, [box, el('div', { class: 'pv-item-label', text: key + ' / ' + val })]);
    });
    return el('div', { class: 'pv-block' }, [el('h3', { text: 'Border width' }), el('div', { class: 'pv-flex-wrap' }, items)]);
  }

  function renderShadowPreview(cfg) {
    var items = Object.keys(cfg.shadow).map(function (key) {
      var val = cfg.shadow[key];
      var box = el('div', { class: 'pv-shadow-box', style: 'box-shadow:' + val });
      return el('div', { class: 'pv-item' }, [box, el('div', { class: 'pv-item-label', text: key })]);
    });
    return el('div', { class: 'pv-block' }, [el('h3', { text: 'Shadow' }), el('div', { class: 'pv-flex-wrap' }, items)]);
  }

  function renderOpacityPreview(cfg) {
    var items = Object.keys(cfg.opacity).map(function (key) {
      var val = cfg.opacity[key];
      var box = el('div', { class: 'pv-opacity-box', style: 'opacity:' + val });
      return el('div', { class: 'pv-item' }, [box, el('div', { class: 'pv-item-label', text: key + ' / ' + val })]);
    });
    return el('div', { class: 'pv-block pv-opacity-block' }, [el('h3', { text: 'Opacity' }), el('div', { class: 'pv-flex-wrap' }, items)]);
  }

  // Motion demo: transition duration/easing come from the live config via
  // inline `transition`, so any store change is reflected without extra
  // wiring. Trigger is CSS :hover (no store write) plus an optional "Play
  // all" button that toggles a class briefly — not an autoplay loop.
  function renderMotionPreview(cfg) {
    var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var durationKeys = Object.keys(cfg.duration);
    var easingKeys = Object.keys(cfg.easing);
    var boxRefs = [];
    var maxMs = durationKeys.reduce(function (max, k) { return Math.max(max, parseFloat(cfg.duration[k]) || 0); }, 0);

    var rows = durationKeys.map(function (dKey) {
      var dVal = cfg.duration[dKey];
      var cells = easingKeys.map(function (eKey) {
        var eVal = cfg.easing[eKey];
        var box = el('div', {
          class: 'pv-motion-box',
          style: 'transition:transform ' + dVal + ' ' + eVal + ';',
          title: dKey + ' (' + dVal + ') / ' + eKey
        });
        boxRefs.push(box);
        return el('div', { class: 'pv-motion-cell' }, [box, el('div', { class: 'pv-item-label', text: eKey })]);
      });
      return el('div', { class: 'pv-motion-row' }, [
        el('div', { class: 'pv-motion-row-label', text: dKey + ' / ' + dVal }),
        el('div', { class: 'pv-motion-cells' }, cells)
      ]);
    });

    var playBtn = el('button', {
      type: 'button', text: 'Play all',
      onclick: function () {
        boxRefs.forEach(function (box) { box.classList.add('playing'); });
        setTimeout(function () {
          boxRefs.forEach(function (box) { box.classList.remove('playing'); });
        }, reduceMotion ? 0 : maxMs + 300);
      }
    });

    return el('div', { class: 'pv-block' }, [
      el('h3', { text: 'Motion' }),
      el('p', { class: 'pv-hint', text: 'Hover a box, or press Play all (respects reduced-motion).' }),
      playBtn
    ].concat(rows));
  }

  // Preview sections in render order; ids double as scroll anchors and the
  // labels drive the sticky jump-nav so the two never drift out of sync.
  var PREVIEW_SECTIONS = [
    ['pv-color', 'Color'], ['pv-type', 'Type'], ['pv-spacing', 'Spacing'],
    ['pv-radius', 'Radius'], ['pv-border', 'Border'], ['pv-shadow', 'Shadow'],
    ['pv-opacity', 'Opacity'], ['pv-motion', 'Motion'], ['pv-a11y', 'A11y']
  ];

  // Preview sections grouped by token DOMAIN, mirroring the left control
  // categories 1:1 (Color, Typography, Spacing & Sizing, Effects, Motion) so
  // editing a category and reading its preview line up by name; Accessibility
  // is preview-only. The jump-nav and the on-page group headers both come from
  // this one list.
  var PREVIEW_GROUPS = [
    { id: 'pvg-color', label: 'Color', sections: ['pv-color'] },
    { id: 'pvg-typography', label: 'Typography', sections: ['pv-type'] },
    { id: 'pvg-spacing', label: 'Spacing & Sizing', sections: ['pv-spacing', 'pv-radius', 'pv-border'] },
    { id: 'pvg-effects', label: 'Effects', sections: ['pv-shadow', 'pv-opacity'] },
    { id: 'pvg-motion', label: 'Motion', sections: ['pv-motion'] },
    { id: 'pvg-a11y', label: 'Accessibility', sections: ['pv-a11y'] }
  ];

  // Scroll ONLY the preview body, never bubble to the document root:
  // scrollIntoView() would also scroll every ancestor (dragging the toolbar/
  // left column with it), so compute the offset by hand.
  function scrollPreviewTo(id) {
    var container = document.getElementById('preview-col');
    var t = document.getElementById(id);
    if (!container || !t) return;
    var top = container.scrollTop + (t.getBoundingClientRect().top - container.getBoundingClientRect().top);
    container.scrollTo({ top: top, behavior: 'smooth' });
  }

  // Jump-nav header (fixed above the scrollable body): one button per group.
  function renderPreviewNav() {
    var btns = PREVIEW_GROUPS.map(function (g) {
      return el('button', {
        type: 'button', class: 'pv-nav-btn',
        onclick: function () { scrollPreviewTo(g.id); }
      }, [g.label]);
    });
    return el('nav', { class: 'pv-nav', 'aria-label': 'Preview sections' }, btns);
  }

  function renderPreview(cfg) {
    var ramps = C.buildAllRamps(cfg);
    var nodes = [
      renderColorPreview(cfg, ramps),
      renderTypePreview(cfg),
      renderSpacingPreview(cfg),
      renderRadiusPreview(cfg),
      renderBorderPreview(cfg),
      renderShadowPreview(cfg),
      renderOpacityPreview(cfg),
      renderMotionPreview(cfg)
    ];
    // Tag the first 8 blocks with their anchor ids (A11y/contrast is appended
    // by the caller and tagged there, keeping PREVIEW_SECTIONS the sole order).
    nodes.forEach(function (n, i) { n.id = PREVIEW_SECTIONS[i][0]; });
    return nodes;
  }

  // ---- Live WCAG AA contrast validation panel (read-only) ----------------
  // Renders C.contrastReport(store.get()) as-is; no contrast math lives here.
  // Status is always conveyed as text + icon (never color alone), per the
  // color-blind-safe requirement — this tool must not fail its own audit.
  function contrastStepBadge(stepStr) {
    var passed = stepStr !== '—'; // en-dash sentinel from contrastReport
    return el('span', { class: passed ? 'badge-pass' : 'badge-fail' },
      [passed ? ('✓ Pass (' + stepStr + ')') : '✕ None']);
  }

  function contrastWarnRow(message) {
    return el('tr', { class: 'contrast-warn-row' }, [
      el('td', { colspan: '3' }, [
        el('div', { class: 'contrast-warn', role: 'alert' }, ['⚠ ' + message])
      ])
    ]);
  }

  function renderContrastPanel(cfg) {
    var report = C.contrastReport(cfg);
    var headerRow = el('tr', {}, [
      el('th', { text: 'Palette' }),
      el('th', { text: 'Min AA-pass step on white' }),
      el('th', { text: 'Max AA-pass step on black' })
    ]);
    var bodyRows = [];
    report.forEach(function (r) {
      bodyRows.push(el('tr', {}, [
        el('td', { class: 'contrast-hue-cell', text: r.hue }),
        el('td', {}, [contrastStepBadge(r.whiteMinStep)]),
        el('td', {}, [contrastStepBadge(r.blackMaxStep)])
      ]));
      if (r.whiteMinStep === '—') {
        bodyRows.push(contrastWarnRow(
          r.hue + ': 이 hue는 흰 배경 본문 대비를 통과하는 단계가 없습니다 — 채도/명도를 낮춰보세요.'
        ));
      }
      if (r.blackMaxStep === '—') {
        bodyRows.push(contrastWarnRow(
          r.hue + ': 이 hue는 검은 배경 본문 대비를 통과하는 단계가 없습니다 — 채도/명도를 조정해보세요.'
        ));
      }
    });
    var table = el('table', { class: 'contrast-table' }, [
      el('thead', {}, [headerRow]),
      el('tbody', {}, bodyRows)
    ]);
    return el('div', { class: 'pv-block' }, [
      el('h3', { text: 'Accessibility (WCAG AA 4.5:1)' }),
      el('p', { class: 'pv-hint', text: '각 hue에서 흰 배경 대비 본문 텍스트로 안전한 최소 단계, 검은 배경(다크) 대비 최소 단계.' }),
      table
    ]);
  }
  // ---- Global toolbar: state visibility (heuristic #1) + undo/redo/reset
  // (heuristic #3). Rebuilt every render() alongside #app so its dirty
  // indicator and undo/redo disabled-state never go stale.
  function renderToolbarContent() {
    var dirty = store.isDirty();
    var dirtyBadge = dirty
      ? el('span', { class: 'dirty', id: 'toolbar-dirty', text: '● Modified' })
      : el('span', { class: 'clean', id: 'toolbar-dirty', text: 'Default' });
    var titleGroup = el('div', { class: 'toolbar-title-group' }, [
      el('h1', { text: 'Foundations Token Studio' }),
      dirtyBadge
    ]);

    var undoAttrs = {
      type: 'button', id: 'btn-undo', 'aria-label': 'Undo (Ctrl/Cmd+Z)',
      onclick: function () { store.undo(); }
    };
    if (!store.canUndo()) undoAttrs.disabled = 'disabled';
    var redoAttrs = {
      type: 'button', id: 'btn-redo', 'aria-label': 'Redo (Ctrl/Cmd+Shift+Z)',
      onclick: function () { store.redo(); }
    };
    if (!store.canRedo()) redoAttrs.disabled = 'disabled';
    var resetAllBtn = el('button', {
      type: 'button', id: 'btn-reset-all',
      'aria-label': 'Reset all values to defaults',
      onclick: function () {
        if (window.confirm('모든 값을 기본값으로 되돌릴까요? 이 작업은 "되돌리기"로 복구할 수 있습니다.')) {
          store.resetAll();
        }
      }
    }, iconLabel('reset', 'Reset all'));

    var actions = el('div', { class: 'toolbar-actions' }, [
      el('button', undoAttrs, iconLabel('undo', 'Undo')),
      el('button', redoAttrs, iconLabel('redo', 'Redo')),
      resetAllBtn
    ]);

    return [titleGroup, actions];
  }
  // ---- Cross-cutting state capture/restore around the full-rebuild render() -
  // Three independent pieces of transient UI state must all survive an
  // innerHTML='' + rebuild together: focus/caret (pre-existing), which
  // <details> are open, and how far the two scroll columns are scrolled.
  // They are captured from the live (pre-rebuild) DOM in one pass and
  // restored in one pass after the new DOM is appended, so they compose
  // instead of racing each other.
  function captureUIState() {
    var act = document.activeElement;
    var savedId = act && act.id;
    var ss = null, se = null;
    try { ss = act.selectionStart; se = act.selectionEnd; } catch (e) {}

    document.querySelectorAll('details[id]').forEach(function (d) {
      detailsOpenState[d.id] = d.open;
    });

    var leftEl = document.getElementById('panel-col');
    var rightEl = document.getElementById('preview-col');

    return {
      savedId: savedId, ss: ss, se: se,
      leftScroll: leftEl ? leftEl.scrollTop : 0,
      rightScroll: rightEl ? rightEl.scrollTop : 0
    };
  }

  function restoreUIState(state) {
    var leftEl = document.getElementById('panel-col');
    var rightEl = document.getElementById('preview-col');
    if (leftEl) leftEl.scrollTop = state.leftScroll;
    if (rightEl) rightEl.scrollTop = state.rightScroll;

    var focusId = state.savedId || pendingFocusId;
    if (focusId) {
      var n = document.getElementById(focusId);
      if (n) {
        // preventScroll: the scrollTop we just restored above must win — a
        // plain focus() would scroll the column to bring the field into view
        // and undo the restored position.
        try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); }
        if (state.savedId && state.ss != null && n.setSelectionRange) {
          try { n.setSelectionRange(state.ss, state.se); } catch (e) {}
        }
      }
    }
    pendingFocusId = null;
  }
  // ---- Master-detail (web shell): domain selector + one domain at a time ----
  // Layout has no visual preview (z-index/breakpoint are abstract), so it gets
  // a plain value readout; Accessibility has no settings (it's derived from
  // Color), so its contrast table rides along in the Color domain (a11y:true).
  function renderLayoutPreview(cfg) {
    function section(title, obj) {
      var rows = Object.keys(obj).map(function (k) {
        return el('div', { class: 'pv-space-row' }, [
          el('div', { class: 'pv-space-label', text: k }),
          el('div', { class: 'pv-kv-val', text: String(obj[k]) })
        ]);
      });
      return [el('h3', { text: title })].concat(rows);
    }
    var kids = section('Z-index', cfg.zIndex)
      .concat([el('div', { class: 'pv-sub-gap' })])
      .concat(section('Breakpoint', cfg.breakpoint));
    return el('div', { class: 'pv-block', id: 'pv-layout' }, kids);
  }

  // A comprehensive accessibility view (its own domain, split out from Color):
  // per hue, the representative pass step at AA (4.5:1) and AAA (7:1) on both a
  // white and a black background. Steps are derived live via C.contrastRatio.
  function renderAccessibilityView(cfg) {
    var ramps = C.buildAllRamps(cfg);
    var steps = C.DEFAULT_CONFIG.steps;
    function passStep(ramp, bg, thr, pick) {
      var p = steps.filter(function (s) { return C.contrastRatio(ramp[String(s)], bg) >= thr; });
      if (!p.length) return null;
      return pick === 'min' ? Math.min.apply(null, p) : Math.max.apply(null, p);
    }
    function cell(step) {
      return el('td', {}, [step == null
        ? el('span', { class: 'badge-fail' }, ['✕ None'])
        : el('span', { class: 'badge-pass' }, ['✓ ' + step])]);
    }
    var head = el('tr', {}, ['Palette', 'White · AA', 'White · AAA', 'Black · AA', 'Black · AAA']
      .map(function (t) { return el('th', { text: t }); }));
    var rows = cfg.color.order.map(function (hue) {
      var r = ramps[hue];
      return el('tr', {}, [
        el('td', { class: 'contrast-hue-cell', text: hue }),
        cell(passStep(r, '#FFFFFF', 4.5, 'min')),
        cell(passStep(r, '#FFFFFF', 7, 'min')),
        cell(passStep(r, '#000000', 4.5, 'max')),
        cell(passStep(r, '#000000', 7, 'max'))
      ]);
    });
    var table = el('table', { class: 'contrast-table' }, [el('thead', {}, [head]), el('tbody', {}, rows)]);
    return el('div', { class: 'pv-block a11y-block' }, [
      el('h3', { text: 'Accessibility (WCAG contrast)' }),
      el('p', { class: 'pv-hint', text: '대비 기준 — 본문(작은 텍스트): AA 4.5:1, AAA 7:1. 큰 텍스트(18px 이상 또는 14px 볼드): AA 3:1, AAA 4.5:1.' }),
      el('p', { class: 'pv-hint', text: '숫자 = 각 배경에서 본문으로 통과하는 대표 단계 (흰 배경 = 가장 밝은 통과 단계, 검은 배경 = 가장 어두운 통과 단계).' }),
      table
    ]);
  }

  var DOMAINS = [
    { key: 'color', label: 'Color', category: 'color', preview: ['pv-color'] },
    { key: 'typography', label: 'Typography', category: 'typography', preview: ['pv-type'] },
    { key: 'spacing', label: 'Spacing & Sizing', category: 'spacing', preview: ['pv-spacing', 'pv-radius', 'pv-border'] },
    { key: 'effects', label: 'Effects', category: 'effects', preview: ['pv-shadow', 'pv-opacity'] },
    { key: 'motion', label: 'Motion', category: 'motion', preview: ['pv-motion'] },
    { key: 'layout', label: 'Layout', category: 'layout', preview: ['pv-layout'] },
    { key: 'a11y', label: 'Accessibility', full: 'a11y' },
    { key: 'export', label: 'Export', full: 'export' }
  ];
  function domainByKey(k) { for (var i = 0; i < DOMAINS.length; i++) if (DOMAINS[i].key === k) return DOMAINS[i]; return null; }
  function categoryByKey(k) { for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].key === k) return CATEGORIES[i]; return null; }
  function setActiveDomain(key) { activeDomain = key; render(); }

  function renderDomainNav() {
    var btns = DOMAINS.map(function (d) {
      return el('button', {
        type: 'button', class: 'domain-tab' + (d.key === 'export' ? ' domain-tab-export' : ''),
        role: 'tab', 'aria-selected': d.key === activeDomain ? 'true' : 'false',
        onclick: function () { setActiveDomain(d.key); }
      }, [d.label]);
    });
    return el('nav', { class: 'domain-nav', role: 'tablist', 'aria-label': 'Domain' }, btns);
  }

  function renderMasterDetailBody(cfg, extrasArr) {
    app.appendChild(renderDomainNav());
    var domain = domainByKey(activeDomain) || DOMAINS[0];

    // Full-width, preview-/output-only domains (no paired settings pane):
    // Accessibility (derived from Color) and Export.
    if (domain.full) {
      var content = domain.full === 'export' ? extrasArr : [renderAccessibilityView(cfg)];
      var fullCol = el('div', { class: 'preview-col' },
        [el('div', { class: 'preview-body', id: 'preview-col' }, content)]);
      app.appendChild(el('div', { class: 'app-body app-body-single' }, [fullCol]));
      return;
    }

    var byId = {};
    renderPreview(cfg).forEach(function (n) { byId[n.id] = n; });
    var blocks = [];
    domain.preview.forEach(function (id) {
      blocks.push(id === 'pv-layout' ? renderLayoutPreview(cfg) : byId[id]);
    });
    var previewCol = el('div', { class: 'preview-col' },
      [el('div', { class: 'preview-body', id: 'preview-col' }, blocks.filter(Boolean))]);

    var settings = renderTabbedModules(categoryByKey(domain.category), cfg);
    var panelCol = el('div', { class: 'panel-col', id: 'panel-col' }, settings);

    app.appendChild(el('div', { class: 'app-body' }, [previewCol, panelCol]));
  }

  function render() {
    var cfg = store.get();
    var uiState = captureUIState();

    toolbarNode.innerHTML = '';
    renderToolbarContent().forEach(function (n) { toolbarNode.appendChild(n); });

    app.innerHTML = '';

    // rightColumnExtras(cfg) supplies shell-specific DOM (web: export/import
    // section; plugin: range+Apply) — may return a single Node, an array of
    // Nodes, or null/undefined. This preserves the exact append position the
    // export section used to occupy here (end of the LEFT/panel column,
    // after the KV list panels) — NOT the right/preview column — so moving
    // this call behind the seam does not shift anything on screen.
    var extras = rightColumnExtras(cfg);
    var extrasArr = extras == null ? [] : (Array.isArray(extras) ? extras : [extras]);

    if (layout === 'master-detail') {
      renderMasterDetailBody(cfg, extrasArr);
      restoreUIState(uiState);
      return;
    }

    var leftCol = el('div', { class: 'panel-col', id: 'panel-col' },
      CATEGORIES.map(function (cat, i) { return renderCategory(cat, cfg, i === 0); }).concat(extrasArr));

    var contrastBlock = renderContrastPanel(cfg);
    contrastBlock.id = PREVIEW_SECTIONS[PREVIEW_SECTIONS.length - 1][0]; // pv-a11y
    // Distribute the flat preview blocks into their role groups (each group is
    // a labeled <section> that also serves as the jump-nav anchor).
    var byId = {};
    renderPreview(cfg).concat([contrastBlock]).forEach(function (n) { byId[n.id] = n; });
    var groupEls = PREVIEW_GROUPS.map(function (g) {
      var head = el('div', { class: 'pv-group-head' }, [el('h2', { class: 'pv-group-title', text: g.label })]);
      var members = g.sections.map(function (sid) { return byId[sid]; }).filter(Boolean);
      return el('section', { class: 'pv-group', id: g.id }, [head].concat(members));
    });
    // Preview column = a NON-scrolling flex wrapper holding a fixed nav header
    // over a scrollable body. The body keeps id="preview-col" (the scroll
    // element captureUIState/restoreUIState track, and the anchor scroll
    // target), so the nav can't scroll away the way a sticky child did.
    var previewBody = el('div', { class: 'preview-body', id: 'preview-col' }, groupEls);
    var rightCol = el('div', { class: 'preview-col' }, [renderPreviewNav(), previewBody]);

    // #app is a flex column: a tab bar (shown only on narrow viewports via
    // CSS) over an .app-body grid that holds the two columns. data-tab drives
    // which column shows when narrow; when wide, CSS ignores it and shows
    // both. activeTab is re-applied here so a full rebuild keeps the current
    // pane selected.
    var appBody = el('div', { class: 'app-body' }, [leftCol, rightCol]);
    app.appendChild(renderAppTabs());
    app.appendChild(appBody);
    app.setAttribute('data-tab', activeTab);

    restoreUIState(uiState);
  }

  // Global undo/redo shortcuts (heuristic #3). Registered once (not inside
  // render()) so re-renders never pile up duplicate listeners. This ALWAYS
  // drives store.undo()/redo(), even when a text/number field is focused, and
  // never defers to native in-field undo. Rationale: this is a
  // single-document state app where every editable control commits to the
  // store on each keystroke, so store history is already keystroke-granular;
  // meanwhile native field undo is non-functional here because render() does
  // app.innerHTML='' + rebuild on every commit, so the focused input is a
  // fresh node with an EMPTY native undo stack. Deferring to the browser
  // would undo nothing AND suppress app undo — undo would be dead while
  // editing. Global store undo (design-canvas model) is the correct behavior.
  document.addEventListener('keydown', function (e) {
    var key = e.key ? e.key.toLowerCase() : '';
    if (!(e.ctrlKey || e.metaKey) || key !== 'z') return;
    e.preventDefault();
    if (e.shiftKey) store.redo(); else store.undo();
  });

    store.subscribe(render);
    // NOTE: the INITIAL render() call is deliberately NOT made here (it was
    // in earlier drafts of this factory, mirroring the pre-refactor single
    // IIFE). Calling render() synchronously inside createStudio() would
    // invoke rightColumnExtras(cfg) (e.g. the web shell's renderExportSection)
    // before createStudio() has even returned — i.e. before the caller's
    // `var el = studio.el;` (and `detailsAttrs = studio.detailsAttrs;`) can
    // possibly run, since those lines are the NEXT statement after the
    // `createStudio(...)` call completes. Any rightColumnExtras callback that
    // itself needs the shared `el`/`detailsAttrs` helpers (as the web export
    // section does) would crash on the very first paint. Shells MUST call
    // the returned `render()` themselves, once, after wiring up el/
    // detailsAttrs from the return value — subsequent renders are already
    // wired via store.subscribe(render) above and need no shell involvement.
    //
    // detailsAttrs is exposed alongside {render, el} (beyond the minimal
    // {render, el} shape) because rightColumnExtras-supplied <details>
    // elements (e.g. the web shell's export/import section) need the SAME
    // open/closed persistence as every factory-rendered group: captureUIState
    // above scans document.querySelectorAll('details[id]') globally (so it
    // already captures shell-owned ids too), but the shell has no other way
    // to read that captured state back into its own detailsAttrs(id, ...)
    // calls without this export — omitting it would silently make the
    // shell's own <details> forget their open state on every keystroke.
    return { render: render, el: el, detailsAttrs: detailsAttrs };
  }

  var StudioUI = { createStudio: createStudio };
  root.StudioUI = StudioUI;
  if (typeof module !== 'undefined' && module.exports) module.exports = StudioUI;
})(typeof window !== 'undefined' ? window : globalThis);
