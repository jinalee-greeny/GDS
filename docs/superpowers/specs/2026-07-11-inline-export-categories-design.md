# 편집 좌측 카테고리화 + 모듈 내 export 토글 — 설계 스펙

- 날짜: 2026-07-11
- 상태: 승인됨 (구현 대기)
- 브랜치: feat/inline-export-categories
- 선행: output-grouping (별도 카테고리 출력 패널, main 머지됨) — 이번에 그 별도 패널을 대체

## 1. 목적

지난 작업은 export 옵션을 프리뷰 아래 **별도 출력 패널**로 뒀는데, 사용자가 편집하면서
바로 선택하기 어렵고 UI가 중복/복잡해졌다. 대신 **편집 좌측 컬럼 자체를 6개 카테고리로
재구성**하고, 각 카테고리·모듈 안에 **export 토글을 co-locate**한다. 편집과 내보내기
선택이 한 곳에 모인다. 별도 출력 패널은 제거한다.

## 2. 확정된 결정

| 항목 | 결정 |
|------|------|
| 편집 좌측 | 15개 평평한 그룹 → **6개 카테고리**로 묶음 (공유) |
| 공유 범위 | core/studio-ui.js 공유 → **웹앱 편집도 6카테고리** (SSOT 유지) |
| export 토글 | **플러그인만** 주입(opt-in 훅) — 웹앱엔 안 뜸 |
| 토글 세분화 | **카테고리 master + 모듈별 개별 토글** 둘 다 |
| 중첩 | 카테고리 = 헤더/구분(비접이식); 모듈은 지금처럼 접이식 (**중첩 collapsible 없음**) |
| shadow | shadow 모듈 토글 = Effect Style로 내보내기 (변수 아님) |
| Text Styles | 합성 → Typography 카테고리에 플러그인이 넣는 항목(토글+weight+폰트) |
| 이전 출력 패널 | 제거 |

## 3. 카테고리 → 모듈 매핑 (studio-ui 공유 상수)

| 카테고리 | 모듈(편집 그룹) |
|---------|----------------|
| Color | color |
| Typography | fontSize(Type) · fontFamily · fontWeight · lineHeight · letterSpacing (+ Text Styles 항목: 플러그인) |
| Spacing & Sizing | space · radius · borderWidth |
| Effects | opacity · shadow(→Effect Style) |
| Motion | duration · easing |
| Layout | zIndex · breakpoint |

모듈 키→기존 렌더러: `color`→renderColorPanel, `fontSize`→renderTypePanel, 그 외→renderKVSection.
카테고리는 이 순서로 렌더. 각 모듈은 기존 `<details class="group">` 그대로(안정적 id 유지).

## 4. studio-ui 변경 (공유, 재구성 + 훅)

- `CATEGORIES` 상수(§3) 추가. render()의 좌측 컬럼을 `renderColorPanel + renderTypePanel +
  renderListPanels` 평면 나열 → **카테고리별로 그룹핑**해서 렌더.
- 카테고리 렌더: `el('section', {class:'category'}, [헤더, ...모듈들])`.
  - 헤더: `el('div',{class:'category-header'}, [categoryHeaderExtras(catKey,cfg), el('span',{class:'category-title', text:catName})])`.
  - 각 모듈: `el('div',{class:'module-row'}, [moduleExtras(groupKey,cfg), <기존 모듈 details>])` — 훅 콘텐츠는
    모듈 `<details>` **바깥(앞)** 에 둠(‹summary› 안에 interactive 넣지 않음 — 기존 선례 준수).
  - 카테고리 본문 끝: `categoryBodyExtras(catKey,cfg)` 결과 append(Text Styles 항목 자리).
- 신규 opt-in 훅(모두 optional; 없으면 null):
  - `opts.moduleExtras(groupKey, cfg) -> Node|null` — 모듈별 앞 셀(플러그인 개별 토글).
  - `opts.categoryHeaderExtras(categoryKey, cfg) -> Node|null` — 카테고리 헤더(플러그인 master 토글).
  - `opts.categoryBodyExtras(categoryKey, cfg) -> Node|null` — 카테고리 끝(Text Styles 등 합성 항목).
- **상태 보존 불변**: 모듈 `<details>` 안정적 id, `#panel-col` 스크롤 컨테이너, 포커스/캐럿 보존
  로직(captureUIState/restoreUIState)이 그대로 동작해야 함. 카테고리 래퍼는 비포커스 요소.
- 웹앱은 세 훅을 안 넘김 → export UI 없이 카테고리 편집만.

