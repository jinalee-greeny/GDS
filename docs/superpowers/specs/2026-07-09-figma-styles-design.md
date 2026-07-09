# Figma Plugin: 고정 Apply CTA + Style 내보내기 — 설계 스펙

- 날짜: 2026-07-09
- 상태: 승인됨 (구현 대기)
- 브랜치: feat/figma-styles
- 선행: shared-core Figma plugin (main에 머지됨)

## 1. 목적

Figma 플러그인에 두 가지를 추가한다:
1. **Apply CTA 상시 노출** — "Figma에 적용" 버튼이 스크롤되는 패널 안에 있어 사용자가
   못 찾았다(실제로 이것이 "적용이 안 된다"의 원인이었고, Variables 쓰기 자체는 정상).
   버튼을 하단 고정 바로 빼서 항상 보이게 한다.
2. **Style 내보내기** — 현재 플러그인은 Figma Variables만 쓴다. 타이포와 그림자는
   변수로는 실사용이 어렵다. **Text Styles**(타이포)와 **Effect Styles**(shadow)를
   추가로 생성한다. (색은 Variables로 충분하므로 Paint Style은 비목표.)

## 2. 확정된 결정

| 항목 | 결정 |
|------|------|
| Apply CTA | 하단 **고정 바(sticky footer)**, 항상 노출, 결과 요약 동반 |
| Style 종류 | **Text Styles + Effect Styles** (Paint Style 제외) |
| Text 조합 | **fontSize × 선택 weight** (예 text/md/regular, text/md/bold); family/lineHeight/letterSpacing는 기본값 |
| Text 폰트 | 기본 = 토큰 sans 패밀리(Pretendard); **사용자 override 입력칸** 제공. 폰트 없으면 실패 리포트 |
| Effect | shadow 토큰 CSS 문자열 → DropShadow 이펙트 스타일 1:1 |
| 멱등성 | 이름 매칭 update-or-create (스타일도 변수와 동일) |
| 스타일 조회 API | 기존 Variables와 동일한 sync API (사용자 환경에서 동작 확인됨) |

## 3. UI 변경 (plugin/ui.template.html)

- **하단 고정 바**: `position: sticky/fixed` 푸터에 "Figma에 적용" 버튼 + 결과 요약
  ("생성 N · 갱신 M · 실패 K", 스타일 실패 사유 노출 포함). 스크롤과 무관하게 항상 보임.
- **출력 타깃(스크롤 영역, 각각 on/off)**:
  - Variables — 기존 토큰 그룹 범위 체크박스 (기본 전체)
  - Text Styles — 생성할 **weight 체크박스**(regular/medium/semibold/bold) + **폰트 패밀리
    입력칸**(기본 'Pretendard')
  - Effect Styles — shadow 토큰 전부 (on/off 하나)
- Apply는 켜진 타깃을 모두 적용. 메시지에 `targets`(어떤 출력이 켜졌는지)와 스타일 옵션
  (weights, fontFamily)을 함께 실어 보낸다.

## 4. 신규 순수 매핑 로직 (core/figma-map.js, Node 테스트 가능)

- **`shadowToEffects(cssShadow) -> DropShadowEffect[]`**
  - `"0 2px 6px rgba(0,0,0,0.10)"` → `[{ type:'DROP_SHADOW', color:{r,g,b,a}, offset:{x:0,y:2},
    radius:6, spread:0, visible:true, blendMode:'NORMAL' }]`
  - 쉼표로 구분된 다중 그림자 지원. `rgba()`/`rgb()`/hex 색 파싱, spread(4번째 길이) 선택.
- **`effectStylePlan(config) -> [{ name:'shadow/<key>', effects:DropShadowEffect[] }]`**
  - shadow 토큰 키 순서 유지.
- **`textStylePlan(config, weights, family) -> [{ name, fontSize, fontName, lineHeight, letterSpacing }]`**
  - 각 (fontSize 스텝 × 선택 weight): `name = 'text/<sizeKey>/<weightKey>'`;
    `fontSize` = px 뗀 숫자; `fontName = { family, style }` where style = weight 숫자→Figma 스타일명
    (400→'Regular', 500→'Medium', 600→'SemiBold', 700→'Bold');
    `lineHeight = { unit:'PERCENT', value:150 }` (토큰 normal 1.5 → 150%);
    `letterSpacing = { unit:'PERCENT', value:0 }` (토큰 normal 0em → 0%).
  - `weights`: 선택된 weight 키 배열(예 ['regular','bold']); `family`: 폰트 패밀리 문자열.
  - 결정적 순서: fontSize 스텝 순 × weights 순.
