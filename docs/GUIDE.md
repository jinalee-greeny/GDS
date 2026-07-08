# Design System Master Preset — Foundations

**기초 자산(core system)** 으로 재사용하기 위한 파운데이션 토큰 프리셋입니다.
플랫폼 무관 · primitive 한 층 · DTCG 표준 정렬.

## 구조 (Single Source of Truth)

```
tokens/tokens.json   ← 여기만 관리 (SSOT)
        │
        ├─ build/tokens.css         CSS 커스텀 프로퍼티
        ├─ build/tailwind.preset.js Tailwind preset
        ├─ build/tokens.figma.json  Figma(Tokens Studio) import용
        └─ docs/styleguide.html     리빙 스타일가이드
```

## 네이밍 규칙

- **컬러**: 숫자 스케일 `color.{hue}.{50–950}` (예: `color.blue.500`)
- **크기류**: T단계 명칭 (예: `radius.md`, `font.size.lg`)
- **간격**: 4px 그리드 numeric (예: `space.4` = 16px)

## 담긴 파운데이션

| 카테고리 | 스케일 |
|---|---|
| Color | gray + red·orange·amber·green·teal·blue·violet·pink × 50–950, white/black |
| Font family | sans(Pretendard) · serif(Noto Serif KR) · mono(JetBrains Mono) |
| Font size | 2xs–6xl (11–60px, 정수 커브) |
| Font weight | regular·medium·semibold·bold |
| Line height | none–loose (1–2) |
| Letter spacing | tighter–wider |
| Space | 0–24 (4px grid) |
| Radius | none–3xl, full |
| Border width | none·sm·md·lg |
| Opacity | 0–100 |
| Shadow | sm–2xl |
| Z-index | base–tooltip |
| Breakpoint | sm–2xl |
| Motion | duration(fast–slower) · easing(standard 등) |

## 사용법

**CSS**: `build/tokens.css`를 import 후 `var(--color-blue-500)`, `var(--space-4)` 사용.
**Tailwind**: `tailwind.config.js`의 `presets: [require('./build/tailwind.preset.js')]`.
**Figma**: Tokens Studio 플러그인에서 `build/tokens.figma.json` import → Variables로 변환.

## 다음 단계 (이 프리셋을 씨앗으로)

이 primitive 위에 **semantic 레이어**(`primary`, `surface`, `danger` 등)를 프로젝트별로 얹으면
브랜드 테마·다크모드로 확장됩니다. 이번 프리셋은 그 기반이 되는 core 자산입니다.

---

## 검증 리포트

✅ 참조 무결성: 모든 토큰이 원시값(alias 없음) — 깨진 참조 0건.

## 접근성(대비) 검증 — WCAG AA 4.5:1 기준

각 hue에서 흰 배경 대비 본문 텍스트로 안전한 최소 단계, 검은 배경(다크) 대비 최소 단계.

| 팔레트 | 흰 배경에 AA 통과 최소 step | 검은 배경에 AA 통과 최대 step |
|---|---|---|
| gray | 600 | 500 |
| red | 600 | 500 |
| orange | 600 | 500 |
| amber | 600 | 500 |
| green | 700 | 600 |
| teal | 700 | 600 |
| blue | 600 | 500 |
| violet | 600 | 500 |
| pink | 600 | 500 |
