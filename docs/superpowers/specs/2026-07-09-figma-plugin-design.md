# Figma Plugin (웹앱과 코어 공유 분기) — 설계 스펙

- 날짜: 2026-07-09
- 상태: 승인됨 (구현 대기)
- 브랜치: feat/figma-plugin
- 선행: Foundations Token Studio 웹앱(tool/index.html, main에 머지됨)

## 1. 목적

Foundations Token Studio 웹앱에서 **코어 로직을 공유**하는 Figma 플러그인을 만든다.
플러그인은 웹앱과 동일한 편집 UI(컨트롤·프리뷰·WCAG 검증)를 Figma 패널에서
제공하고, 튜닝한 토큰을 **Figma Variables로 직접 생성/업데이트**한다. 지금은
tokens.figma.json을 수동 import해야 하지만, 플러그인은 변수를 바로 쓴다.

"웹앱과 코어를 공유하고 껍데기만 분기" — token-core(토큰 수학·exporters)와
studio-ui(렌더링)를 양쪽이 공유하고, 셸(출력 영역·부트스트랩)만 다르다.

## 2. 확정된 결정

| 항목 | 결정 |
|------|------|
| 플러그인 범위 | 풀 스튜디오 + Figma Variables 직접 쓰기 |
| 코어 공유 | 단일 코어 파일 + 파이썬 조립(번들러·npm 0, 드리프트 0) |
| UI 공유 | UI코어(studio-ui)도 공유; 셸이 "출력 영역"만 주입 |
| Variables 범위 | 매핑 가능한 전부가 기본, **사용자가 체크박스로 선택** 가능 |
| 컬렉션/모드 | `Foundations` 컬렉션 하나, 슬래시 그룹, 프리미티브라 단일 모드 |
| 멱등성 | 이름 매칭 update-or-create (재적용 시 중복 없음) |
| 기술 | 바닐라 JS 플러그인(빌드 스텝 없음), figma API |

## 3. 아키텍처 (모노-소스, 파이썬 조립)

```
core/token-core.js       # SSOT: OKLCH·config·4 exporters·contrastReport·store (DOM 없음)
core/studio-ui.js        # 공유 UI코어: el(), 컨트롤/프리뷰/검증 렌더 + render 상태보존
core/figma-map.js        # 신규 공유(순수): hexToFigmaRGB(), variablesPlan(config, selection)

tool/index.template.html # 웹 셸: <style> + 부트스트랩 + 출력=파일 다운로드/복사
plugin/manifest.json     # name/id/api/main:code.js/ui:ui.html/editorType/networkAccess:none
plugin/code.src.js       # main 셸: postMessage 수신 → variablesPlan → Figma Variables 쓰기
plugin/ui.template.html   # 플러그인 셸: 스튜디오 + 범위 체크박스 + "Figma에 적용" 버튼

build_apps.py            # core/*.js 를 각 template의 마커에 인라인 주입 →
                         #   tool/index.html, plugin/code.js, plugin/ui.html 생성
```

`build_apps.py`는 `core/*.js` 원문을 마커 위치에 그대로 인라인한다. 웹앱은 추출
전과 **동작·(가능하면)바이트 동일**하게 재생성된다. 이후 편집은 `core/*` 와
`*.template.*` 에서만 한다(생성물 직접 편집 금지).

### 마이그레이션 (기존 웹앱 리팩터)
현재 tool/index.html은 인라인 `<script id="token-core">` + UI `<script>` + `<style>`.
이를 분해한다:
- `<script id="token-core">` 본문 → `core/token-core.js` (SSOT).
- UI 렌더링 공통부(el, 컨트롤/프리뷰/검증 render, 상태보존) → `core/studio-ui.js`.
- 웹 전용 셸(스타일, 부트스트랩, 파일 다운로드/복사 export 영역) → `tool/index.template.html`.
- `build_apps.py`로 tool/index.html 재생성. 재생성본이 기존과 동일 동작인지 검증
  (기존 17개 테스트 통과 + 생성 index.html의 token-core가 core/token-core.js와 일치).

## 4. 컴포넌트 경계

- **token-core** (공유, 기존): 토큰 수학·config·`toDTCG/toCSS/toTailwind/toFigma`·
  `contrastReport`·`createStore`. DOM 없음. 파이썬 파이프라인 출력과의 패리티 유지.
- **studio-ui** (공유, 추출): `el()`, 컨트롤 패널·프리뷰·WCAG 패널 렌더, `render()`의
  포커스/캐럿·`<details>` 펼침·스크롤 보존. 셸이 "출력 영역" DOM만 주입.