## 5. 플러그인 UI 변경 (plugin/ui.template.html)

- 지난 `renderOutputTargets`(별도 출력 패널) **제거**. 대신 세 훅을 createStudio에 넘김:
  - `moduleExtras(groupKey)`: 변수 모듈(color/space/…/letterSpacing)→체크박스, 켜면 selection에 groupKey 추가.
    `shadow`→체크박스, 켜면 targets.effectStyles=true(라벨 "Effect Style"). 각 체크박스 라벨 있음,
    `.checked`는 DOM 프로퍼티로.
  - `categoryHeaderExtras(catKey)`: 그 카테고리의 export 가능한 항목 전체에 대한 master 체크박스
    (.checked=all, .indeterminate=!all&&!none; onchange→해당 카테고리 항목 전부 on/off + studio.render()).
  - `categoryBodyExtras('typography')`: **Text Styles 항목** — 체크박스(targets.textStyles) + weight 체크(regular/medium/semibold/bold→textWeights) + 폰트 패밀리 입력(안정적 id 'plugin-font-family'). 다른 카테고리는 null.
- 토글 onchange는 studio.render() 호출(카테고리 master 롤업/개별 상태 재파생). 상태: `selection`(변수 그룹키),
  `targets={variables,textStyles,effectStyles}`, `textWeights`, `fontFamily`.
- 하단 고정 CTA("Figma에 적용") + 실패 사유 목록 **유지**. Apply 메시지 = 지난과 동일 형태
  (`selection`, `targets.variables=selection.length>0`, textOptions). 플러그인 main/figma-map 변경 없음.
- 카테고리별 master가 곧 "카테고리 export" 옵션. 개별 모듈 토글이 하위 선택.

## 6. 매핑/상태 헬퍼(플러그인)

- 카테고리→exportable 항목: Color[color var]; Typography[fontSize,fontFamily,fontWeight,lineHeight,letterSpacing vars + textStyles]; Spacing[space,radius,borderWidth]; Effects[opacity var + effectStyles]; Motion[duration,easing]; Layout[zIndex,breakpoint].
- `itemOn`/`setItem` (변수 그룹은 selection, textStyles/effectStyles는 targets), `catStates(all/none)`,
  `setCategory` — 지난 catLeafStates/setCategory와 동형(항목 집합만 변수+스타일 혼합).

## 7. 테스트 / 성공 기준

1. **웹앱 회귀**: studio-ui 카테고리 재구성 후에도 편집·프리뷰·검증·undo/redo·export·round-trip **동작 동일**
   (기존 token-core/parity/roundtrip/plugin-apply 테스트 green). 포커스/`<details>` 개폐/스크롤 보존 유지.
2. **웹앱 Chrome 스모크**: 좌측이 6카테고리(헤더+모듈)로 보이고 export 토글은 **안 보임**, 오류 없음.
3. **플러그인 Chrome 스모크**: 6카테고리 편집 + 카테고리 master 토글 + 모듈별 토글 + Typography의 Text Styles 항목
   + shadow 모듈의 Effect Style 토글 + 고정 CTA. 오류 없음.
4. **드리프트 가드/조립**: build_apps.py로 tool/index.html·plugin/ui.html·plugin/code.js 재생성, 드리프트 테스트 green.
5. **수동 QA(Figma)**: 모듈/카테고리 토글대로 Variables + Text/Effect Styles 실제 생성(async 수정 확인 포함),
   재적용 갱신·중복 없음, 실패 사유 표시. README 갱신.

## 8. 산출물 위치

- 수정: `core/studio-ui.js`(카테고리 재구성 + 3 훅), `plugin/ui.template.html`(훅 주입 + 출력패널 제거),
  `core/studio.css`(카테고리/모듈-로우 스타일; 웹·플러그인 공유), `plugin/README.md`.
- 변경 없음(확인만): `core/figma-map.js`, `plugin/code.src.js`(메시지/쓰기 그대로), `core/token-core.js`.
- 재생성: `tool/index.html`, `plugin/ui.html`, `plugin/code.js`.
- 테스트: 기존 유지(웹앱/플러그인 DOM은 Chrome 스모크로 검증; 순수 로직 회귀는 기존 스위트).

## 9. 비목표

- 편집 모듈 자체 로직 변경(그룹핑/래핑만; 컨트롤·프리뷰·검증 동작 불변).
- 중첩 collapsible, Paint Style, semantic 레이어, 변수 조회 async 마이그레이션.
- figma.* 스타일 실쓰기 자동 검증(여전히 Figma 수동 QA).
