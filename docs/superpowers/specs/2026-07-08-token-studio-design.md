# Foundations Token Studio — 설계 스펙

- 날짜: 2026-07-08
- 상태: 승인됨 (구현 대기)
- 저자: Cowork 세션 이어받기

## 1. 목적

디자인 시스템 마스터 프리셋의 **파운데이션(primitive) 스케일 토큰을 브라우저에서
시각적으로 커스터마이징**하고, 기존 파이썬 파이프라인과 동일한 4개 산출물을
그대로 내보내는 단독 웹 도구를 만든다.

현재는 값을 바꾸려면 `build_tokens.py` 내부 파이썬 딕셔너리를 직접 편집해야 한다.
이 도구는 그 편집을 **슬라이더/필드 + 실시간 프리뷰**로 대체한다.

"지금 빌드된 값 = 도구의 초기 상태(기본 프리셋)"이다.

## 2. 확정된 결정

| 항목 | 결정 |
|------|------|
| 도구 형태 | 웹 GUI + 실시간 프리뷰 |
| 산출 방식 | GUI가 4개 산출물을 **JS로 직접 생성**(서버·파이썬 불필요, 단독 도구) |
| 기술 스택 | **단일 HTML 파일 + 바닐라 JS**, 의존성 0, 빌드 스텝 없음 |
| v1 범위 | **전체 파운데이션 메타** 편집 가능 |
| 라운드트립 | tokens.json 불러오기 포함(쉬우면), 보너스 |
| WCAG 검증 | 실시간 검증 패널 포함 |

단일 HTML 파일을 선택한 이유: 현 프로젝트가 "빌드 스텝 없는 생성기" 철학이고,
`file://` 로 열 때 JS 모듈 import 제약이 없으며, 파일 하나로 배포/공유가 끝난다.
프레임워크는 이 규모에 오버킬이며, 컨트롤이 수백 개로 늘면 그때 이관한다.

## 3. 아키텍처

```
config (파라미터 객체 = 진짜 SSOT)
  │  DEFAULT_CONFIG = 현재 build_tokens.py 값 임베드
  ├─→ live preview        (모든 변경 시 즉시 갱신)
  ├─→ WCAG 검증 패널       (색 변경 시 즉시 갱신)
  └─→ Export
        ├ tokens/tokens.json      (DTCG)
        ├ build/tokens.css         (CSS 변수)
        ├ build/tailwind.preset.js (Tailwind preset)
        └ build/tokens.figma.json  (Tokens Studio 포맷)
```

`config` 하나에서 화면·검증·모든 산출물이 파생된다. 파이썬 생성기(`build_tokens.py`,
`build_docs.py`)는 역할을 종료하되 참고용으로 저장소에 남긴다.

## 4. 스케일의 두 성격 (편집 UI 구분)

### 4.1 생성형 (파라미터 → 값 계산)

- **Color**
  - 공유 커브: Lightness `Lc[11]`, Chroma multiplier `Cm[11]` (11 스텝: 50~950)
  - hue별: `{ H(hue deg), Cpk(chroma peak) }` — gray/red/orange/amber/green/teal/blue/violet/pink
  - 램프값 = `hexof(Lc[i], Cpk * Cm[i], H)`
  - 조정: hue/chroma peak 슬라이더 + (고급) 공유 커브 편집. 변경 시 램프 전체 재계산.
  - base: white `#FFFFFF`, black `#000000` (고정, 편집 가능)

- **Type scale (font size)**
  - per-step 숫자 필드가 **원천값**(현재 11/12/14/16/18/20/24/30/36/48/60 처럼
    순수 모듈러 스케일이 아니므로 수동값을 진실로 둔다)
  - 보조 기능: "base × ratio 모듈러 스케일 자동 채우기" 버튼 (base·ratio 입력 →
    필드 일괄 채움, 이후 개별 수정 가능)

### 4.2 나열형 (key/value 행 편집)

space, radius, borderWidth, opacity, shadow, zIndex, breakpoint, duration, easing,
fontFamily, fontWeight, lineHeight, letterSpacing.

- 각 그룹: 행 추가 / 삭제 / 키·값 수정.
- 값 타입은 그룹 성격에 맞게(px/숫자/문자열/그림자 문자열 등) 표시.

## 5. 코드 유닛 (단일 파일 내부 모듈 경계)

각 유닛은 독립적으로 이해·테스트 가능해야 한다.

| 유닛 | 책임 | 인터페이스 |
|------|------|-----------|
| `oklch` | OKLCH→sRGB→hex 변환 + 램프 생성 | `hexof(L,C,H) → "#RRGGBB"`, `buildRamp(hue, cpk, Lc, Cm) → {step: hex}` |
| `defaults` | 현재 빌드값을 담은 `DEFAULT_CONFIG` | 상수 객체 |
| `state` | config 로드/변경/리셋(전체·그룹별)/불러오기 | `getConfig`, `setPath`, `resetAll`, `resetGroup`, `loadFromTokensJson` |
| `exporters` | config → 4개 산출물 문자열 (순수함수) | `toDTCG`, `toCSS`, `toTailwind`, `toFigma` |
| `validate` | WCAG AA 대비 검사 + 깨진 참조 검사 | `contrastReport(ramps) → {hue, whiteMinStep, darkMaxStep, pass}` |
| `ui` | 그룹별 컨트롤 패널 + 프리뷰 컴포넌트 렌더 | `renderControls`, `renderPreview` |