- **figma-map** (공유, 신규, 순수/Node 테스트 가능):
  - `hexToFigmaRGB('#RRGGBB') → {r, g, b}` (0–1 float)
  - `variablesPlan(config, selection) → [{ group, name, type, value }]`
    - `type` ∈ `'COLOR' | 'FLOAT' | 'STRING'`
    - 매핑: 컬러→COLOR(rgba); space·radius·borderWidth·fontSize·opacity·lineHeight·
      zIndex·breakpoint·duration→FLOAT(px/ms 제거, opacity 0–1); fontFamily·fontWeight·
      letterSpacing·easing→STRING; shadow→STRING(CSS 문자열)
    - `selection`은 사용자가 체크한 그룹 키 집합; 미선택 그룹은 plan에서 제외
    - 이름: 슬래시 그룹(`color/blue/500`, `space/4`, `radius/md`)
    - 멱등: 동일 입력 → 동일 plan
- **plugin/code (main 스레드)**: `figma.showUI`; UI에서 `{type:'apply', config, selection}`
  수신 → `variablesPlan` → `Foundations` 컬렉션 find-or-create(단일 모드) → 각 항목
  변수 이름 매칭 update-or-create + `setValueForMode` → `{type:'result', created, updated, failed[]}`
  postMessage.
- **plugin/ui (UI iframe)**: studio-ui 재사용(컨트롤·프리뷰·검증) + "Variables 범위"
  체크박스(기본 전체 선택) + "Figma에 적용" 버튼(클릭 시 config+selection postMessage).
  파일 다운로드 대신 Figma 적용이 출력 영역.

## 5. 데이터 흐름

```
[플러그인 UI iframe]                             [main 스레드 (figma)]
config 편집 → studio-ui 라이브 프리뷰/검증
범위 체크박스로 selection 조정
"Figma에 적용" 클릭
  └ postMessage({type:'apply', config, selection}) ─▶ variablesPlan(config, selection)
                                                      Foundations 컬렉션 find-or-create
                                                      항목별 변수 update-or-create + setValueForMode
  ◀─ postMessage({type:'result', created, updated, failed[]}) ─┘
결과 요약 표시 ("생성 N · 갱신 M · 실패 K")
```

프리뷰·검증은 UI 내부에서 즉시(웹앱과 동일). Figma 쓰기는 "적용" 시에만.

## 6. 에러 처리

- 변수 쓰기는 항목별 try/catch → 실패 목록 수집, 부분 성공 허용(전체 롤백 안 함).
- 이름 매칭 update-or-create로 중복 변수 방지(재적용 안전, 멱등).
- 컬렉션/모드 생성 실패 시 사람이 읽는 메시지 반환.
- postMessage는 `type` 필드로 구분, 알 수 없는 메시지 무시.
- `manifest.networkAccess: none` — 외부 통신 없음, 값 전부 로컬 계산.

## 7. 테스트 / 성공 기준

1. **token-core 회귀**: 공유 코어 추출 후에도 기존 17개 테스트 통과. 생성된
   tool/index.html의 token-core가 `core/token-core.js`와 일치(드리프트 방지 테스트 추가).
2. **웹앱 무변화**: 파일 export·프리뷰·검증 동작이 추출 전과 동일(회귀 확인).
3. **figma-map 단위 테스트** (Node, 제로-의존):
   - `hexToFigmaRGB` 골든(예: `#1B8AFF`→해당 rgba)
   - `variablesPlan` 골든: `space/4`→FLOAT 16, `radius/md`→FLOAT 6,
     `color/blue/500`→COLOR, `fontFamily/sans`→STRING; `selection` 필터; 멱등.
4. **플러그인 figma 쓰기층**: 헤드리스 불가 → Figma 데스크톱 unpublished 로드로 수동
   QA(컬렉션 생성, 재적용 갱신·중복 없음, 범위 체크박스 반영, 실패 리포트).
5. **조립 재현성**: `python3 build_apps.py` 재실행 시 생성물 안정(idempotent).

## 8. 산출물 위치

- `core/token-core.js`, `core/studio-ui.js`, `core/figma-map.js`
- `tool/index.template.html` (→ 생성: `tool/index.html`)
- `plugin/manifest.json`, `plugin/code.src.js` (→ `plugin/code.js`),
  `plugin/ui.template.html` (→ `plugin/ui.html`)
- `build_apps.py`
- `tool/tests/` 에 figma-map 테스트 + core 드리프트 테스트 추가

## 9. 비목표 (v1 제외)

- Semantic 레이어, 라이트/다크 모드, 변수 alias.
- Figma Community 퍼블리시.
- 양방향 동기화(Figma Variables → config 역임포트).
- 웹앱 UI 기능 변경(리팩터로 인한 구조 변화만, 동작 동일).
