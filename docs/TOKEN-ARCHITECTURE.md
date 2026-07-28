# TOKEN-ARCHITECTURE — Foundations 프리셋 아키텍처 브리핑

> 이 문서는 **현재 존재하는** 디자인 토큰 시스템(primitive 레이어 v1)을 실제 소스 기준으로 정리한 참조 문서입니다.
> 모든 값·동작은 실제 파일에서 확인해 옮겼습니다. semantic 레이어는 **설계 중이며 아직 존재하지 않습니다** (본 문서 끝의 한 줄 메모만 참고).

---

## 1. 개요 & 철학

- **무엇인가**: 여러 프로젝트에서 재사용할 "기초 자산(core system)" 역할의 **디자인 시스템 마스터 프리셋**. 현재는 **primitive(원시값) 한 층**만 완성된 v1.
- **primitive-only 범위**: 모든 토큰이 원시값(raw value)이다. alias/참조(`{color.blue.500}` 같은)가 없다 — 검증 리포트에서 "깨진 참조 0건, 모두 원시값"으로 강제된다 (§8).
- **platform-agnostic**: 특정 플랫폼에 종속되지 않는다. 같은 SSOT에서 CSS 변수 / Tailwind preset / DTCG JSON / Figma(Tokens Studio + 플러그인 변수) 산출물을 파생시킨다.
- **DTCG 정렬**: `tokens/tokens.json`은 DTCG(Design Tokens Community Group) 포맷(`$type`/`$value`)을 따른다.
- **수동(manual) 컬러 모델**: 컬러 램프는 OKLCH 커브로 "생성"하지 않고, step→hex 맵을 **저장된 값 그대로** SSOT로 둔다. OKLCH 변환기(`buildRamp`/curves)는 선택적 "auto-fill" 편의 기능으로만 남아 있다.

---

## 2. 아키텍처: 두 갈래 파이프라인

저장소는 **① 토큰 파이프라인**과 **② Token Studio 앱** 두 갈래이며, 각 갈래는 자체 SSOT에서 산출물이 파생된다.
**공통 불변식: 생성물(파생물)은 절대 손으로 수정하지 않는다. SSOT만 고치고 빌드를 다시 돌린다.**

### ① 토큰 파이프라인 (SSOT = `build_tokens.py` 내부 딕셔너리)

```
build_tokens.py  (SSOT: 파이썬 딕셔너리)
      │  python3 build_tokens.py
      ├─ tokens/tokens.json         DTCG 토큰 (파생, 값 직접 수정 금지)
      ├─ build/tokens.css           CSS 커스텀 프로퍼티
      ├─ build/tailwind.preset.js   Tailwind preset
      └─ build/tokens.figma.json    Tokens Studio 단일 파일 포맷 (Figma import용)

build_docs.py    (tokens.json을 읽어 파생)
      │  python3 build_docs.py
      ├─ docs/GUIDE.md              가이드 + 검증 리포트
      └─ docs/styleguide.html       리빙 스타일가이드
```

- `build_docs.py`는 SSOT 딕셔너리가 아니라 **이미 생성된 `tokens/tokens.json`을 입력으로 읽는다**. 따라서 `build_tokens.py` → `build_docs.py` 순서로 실행해야 문서가 최신이다.

### ② Token Studio 앱 (SSOT = `core/*` + `*.template.*` / `code.src.js`)

같은 에디터 코어를 **웹 앱**과 **Figma 플러그인** 두 형태로 조립한다.

```
core/token-core.js   토큰 로직 코어 (DEFAULT_CONFIG, 익스포터, contrast, store)
core/studio-ui.js    에디터 UI 로직 (카테고리/모듈, KV 에디터, 컬러 에디터)
core/studio.css      에디터 스타일
core/figma-map.js    토큰 → Figma 변수/Effect/Text 스타일 매핑
      │  python3 build_apps.py  (마커 치환으로 주입)
      ├─ tool/index.html        웹 앱 (파생) ← tool/index.template.html
      ├─ plugin/ui.html         플러그인 UI (파생) ← plugin/ui.template.html
      └─ plugin/code.js         플러그인 메인 (파생) ← plugin/code.src.js
```