- 기존 `variablesPlan`은 유지.

## 5. Figma 쓰기층 (plugin/code.src.js, 수동 QA)

- `applyPlan`을 타깃별로 확장. `onmessage`가 `{type:'apply', config, selection, targets, textOptions}` 수신.
- **Variables**: 기존 로직 유지 (targets에 variables 켜졌을 때만).
- **Effect Styles**: `getLocalEffectStyles()`로 이름 인덱스 → 없으면 `figma.createEffectStyle()`,
  `style.name = name; style.effects = plan.effects`. 멱등.
- **Text Styles**: 각 항목마다 **`figma.loadFontAsync(fontName)` 먼저**. 성공 시
  `getLocalTextStyles()` 이름 매칭 → 없으면 `figma.createTextStyle()`,
  `style.name`, `style.fontName`, `style.fontSize`, `style.lineHeight`, `style.letterSpacing` 설정.
  **loadFontAsync 실패 시** 해당 항목을 `failed[]`에 사람이 읽는 메시지로 기록
  ("폰트 '<family> <style>'을 Figma에서 사용할 수 없습니다"), 전체 중단하지 않음.
- 항목별 try/catch(부분 성공). 결과: variables/textStyles/effectStyles 각각의 created/updated/failed를
  합산해 `{type:'result', created, updated, failed:[{name,error}]}` 로 postMessage(현 UI 계약 유지).
  onmessage 핸들러는 loadFontAsync 때문에 async가 된다(await).

## 6. 에러/멱등/일관성

- 모든 쓰기 이름 매칭 update-or-create → 재적용 시 중복 없음.
- 항목별 try/catch로 부분 성공 허용, 실패는 failed[]에 사유와 함께.
- 카운터는 쓰기 성공 후에만 증가(기존 패턴 유지).
- 스타일 목록 조회는 sync API(기존 Variables sync가 사용자 환경에서 동작 확인됨).

## 7. 테스트 / 성공 기준

1. **순수 매핑 단위 테스트(Node, 제로-의존)**:
   - `shadowToEffects` 골든: `"0 2px 6px rgba(0,0,0,0.10)"` → offset{0,2}, radius 6, spread 0,
     color a≈0.10; 다중 그림자; hex 색.
   - `effectStylePlan`: shadow 토큰 전체 → 이름/개수/effects.
   - `textStylePlan`: weight→style명 매핑, fontSize 숫자, lineHeight 150%, letterSpacing 0%,
     family override, weights 필터, 결정적 순서.
2. **plugin-apply mock 확장**: 스타일 find-or-create 멱등(재적용 중복 0), loadFontAsync 실패→
   해당 텍스트 스타일이 failed[]에만 잡히고 카운터 미증가.
3. **회귀**: 기존 token-core/parity/roundtrip/variables 테스트 그대로 통과; 웹앱 동작 불변;
   생성물 드리프트 가드 유지(플러그인 생성물 포함).
4. **수동 QA(Figma 데스크톱)**: CTA 항상 보임; Apply 시 선택한 타깃대로 Variables + Text/Effect
   Styles 생성; 재적용 갱신·중복 없음; 폰트 없을 때 명확한 실패 메시지. README 갱신.

## 8. 산출물 위치

- 수정: `core/figma-map.js`(+shadowToEffects/effectStylePlan/textStylePlan),
  `plugin/ui.template.html`(고정 CTA + 타깃 UI), `plugin/code.src.js`(스타일 쓰기 + async),
  `plugin/README.md`(스타일 QA), `build_apps.py`(변경 없음, 재생성만),
  `tool/tests/figma-map.test.mjs`·`tool/tests/plugin-apply.test.mjs`(테스트 추가).
- 재생성: `plugin/ui.html`, `plugin/code.js` (build_apps.py).

## 9. 비목표 (v1 제외)

- Paint(색) Style — 색은 Variables로 충분.
- Semantic 조합 텍스트 스타일(역할 기반), 스타일↔변수 바인딩.
- 비동기 변수/스타일 조회 API로의 마이그레이션(현 sync가 동작).
- Figma Community 퍼블리시.