`oklch` 변환 공식은 `build_tokens.py` 의 `oklch_to_srgb`/`hexof` 를 그대로 포팅하되,
반올림(round, 0~255 클램프)이 파이썬과 동일하게 동작해야 한다(패리티 조건).

## 6. 프리뷰 & 검증

- **프리뷰**: 컬러 스와치 그리드(hue×step), 타입 스페시먼, spacing/radius/border/
  shadow 시각화, opacity 그리드, motion(duration·easing) 데모.
- **검증 패널**: 색 변경 시 실시간으로 대비 배지 표시.
  - 흰 배경 본문 안전 최소 step (AA 4.5:1)
  - 다크 배경 최대 step
  - 깨진 참조 0건(원시값만이므로 자동 통과)
  - `docs/GUIDE.md` 의 검증 리포트를 살아있는 형태로 재현.

## 7. Export & 라운드트립

- 각 산출물: 생성 → **다운로드(Blob)** + "복사" 버튼 + 미리보기 탭.
- 파일명/경로는 기존과 동일(`tokens.json`, `tokens.css`, `tailwind.preset.js`,
  `tokens.figma.json`).
- 라운드트립(보너스): 기존 `tokens.json` 드롭 → config 복원해 이어서 편집.
  구현 난이도가 높으면 v1에서 제외 가능(스펙상 선택).

## 8. 성공 기준 / 테스트

1. **패리티(핵심)**: `DEFAULT_CONFIG` 로 export한 4개 산출물이 현재 커밋된
   `tokens/tokens.json`, `build/tokens.css`, `build/tailwind.preset.js`,
   `build/tokens.figma.json` 와 구조·값이 일치.
   - 특히 OKLCH hex가 파이썬 출력과 **동일하게** 반올림되는지 골든 체크
     (색상 9종 × 11스텝 = 99개 hex 대조).
2. 스케일 조정 시 프리뷰·검증·export가 모순 없이 갱신.
3. 파일을 `file://` 로 열어 서버 없이 전 기능 동작.

## 8.1 사용성 휴리스틱 (필수 — 결점 없이)

도구 GUI 자체가 사용성 휴리스틱 관점에서 결점이 없어야 한다. 구현·리뷰 시
Nielsen 10대 휴리스틱을 체크리스트로 검증한다.

1. **시스템 상태 가시성** — 현재 편집 중인 그룹/값, 저장·export 상태, "기본값에서
   변경됨(dirty)" 여부를 항상 보이게. 프리뷰가 변경을 즉시 반영.
2. **실세계 일치** — 토큰 용어(step 50~950, radius md 등)를 프로젝트 네이밍 그대로,
   추측 없이 노출.
3. **사용자 제어와 자유** — 모든 변경에 **undo/redo**, 그룹별·전체 **리셋**, 위험 없이
   실험 가능. 실수한 export도 다시 뽑으면 됨.
4. **일관성과 표준** — 컨트롤(슬라이더/필드/행 편집) 패턴을 그룹 간 동일하게.
   웹 관례(입력·포커스·키보드) 준수.
5. **오류 예방** — 잘못된 값(음수 크기, 범위 밖 hue/chroma, 중복 키, gamut 밖 색)을
   입력 단계에서 막거나 클램프. 파괴적 동작(전체 리셋)엔 확인.
6. **인식 우선(기억 부담↓)** — 기본값·현재값·단위를 항상 표시, 외우게 하지 않음.
7. **유연성·효율** — 키보드 입력, 숫자 직접 타이핑, 모듈러 스케일 자동 채우기 등
   숙련자 지름길 제공.
8. **미니멀 디자인** — 화면에 필요한 정보만. 프리뷰가 주인공, 컨트롤은 그룹 접기.
9. **오류 인식·복구** — 검증 실패(WCAG 미달, gamut 클리핑, 깨진 값)를 사람 말로
   설명하고 해결 방법 제시. 색이 아닌 텍스트+아이콘 병행.
10. **도움말** — 각 스케일의 의미·권장 범위를 인라인 힌트로 간단히.

접근성 최소선: 키보드만으로 전 조작 가능, 포커스 링 유지, 대비 배지는 색+텍스트
병행(색맹 안전), 폼 컨트롤에 label 연결.

리뷰 게이트: 구현 후 위 10개 항목을 하나씩 점검해 통과해야 완료로 본다.

## 9. 산출물 위치

- `tool/index.html` — 단일 HTML 도구.
- 기존 `build_tokens.py` / `build_docs.py` / `tokens/` / `build/` / `docs/` 는 유지.

## 10. 비목표 (v1 제외)

- Semantic 레이어(alias, 라이트/다크 테마) — 다음 단계.
- Style Dictionary 등 정식 빌드 파이프라인 이관.
- Figma 변수 실제 반영(Tokens Studio import는 사용자 수동 작업).
- 다중 프리셋 저장/버전 관리 UI.