- `build_apps.py`는 템플릿 안의 마커(`/*__TOKEN_CORE__*/`, `/*__STUDIO_UI__*/`, `/*__STUDIO_CSS__*/`, `/*__FIGMA_MAP__*/`)를 각 `core/*` 파일 내용으로 **문자열 치환**해 단일 파일 산출물을 만든다. 마커가 없으면 빌드가 즉시 실패(`SystemExit`)한다.
- 웹 앱에는 token-core + studio-ui + studio.css가 주입된다. 플러그인 UI에는 여기에 figma-map까지 추가. 플러그인 메인 스레드(`code.js`)에는 token-core + figma-map만 주입된다.

---

## 3. 듀얼 SSOT & 패리티

두 갈래는 **동일한 토큰 값을 두 언어로 각각 정의**한다. 이것이 이 저장소의 가장 미묘한 부분이다.

- **JS 쪽**: `core/token-core.js`의 `DEFAULT_CONFIG` 객체.
- **Python 쪽**: `build_tokens.py` 상단의 개별 딕셔너리(`color_scales`, `font_size`, `space`, ...).

두 정의는 **바이트 단위로 동일한 산출물**을 내야 한다. 예를 들어 `core.toDTCG(DEFAULT_CONFIG)` 문자열과 `build_tokens.py`가 쓴 `tokens/tokens.json` 파일이 정확히 일치해야 한다. 이를 위해:

