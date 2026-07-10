# Figma Plugin: 출력 항목 카테고리 그룹핑 + 스타일 쓰기 수정 — 설계 스펙

- 날짜: 2026-07-10
- 상태: 승인됨 (구현 대기)
- 브랜치: feat/output-grouping
- 선행: figma-styles (sticky CTA + Text/Effect export, main에 머지됨)

## 1. 목적

플러그인 출력 선택 UI를 재구성한다. 현재 Variables 아래 15개 그룹 체크박스가 평평하게
나열돼 파편화돼 있고 Text/Effect Styles는 별도 타깃이다. 이를 **6개 카테고리 트리**로
묶고(카테고리 master 토글 + 하위 종목 개별 토글), 스타일을 카테고리에 녹인다.

동시에, 현재 Effect/Text **Styles가 Figma에 실제로 생성되지 않는 버그**를 함께 고친다
(유력 원인: 스타일 조회의 deprecated 동기 API). 이 UI만 고치면 스타일 토글이 여전히
무의미하므로 같이 처리한다.

## 2. 확정된 결정

| 항목 | 결정 |
|------|------|
| 그룹 구조 | **통합 카테고리 트리** (스타일을 카테고리에 녹임) |
| 카테고리 | Color / Typography / Spacing & Sizing / Effects / Motion / Layout |
| 토글 모델 | 카테고리 master(하위 전체 on/off + 롤업) + 하위 종목별 개별 체크박스; export = 체크된 leaf 집합 |
| shadow | **Effect Style로만** (variablesPlan에서 제거) |
| 스타일 버그 | 이 작업에 **포함** — 스타일 조회를 async API로 전환 + 실패 사유 UI 노출 |
| 컬렉션 | Foundations 단일 유지 (비목표: 다중 컬렉션) |

## 3. 카테고리 분류 (taxonomy)

```
▾ Color              [master]   · color (var)
▾ Typography         [master]   · fontSize · fontFamily · fontWeight · lineHeight · letterSpacing (var)
                                 · Text Styles  (leaf; 켜면 weight 체크 + 폰트 입력)
▾ Spacing & Sizing   [master]   · space · radius · borderWidth (var)
▾ Effects            [master]   · opacity (var)
                                 · Effect Styles (shadow) (leaf)
▾ Motion             [master]   · duration · easing (var)
▾ Layout             [master]   · zIndex · breakpoint (var)
```

- 변수 leaf 그룹키(shadow 제외): color, fontSize, fontFamily, fontWeight, lineHeight,
  letterSpacing, space, radius, borderWidth, opacity, duration, easing, zIndex, breakpoint (14개).
- Text Styles / Effect Styles는 leaf(비-변수 출력).

## 4. UI (plugin/ui.template.html)

- `renderOutputTargets`를 카테고리 트리로 재작성. 각 카테고리는 접이식 그룹(제목 + master
  체크박스). master 체크박스는 하위 leaf 전체를 on/off; 하위가 일부만 켜지면 indeterminate.
- 하위 leaf 체크박스: 변수 그룹 leaf(체크 시 해당 그룹키를 `selection`에 포함); Text Styles
  leaf(체크 시 weight 체크박스 4종 + 폰트 패밀리 입력 노출, 안정적 id로 포커스 보존);
  Effect Styles leaf(체크 시 shadow effect 출력).
- 체크박스 checked는 **DOM .checked 프로퍼티**로 설정(el() attrs로 `checked` 전달 금지 —
  기존 버그 재발 방지). 모든 DOM은 el()/textContent.
- 하단 고정 CTA 바 유지. **결과 요약에 실패 사유 노출**: `생성 N · 갱신 M · 실패 K`에 더해
  실패가 있으면 실패 항목들의 에러(최소 첫 1–2개 + 필요시 전체 목록)를 사람이 읽게 표시.
- 상태: `selection`(체크된 변수 그룹키 배열), `textStyles={enabled, weights, family}`,
  `effectStyles={enabled}`; 카테고리 master는 파생/편의 토글.

## 5. 메시지 / 적용 매핑 (plugin/code.src.js — 최소 변경 + 스타일 수정)

- 메시지: `{type:'apply', config, selection, targets:{variables, textStyles, effectStyles}, textOptions:{weights, family}}`
  - `selection` = 체크된 변수 그룹키(shadow 없음).
  - `targets.variables` = 변수 leaf가 하나라도 체크됨(= selection 비어있지 않음).
  - `targets.textStyles` = Text Styles leaf 체크; `targets.effectStyles` = Effect Styles leaf 체크.
- **스타일 조회 async 전환**: `applyEffectStyles`/`applyTextStyles`가
  `await figma.getLocalEffectStylesAsync()` / `getLocalTextStylesAsync()` 사용.
  `applyEffectStyles`도 async가 되고 `applyPlan`이 await. (변수 조회는 현행 유지 — 동작 확인됨.)
- 나머지 write 로직(find-or-create by name, counter-after-write, per-item try/catch,
  loadFontAsync 먼저)은 유지. 결과 계약 `{type:'result', created, updated, failed:[{name,error}]}` 유지.

## 6. figma-map 변경

- `GROUP_KEYS`에서 `shadow` 제거. `STRING_GROUPS`에서 shadow 제거(더 이상 STRING 변수 아님).
- `variablesPlan`은 shadow를 더 이상 emit하지 않음. `effectStylePlan`/`textStylePlan` 유지.
- 관련 골든 테스트 갱신(shadow가 variablesPlan 결과/GROUP_KEYS에 없음).

## 7. 테스트 / 성공 기준

1. **figma-map 단위 테스트**: GROUP_KEYS에 shadow 없음; variablesPlan(전체 선택)에 `shadow/*`
   없음; effectStylePlan/textStylePlan/ shadowToEffects 기존 골든 유지.
2. **plugin-apply mock**: async 스타일 getter(getLocalEffectStylesAsync/getLocalTextStylesAsync)로
   갱신; 효과/텍스트 스타일 멱등(재적용 중복 0); 폰트 실패→failed-only 유지; targets 게이팅 유지.
3. **회귀**: token-core parity/변수 동작/웹앱 불변; 드리프트 가드(플러그인 생성물 포함) 유지;
   전체 스위트 green.
4. **UI**: Chrome 스모크 — 6개 접이식 카테고리(master+leaf 토글), Text 하위 컨트롤, 고정 CTA,
   실패 사유 표시 영역. 콘솔 에러 없음.
5. **수동 QA(Figma 데스크톱)**: 카테고리별 export 선택대로 Variables + Text/Effect Styles가
   **실제로 생성**됨(async 전환으로 스타일 버그 해소 확인); 재적용 갱신·중복 없음; 폰트 없거나
   에러 시 하단 바에 사유 표시. README 갱신.

## 8. 산출물 위치

- 수정: `core/figma-map.js`(shadow 제거), `plugin/ui.template.html`(카테고리 트리 + 실패 사유),
  `plugin/code.src.js`(async 스타일 getter + selection/targets 매핑), `plugin/README.md`,
  `tool/tests/figma-map.test.mjs`·`tool/tests/plugin-apply.test.mjs`.
- 재생성: `plugin/ui.html`, `plugin/code.js` (build_apps.py).

## 9. 비목표

- Figma 다중 컬렉션/서브컬렉션(Foundations 단일 유지).
- Paint Style, semantic 레이어.
- 변수 조회 async 마이그레이션(변수는 동작하므로 현행 유지; 스타일만 전환).
- 재적용 시 해제된 항목의 기존 변수/스타일 자동 삭제(find-or-create라 orphan — README에 명시).
