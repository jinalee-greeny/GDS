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
      type: 'button', class: 'group-reset-btn', text: '초기화',
      'aria-label': labelText + ' 그룹 기본값으로 초기화',
      onclick: function () {
        if (window.confirm(labelText + ' 그룹을 기본값으로 되돌릴까요? (실행 취소로 복구 가능)')) {
          store.resetGroup(groupKey);
        }
      }
    });
  }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  var FONT_SIZE_ORDER = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'];

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

  function renderColorPanel(cfg) {
    var ramps = C.buildAllRamps(cfg);
    var rows = cfg.color.order.map(function (hue) { return renderHueRow(cfg, ramps, hue); });
    return el('details', detailsAttrs('grp-color', true, 'group'), [
      el('summary', { text: 'Color' }),
      el('div', { class: 'group-body' }, [groupResetBtn('Color', 'color')].concat(rows).concat([renderCurveEditor(cfg)]))
    ]);
  }

  function renderTypePanel(cfg) {
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

    return el('details', detailsAttrs('grp-fontSize', true, 'group'), [
      el('summary', { text: 'Type Scale' }),
      el('div', { class: 'group-body' }, [
        groupResetBtn('Type Scale', 'fontSize'),
        el('p', { class: 'panel-hint', text: 'px 단위, 0 이상의 정수 권장. 각 스텝은 개별 수동값 — "Apply modular scale"로 base×ratio 커브를 일괄 채운 뒤 개별 수정할 수 있습니다.' })
      ].concat(rows).concat([modScale]))
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
        'aria-label': labelText + ' 키 ' + (i + 1),
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
        'aria-label': labelText + ' 값 (' + key + ')',
        oninput: function (e) {
          store.setPath([groupKey, key], e.target.value);
        }
      });

      var removeBtn = el('button', {
        type: 'button', text: '삭제', 'aria-label': labelText + ' 항목 삭제: ' + key,
        onclick: function () {
          var liveGroup = store.get()[groupKey];
          var next = {};
          Object.keys(liveGroup).forEach(function (k) { if (k !== key) next[k] = liveGroup[k]; });
          setGroup(groupKey, next);
        }
      });

      // role="alert" already implies an assertive live region on its own;
      // pairing it with aria-live="polite" is redundant (and contradictory —
      // alert=assertive vs polite) so role="alert" alone is kept.
      var msg = el('span', { id: msgId, class: 'kv-msg', role: 'alert' });

      return el('div', { class: 'kv-row' }, [keyInput, valInput, removeBtn, msg]);
    });

    var addBtn = el('button', {
      type: 'button', class: 'kv-add-row', text: '행 추가',
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
    });

    return el('div', { class: 'kv-group-body' }, rows.concat([addBtn]));
  }

  function renderKVSection(groupKey, labelText, opts) {
    var sectionOpts = Object.assign({ label: labelText }, opts || {});
    return el('details', detailsAttrs('grp-' + groupKey, false, 'group'), [
      el('summary', { text: labelText }),
      el('div', { class: 'group-body' }, [groupResetBtn(labelText, groupKey), renderKVGroup(groupKey, sectionOpts)])
    ]);
  }

  var KV_GROUPS = [
    ['space', '간격(space)', { placeholder: '예: 16px' }],
    ['radius', '모서리(radius)', { placeholder: '예: 8px' }],
    ['borderWidth', '테두리 두께(borderWidth)', { placeholder: '예: 2px' }],
    ['opacity', '불투명도(opacity)', { placeholder: '예: 0.5' }],
    ['shadow', '그림자(shadow)', { placeholder: '예: 0 2px 6px rgba(0,0,0,.1)' }],
    ['zIndex', '쌓임 순서(zIndex)', { placeholder: '예: 1000' }],
    ['breakpoint', '브레이크포인트(breakpoint)', { placeholder: '예: 768px' }],
    ['duration', '지속시간(duration)', { placeholder: '예: 200ms' }],
    ['easing', '이징(easing)', { placeholder: '예: cubic-bezier(0.4,0,0.2,1)' }],
    ['fontFamily', '폰트 패밀리(fontFamily)', { placeholder: '예: Pretendard, sans-serif' }],
    ['fontWeight', '폰트 굵기(fontWeight)', { placeholder: '예: 600' }],
    ['lineHeight', '줄 높이(lineHeight)', { placeholder: '예: 1.5' }],
    ['letterSpacing', '자간(letterSpacing)', { placeholder: '예: 0.025em' }]
  ];

  function renderListPanels() {
    return KV_GROUPS.map(function (entry) {
      return renderKVSection(entry[0], entry[1], entry[2]);
    });
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

  function renderPreview(cfg) {
    var ramps = C.buildAllRamps(cfg);
    return [
      renderColorPreview(cfg, ramps),
      renderTypePreview(cfg),
      renderSpacingPreview(cfg),
      renderRadiusPreview(cfg),
      renderBorderPreview(cfg),
      renderShadowPreview(cfg),
      renderOpacityPreview(cfg),
      renderMotionPreview(cfg)
    ];
  }

  // ---- Live WCAG AA contrast validation panel (read-only) ----------------
  // Renders C.contrastReport(store.get()) as-is; no contrast math lives here.
  // Status is always conveyed as text + icon (never color alone), per the
  // color-blind-safe requirement — this tool must not fail its own audit.
  function contrastStepBadge(stepStr) {
    var passed = stepStr !== '—'; // en-dash sentinel from contrastReport
    return el('span', { class: passed ? 'badge-pass' : 'badge-fail' },
      [passed ? ('✓ 통과 (' + stepStr + ')') : '✕ 없음']);
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
      el('th', { text: '팔레트' }),
      el('th', { text: '흰 배경에 AA 통과 최소 step' }),
      el('th', { text: '검은 배경에 AA 통과 최대 step' })
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
      el('h3', { text: '접근성 검증 (WCAG AA 4.5:1)' }),
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
      ? el('span', { class: 'dirty', id: 'toolbar-dirty', text: '● 변경됨(기본값과 다름)' })
      : el('span', { class: 'clean', id: 'toolbar-dirty', text: '기본값' });
    var titleGroup = el('div', { class: 'toolbar-title-group' }, [
      el('h1', { text: 'Foundations Token Studio' }),
      dirtyBadge
    ]);

    var undoAttrs = {
      type: 'button', id: 'btn-undo', text: '되돌리기', 'aria-label': '되돌리기 (실행 취소, Ctrl/Cmd+Z)',
      onclick: function () { store.undo(); }
    };
    if (!store.canUndo()) undoAttrs.disabled = 'disabled';
    var redoAttrs = {
      type: 'button', id: 'btn-redo', text: '다시실행', 'aria-label': '다시실행 (Ctrl/Cmd+Shift+Z)',
      onclick: function () { store.redo(); }
    };
    if (!store.canRedo()) redoAttrs.disabled = 'disabled';
    var resetAllBtn = el('button', {
      type: 'button', id: 'btn-reset-all', text: '전체 초기화',
      'aria-label': '모든 값을 기본값으로 전체 초기화',
      onclick: function () {
        if (window.confirm('모든 값을 기본값으로 되돌릴까요? 이 작업은 "되돌리기"로 복구할 수 있습니다.')) {
          store.resetAll();
        }
      }
    });

    var actions = el('div', { class: 'toolbar-actions' }, [
      el('button', undoAttrs), el('button', redoAttrs), resetAllBtn
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

    var leftCol = el('div', { class: 'panel-col', id: 'panel-col' }, [
      renderColorPanel(cfg),
      renderTypePanel(cfg)
    ].concat(renderListPanels()).concat(extrasArr));

    var rightCol = el('div', { class: 'preview-col', id: 'preview-col' }, [
      el('h2', { text: 'Preview' })
    ].concat(renderPreview(cfg), [renderContrastPanel(cfg)]));

    app.appendChild(leftCol);
    app.appendChild(rightCol);

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