- 두 쪽 모두 **키 삽입 순서**를 맞춘다 (JSON 직렬화가 순서에 의존하므로). 컬러는 `color.order` / `color_order` 배열이 순서를 고정한다.
- Python `round()`(round-half-to-even, banker's rounding)를 JS에서 `pyRound`로 그대로 포팅해 OKLCH→hex 결과가 어긋나지 않게 했다. (현재 컬러는 저장된 값이라 이 경로는 auto-fill에서만 쓰이지만, 결과 일치가 유지된다.)

**테스트가 강제하는 것** (`tool/tests/parity.test.mjs`):
- `toDTCG(DEFAULT_CONFIG)` === 커밋된 `tokens/tokens.json`
- `toCSS(DEFAULT_CONFIG)` === 커밋된 `build/tokens.css`
- `toTailwind(DEFAULT_CONFIG)` === 커밋된 `build/tailwind.preset.js`
- `toFigma(DEFAULT_CONFIG)` === 커밋된 `build/tokens.figma.json`

즉 JS 익스포터 출력과 Python이 생성한 커밋 파일이 어긋나면(어느 한쪽만 고치면) 패리티 테스트가 깨진다 — 이것이 듀얼 SSOT를 동기 상태로 묶는 장치다. `drift.test.mjs`는 여기에 더해 **생성 앱 파일이 core 소스를 verbatim으로 담고 있는지**(즉 `build_apps.py`를 다시 안 돌린 stale 상태가 아닌지) 검사한다 (§9).

---

## 4. 네이밍 규칙

| 계열 | 규칙 | 예 |
|---|---|---|
| **컬러 (다단계)** | `color.{scale}.{step}` — step 이름은 임의 문자열(현재는 숫자 스케일) | `color.blue.500` |
| **컬러 (단일 step)** | export 시 flat: `color.{scale}` | `color.white`, `color.black` |
| **컬러 (알파)** | `#RRGGBBAA` 8자리 hex로 저장. 오버레이/스크림/틴트용 전용 토큰 | `color.black-alpha.40` = `#00000066` |
| **크기류** | T-shirt 단계 명칭 | `radius.md`, `fontSize.lg` |
| **간격** | 4px 그리드 numeric 키 | `space.4` = 16px |
| **폰트 무게** | 의미 명칭 | `fontWeight.semibold` = 600 |

### 수동 컬러 모델의 정확한 형태

`cfg.color`는 아래 두 필드로 구성된다 (`core/token-core.js` `DEFAULT_CONFIG.color`):

```js
color: {
  order:  ['black','white','black-alpha','white-alpha','gray','red','amber','green','blue'],
  scales: { black:{base:'#000000'}, white:{base:'#FFFFFF'}, gray:{'50':'#F5F6F8', ...}, ... }
}
```

- `order`: export/미리보기/대비 순서를 고정하는 배열.
- `scales[name]`: **정렬된 step→hex 맵**. 사용자가 스케일·step을 추가/이름변경/삭제/값편집 할 수 있다.
- **single-step 판정**: `colorEntries(ramp)`가 `keys.length === 1`이면 single. single 스케일(`black`/`white`)은 export 시 그룹이 아니라 **flat 색상**으로 나간다. `black`/`white`는 step 이름이 `base` 하나뿐이라 `color.black` / `color.white`로 평탄화된다.
- **multi-step**: 그룹으로 export (`color.gray.50` ...).
- **알파 판정**: `isAlphaRamp(ramp)`가 값 중 **길이 9(=`#RRGGBBAA`)** 인 문자열이 하나라도 있으면 알파 램프로 본다. 알파 램프는 단색 배경 대비 계산이 의미 없으므로 **대비 리포트/a11y 표에서 제외**된다 (§8).

---

## 5. 파운데이션 값 전체 인벤토리

> 출처: `core/token-core.js` `DEFAULT_CONFIG` (= `build_tokens.py` 딕셔너리와 동일).

### 5.1 Color

`color.order` = `black · white · black-alpha · white-alpha · gray · red · amber · green · blue` (총 **9개 스케일**).

| 스케일 | 종류 | steps / 값 |
|---|---|---|
| `black` | single (flat) | `#000000` |
| `white` | single (flat) | `#FFFFFF` |
| `black-alpha` | 알파 | 5 `#0000000D` · 10 `#0000001A` · 20 `#00000033` · 40 `#00000066` · 60 `#00000099` · 80 `#000000CC` |
| `white-alpha` | 알파 | 5 `#FFFFFF0D` · 10 `#FFFFFF1A` · 20 `#FFFFFF33` · 40 `#FFFFFF66` · 60 `#FFFFFF99` · 80 `#FFFFFFCC` |
| `gray` | 다단계 (50–900) | 50 `#F5F6F8` · 100 `#E9EBEF` · 200 `#D7D9DF` · 300 `#BDC0C7` · 400 `#A1A4AC` · 500 `#898B92` · 600 `#72747B` · 700 `#5D5F65` · 800 `#494A4E` · 900 `#35373A` |
| `red` | 다단계 (50–900) | 50 `#FFE8E1` · 100 `#FFD1C5` · 200 `#FFAC9E` · 300 `#FF8477` · 400 `#FF5D53` · 500 `#F0443E` · 600 `#CC3430` · 700 `#AA2825` · 800 `#85201D` · 900 `#621A16` |
| `amber` | 다단계 (50–900) | 50 `#FFF8E1` · 100 `#FFECB3` · 200 `#FFE082` · 300 `#FFD54F` · 400 `#FFCA28` · 500 `#FFB300` · 600 `#FF8F00` · 700 `#F57C00` · 800 `#E65100` · 900 `#BF360C` |
| `green` | 다단계 (50–900) | 50 `#E1FFE6` · 100 `#C4FBCE` · 200 `#99F1AC` · 300 `#6BDC88` · 400 `#3DC267` · 500 `#21A651` · 600 `#0E8C41` · 700 `#067334` · 800 `#095A28` · 900 `#0C421E` |
| `blue` | 다단계 (50–900) | 50 `#DEF8FF` · 100 `#BFEFFF` · 200 `#91DDFF` · 300 `#63C2FF` · 400 `#36A4FF` · 500 `#1B8AFF` · 600 `#0A72DA` · 700 `#035EB6` · 800 `#07498E` · 900 `#0A3668` |

> 참고: `DEFAULT_CONFIG.steps` = `[50…950]`(11단계)와 `curves.Lc/Cm`는 **선택적 OKLCH auto-fill 전용**이다. 실제 저장된 다단계 스케일은 **50–900(10단계)** 이며 `950`은 정의돼 있지 않다.

### 5.2 Typography

**fontFamily** — sans/serif/mono 세 슬롯 **모두 동일**:
`"Pretendard, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"` (슬롯은 교체 가능).

**fontSize** (10단계):

| xs | sm | md | lg | xl | 2xl | 3xl | 4xl | 5xl | 6xl |
|---|---|---|---|---|---|---|---|---|---|
| 12px | 14px | 16px | 18px | 20px | 24px | 30px | 36px | 48px | 60px |

**fontWeight**: regular `400` · medium `500` · semibold `600` · bold `700`.

**lineHeight**: none `1` · tight `1.25` · snug `1.375` · normal `1.5` · relaxed `1.625` · loose `2`.

**letterSpacing**: tighter `-0.05em` · tight `-0.025em` · normal `0em` · wide `0.025em` · wider `0.05em`.

### 5.3 Spacing & Sizing

**space** (4px 그리드, 키가 곧 4의 배수 인덱스):

| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 | 24 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0px | 4px | 8px | 12px | 16px | 20px | 24px | 32px | 40px | 48px | 64px | 80px | 96px |

**radius**: none `0px` · xs `2px` · sm `4px` · md `6px` · lg `8px` · xl `12px` · 2xl `16px` · 3xl `24px` · full `9999px`.

**borderWidth**: none `0px` · sm `1px` · md `2px` · lg `4px`.

### 5.4 Effects

**opacity**: 0 `0` · 5 `0.05` · 10 `0.1` · 20 `0.2` · 40 `0.4` · 60 `0.6` · 80 `0.8` · 100 `1`.

**shadow**:

| 키 | 값 |
|---|---|
| sm | `0 1px 2px rgba(0,0,0,0.08)` |
| md | `0 2px 6px rgba(0,0,0,0.10)` |
| lg | `0 6px 16px rgba(0,0,0,0.12)` |
| xl | `0 12px 28px rgba(0,0,0,0.16)` |
| 2xl | `0 24px 48px rgba(0,0,0,0.20)` |

### 5.5 Motion

**duration**: fast `100ms` · base `200ms` · slow `300ms` · slower `500ms`.

**easing**: standard `cubic-bezier(0.4,0,0.2,1)` · decelerate `cubic-bezier(0,0,0.2,1)` · accelerate `cubic-bezier(0.4,0,1,1)` · linear `linear`.

### 5.6 Layout

**zIndex**: base `0` · dropdown `1000` · sticky `1100` · overlay `1300` · modal `1400` · popover `1500` · toast `1600` · tooltip `1700`.

**breakpoint**: sm `640px` · md `768px` · lg `1024px` · xl `1280px` · 2xl `1536px`.

---

## 6. 익스포터 & 출력 포맷

모든 익스포터는 `core/token-core.js`에 있고, `build_tokens.py`가 같은 결과를 파일로 쓴다.

### CSS — `toCSS` → `build/tokens.css`

- 단일 `:root { … }` 블록에 `--key: value;` 나열.
- 컬러: single 스케일 → `--color-white`, 다단계 → `--color-blue-500` 식.
- 접두사 규칙(주의: 축약형 사용): fontFamily → `--font-*`, fontSize → `--font-size-*`, fontWeight → `--font-weight-*`, lineHeight → `--leading-*`, letterSpacing → `--tracking-*`, space → `--space-*`, radius → `--radius-*`, borderWidth → `--border-*`, opacity → `--opacity-*`, shadow → `--shadow-*`, zIndex → `--z-*`, breakpoint → `--bp-*`, duration → `--duration-*`, easing → `--ease-*`.

### DTCG — `toDTCG` → `tokens/tokens.json`

- `$description` + 각 토큰 `{ $type, $value }`. 최상위 `color`는 single→flat 색, 다단계→중첩 그룹.
- `$type` 매핑: color=`color`, font.family=`fontFamily`, font.size=`dimension`, font.weight=`fontWeight`, lineHeight=`number`, letterSpacing=`dimension`, space=`dimension`, radius=`dimension`, borderWidth=`dimension`, opacity=`number`, shadow=`shadow`, zIndex=`number`, breakpoint=`dimension`, duration=`duration`, easing=`cubicBezier`.
- 폰트는 `font.family` / `font.size` / `font.weight`로 한 단계 중첩된다.

### Tailwind — `toTailwind` → `build/tailwind.preset.js`

- `module.exports = { theme: { extend: { … } } }` 형태.
- 키 매핑: colors(single→flat, 다단계→맵), fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, **spacing**(=space), **borderRadius**(=radius), borderWidth, opacity, **boxShadow**(=shadow), zIndex, **screens**(=breakpoint), **transitionDuration**(=duration), **transitionTimingFunction**(=easing).

### Figma / Tokens Studio — `toFigma` → `build/tokens.figma.json`

- Tokens Studio 단일 파일 포맷: 각 토큰 `{ value, type }` (string 값).
- 그룹 키 이름이 Tokens Studio 규약: `fontFamilies`, `fontSizes`, `fontWeights`, `lineHeights`, `letterSpacing`, `spacing`, `borderRadius`, `borderWidth`, `opacity`, `boxShadow`, `color`.
- **주의**: 이 파일에는 **zIndex/breakpoint/duration/easing이 포함되지 않는다** (Tokens Studio import 대상만 내보냄).

### Figma 플러그인 매핑 — `core/figma-map.js`

플러그인에서 "Figma에 적용" 시 `Foundations` 컬렉션에 변수/스타일을 생성(재적용 시 갱신). 세 가지 plan:

- **`variablesPlan(config, selection, C)`** — 선택된 그룹을 Figma 변수로.
  - `GROUP_KEYS`는 **14개**: color, space, radius, borderWidth, fontSize, opacity, lineHeight, zIndex, breakpoint, duration, fontFamily, fontWeight, letterSpacing, easing. **`shadow`는 여기 없다** (Effect Style 전용).
  - 컬러 → `type:'COLOR'`, 이름 `color/blue/500` (single은 `color/white`). hex→`{r,g,b[,a]}` 0–1 float (`hexToFigmaRGB`; 8자리면 `a` 포함).
  - `FLOAT_GROUPS`(space, radius, borderWidth, fontSize, opacity, lineHeight, zIndex, breakpoint, duration) → `type:'FLOAT'`, **단위 문자열을 `parseFloat`로 벗겨 숫자**로 (`16px`→16, `200ms`→200, `0.4`→0.4).
  - `STRING_GROUPS`(fontFamily, fontWeight, letterSpacing, easing) → `type:'STRING'` (fontWeight도 문자열).
- **`effectStylePlan(config)`** — `shadow/*` **Effect Style만**. `shadowToEffects`가 CSS 그림자를 파싱해 `DROP_SHADOW` 이펙트로: 최상위 콤마 분리(괄호 안 콤마 무시), `rgba()/rgb()/#hex6/#hex3` 색 파싱, 나머지 길이값을 `x y blur [spread]`로.
- **`textStylePlan(config, weights, family)`** — fontSize × 선택 weight의 조합 텍스트 스타일. 이름 `text/{size}/{weight}`. `fontSize`는 px 벗긴 숫자, `lineHeight`/`letterSpacing`은 `normal` 값을 **PERCENT**로(1.5→150, 0em→0). weight 키→Figma 스타일명 매핑(`WEIGHT_STYLE_MAP`: regular→Regular, medium→Medium, semibold→SemiBold, bold→Bold; 미지의 키는 Regular).

---

## 7. 빌드 & 재생성

```bash
python3 build_tokens.py   # ① SSOT(파이썬 딕셔너리) → tokens.json + tokens.css + tailwind.preset.js + tokens.figma.json
python3 build_docs.py     # ① tokens.json을 읽어 → docs/GUIDE.md + docs/styleguide.html (+ 검증)
python3 build_apps.py     # ② core/* + 템플릿 조립 → tool/index.html, plugin/ui.html, plugin/code.js
```

**규칙**:
- 토큰 값 변경은 **`build_tokens.py` 내부 딕셔너리에서만** (그리고 듀얼 SSOT이므로 `core/token-core.js` `DEFAULT_CONFIG`도 함께). `tokens/tokens.json` 이하 파생물은 손대지 않는다.
- 앱 코드 변경은 **`core/*` 와 `*.template.*` / `plugin/code.src.js`에서만**. `tool/index.html`·`plugin/ui.html`·`plugin/code.js`는 생성물이라 직접 수정 금지.
- `build_docs.py`는 `tokens.json`을 입력으로 쓰므로 항상 `build_tokens.py` **다음에** 실행.

---

## 8. 검증 상태

`build_docs.py`가 `tokens.json`을 읽어 리포트를 생성하며, 코어 로직은 `contrastReport`/`isAlphaRamp`로 미러링된다.

### 참조 무결성
- primitive 레이어 → 모든 토큰이 원시값, alias 없음. `build_docs.py`의 `walk()`가 `$value`가 `{`로 시작하는(참조) 항목을 찾아 검사 → **깨진 참조 0건**.

### WCAG AA 대비 (4.5:1)
- 각 hue에서 흰 배경 대비 본문으로 안전한 **최소 step**(가장 밝은 통과)과 검은(다크) 배경 대비 **최대 step**(가장 어두운 통과)을 계산.
- step 이름이 임의 문자열이므로 숫자값이 아니라 **순서(order) 기준**으로 고른다: 흰 배경엔 첫 통과(가장 밝은), 검은 배경엔 마지막 통과(가장 어두운).
- **알파 스케일 제외**: `isAlphaRamp`(값 길이 9 = `#RRGGBBAA` 존재)면 단색 배경 대비가 의미 없어 리포트에서 뺀다.

현재 결과 (`docs/GUIDE.md`):

| 팔레트 | 흰 배경 AA 통과 최소 step | 검은 배경 AA 통과 최대 step |
|---|---|---|
| black | base | — |
| white | — | base |
| gray | 600 | 500 |
| red | 600 | 500 |
| amber | 900 | 800 |
| green | 700 | 600 |
| blue | 600 | 500 |

`contrastRatio`는 표준 상대휘도 공식(`relLuminance` sRGB 감마 역변환 + 0.2126/0.7152/0.0722 가중)으로 `(hi+0.05)/(lo+0.05)`.

---

## 9. 테스트

`tool/tests/*.mjs` — 프레임워크 없이 Node 내장 `node:test` + `node:assert/strict` 사용. 실행:

```bash
node --test tool/tests/*.mjs
```

**현재 47 테스트 전부 통과** (2026-07 기준). `helpers.mjs`의 `loadCore()`가 `core/token-core.js`를 로드하는 공용 헬퍼.

| 파일 | 검증 내용 |
|---|---|
| `parity.test.mjs` | 익스포터 출력 === 커밋 파일 바이트 일치 (toDTCG↔tokens.json, toCSS↔tokens.css, toTailwind↔tailwind.preset.js, toFigma↔tokens.figma.json). **듀얼 SSOT 동기 강제.** |
| `drift.test.mjs` | 생성 앱(`tool/index.html`, `plugin/ui.html`, `plugin/code.js`)이 `core/*` 소스를 verbatim 포함하는지 = `build_apps.py`를 다시 안 돌린 stale 상태 탐지. |
| `core.test.mjs` | `pyRound`(banker's rounding), `hexof`(OKLCH→hex 알려진 blue step), `buildAllRamps`(저장된 수동 스케일 반환·order 길이 9), `cloneConfig` 독립성, `contrastReport`(GUIDE 결과 재현), `createStore`(setPath/undo/redo/dirty/resetGroup/subscribe). |
| `figma-map.test.mjs` | `GROUP_KEYS` 14개(shadow 제외), `variablesPlan`(COLOR/FLOAT 단위 stripping/STRING, selection 필터, 멱등), `hexToFigmaRGB`, `shadowToEffects`(단일/다중/spread/rgb/hex6/hex3), `effectStylePlan`(shadow 순서), `textStylePlan`(size×weight, PERCENT, 스타일명 매핑·fallback). |
| `roundtrip.test.mjs` | `index.html`에서 실제 `configFromDTCG`를 vm으로 추출해 실행 → DTCG 왕복 복원(14 direct 그룹 + color), 컬러 램프는 현재 cfg 보존(역산 아님), 잘못된 JSON은 throw 없이 error 결과, 누락/오형 그룹은 해당 그룹만 skip하고 나머지 복원. |
| `plugin-apply.test.mjs` | `plugin/code.src.js`의 `applyPlan`을 figma mock으로 실행 → 변수/Effect/Text 스타일 생성이 **멱등**(재적용 시 중복 없이 갱신), 타입 변경 시 remove+recreate, 폰트 실패는 `failed[]`에만, targets 게이트, 결과 카운트(생성/갱신/실패). |

---

## CLAUDE.md 정합성 메모

문서화 과정에서 CLAUDE.md의 stale 서술을 발견해 **모두 실제 코드에 맞게 갱신 완료**했다. 기록용:

1. **컬러 팔레트 목록** — 과거 "gray + red·orange·amber·green·teal·blue·violet·pink, 각 50–950 + white/black"으로 적혀 있었으나 실제는 **black, white, black-alpha, white-alpha, gray, red, blue, green(8개)**, 다단계는 **50–900(10단계)**, `950`은 auto-fill용 `curves`에만 존재. CLAUDE.md를 매뉴얼 모델 + 알파 스케일 서술로 갱신함.

2. **WCAG "teal"** — 팔레트에 없는 hue였음. 실제 결과(gray/red/blue = 흰600·검500, green = 흰700·검600)로 갱신함.

3. **SSOT 서술 모순** — 상단이 "SSOT: tokens/tokens.json 하나만 관리"라 했으나 실제 SSOT는 **`build_tokens.py` 딕셔너리(+ 듀얼로 `core/token-core.js` DEFAULT_CONFIG)** 이고 tokens.json은 파생물. 이에 맞게 갱신함.

4. (경미, 참고용) CSS 접두사가 직관과 다름: fontFamily는 `--font-*`, lineHeight는 `--leading-*`, letterSpacing은 `--tracking-*`.

---

## 부록: semantic 레이어 (미존재)

primitive 위에 `color.semantic.primary` 등을 alias하는 **semantic 레이어는 설계 중이며 아직 코드에 존재하지 않는다.** 본 문서는 primitive 레이어만 다룬다.
