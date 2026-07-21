# CLAUDE.md — Design System Master Preset (Foundations)

> 이 파일은 Claude Code가 자동으로 읽는 프로젝트 컨텍스트입니다.
> Cowork 세션에서 이어받은 작업입니다. 아래 맥락을 그대로 이어서 진행하세요.

## 프로젝트 목표
"기초 자산(core system)"으로 재사용 가능한 **디자인 시스템 마스터 프리셋** 구축.
현재 단계: **Foundations(primitive) 레이어 완성 (v1)**.

## 확정된 아키텍처 결정
- **SSOT**: `tokens/tokens.json` (DTCG 정렬) 하나만 관리 → 나머지 산출물은 여기서 파생.
- **레이어**: 이번엔 primitive 한 층만. semantic(primary/surface/danger 등)은 다음 단계에서 이 위에 얹음.
- **네이밍**: 컬러 = 숫자 스케일(`color.blue.500`), 크기류 = T단계(`radius.md`), 간격 = 4px numeric(`space.4`).
- **플랫폼**: 무관(platform-agnostic).

## 확정된 파운데이션 값
- **Color**: OKLCH 기반 램프. gray + red·orange·amber·green·teal·blue·violet·pink, 각 50–950 + white/black.
- **Font family**: sans/serif/mono 세 슬롯 모두 Pretendard (교체 가능한 슬롯).
- **Font size**: xs–6xl = 12/14/16/18/20/24/30/36/48/60px (최소 12, base=md 16, 정수 커브).
- **Font weight**: regular400 / medium500 / semibold600 / bold700.
- **Line height**: none1 / tight1.25 / snug1.375 / normal1.5 / relaxed1.625 / loose2.
- **Letter spacing**: tighter -0.05em ~ wider 0.05em.
- **Space**: 0–24 (4px grid).
- **Radius**: none/xs/sm/md/lg/xl/2xl/3xl/full (0~24px, full=9999).
- **Border width**: none/sm1/md2/lg4.
- **Opacity**: 0/5/10/20/40/60/80/100.
- **Shadow**: sm–2xl.
- **Z-index**: base0 / dropdown1000 / sticky1100 / overlay1300 / modal1400 / popover1500 / toast1600 / tooltip1700.
- **Breakpoint**: sm640 / md768 / lg1024 / xl1280 / 2xl1536.
- **Motion**: duration fast100/base200/slow300/slower500(ms), easing standard/decelerate/accelerate/linear.

## 파일 구조
저장소는 **① 토큰 파이프라인**과 **② Token Studio 앱(웹 + Figma 플러그인)** 두 갈래이며,
각 갈래는 SSOT에서 산출물이 파생되는 구조. 생성물은 절대 직접 수정하지 않음.

**① 토큰 파이프라인 (SSOT = `build_tokens.py` 내부 딕셔너리)**
```
tokens/tokens.json        # DTCG 토큰 (파생). 값 직접 수정 금지.
build/tokens.css          # CSS 변수 (파생)
build/tailwind.preset.js  # Tailwind preset (파생)
build/tokens.figma.json   # Tokens Studio 단일 파일 포맷 (Figma 변수 import용, 파생)
docs/GUIDE.md             # 가이드라인 + 검증 리포트 (파생)
docs/styleguide.html      # 리빙 스타일가이드 (파생)
build_tokens.py           # tokens.json + css + tailwind + figma json 생성기 (+ SSOT 데이터)
build_docs.py             # GUIDE.md + styleguide.html + 검증 생성기
```

**② Token Studio 앱 (SSOT = `core/*` + `*.template.*`)**
같은 에디터를 웹 앱과 Figma 플러그인 두 형태로 조립. 패널에서 토큰을 편집하고,
Figma에서는 "Figma에 적용"으로 `Foundations` 컬렉션에 변수/Effect/Text 스타일 생성(재적용 시 중복 없이 갱신).
```
core/token-core.js        # 토큰 로직 코어 (앱 SSOT)
core/studio-ui.js         # 에디터 UI 로직 (앱 SSOT)
core/studio.css           # 에디터 스타일 (앱 SSOT)
core/figma-map.js         # 토큰 → Figma 변수/스타일 매핑 (앱 SSOT)
tool/index.template.html  # 웹 앱 템플릿 (SSOT)  → tool/index.html (파생, 수정 금지)
plugin/ui.template.html   # 플러그인 UI 템플릿 (SSOT) → plugin/ui.html (파생, 수정 금지)
plugin/code.src.js        # 플러그인 메인 소스 (SSOT) → plugin/code.js (파생, 수정 금지)
plugin/manifest.json      # Figma 플러그인 매니페스트 ("Foundations Token Studio")
plugin/README.md          # 플러그인 로드/사용/QA 가이드
build_apps.py             # core/* + 템플릿을 조립해 웹앱·플러그인 생성물 빌드
tool/tests/               # 파리티·드리프트·라운드트립 등 테스트 (node --test)
```

## 산출물 재생성 방법
```bash
python3 build_tokens.py   # ① SSOT 데이터는 build_tokens.py 안의 딕셔너리에 정의됨
python3 build_docs.py     # ① tokens.json을 읽어 문서/검증 생성
python3 build_apps.py     # ② core/* + 템플릿을 조립해 tool/index.html, plugin/code.js·ui.html 생성
```
> 주의 ①: 토큰 값 변경은 `build_tokens.py` 내부 딕셔너리에서만. 재실행하면 tokens.json 이하 전부 갱신.
> 주의 ②: 앱 코드 변경은 `core/*`와 `*.template.*` / `code.src.js`에서만. `build_apps.py` 재실행하면 생성물 갱신. `tool/index.html`·`plugin/code.js`·`plugin/ui.html`은 손대지 않음.

## 검증 상태 (통과)
- 참조 무결성: 원시값만, 깨진 참조 0건.
- WCAG AA(4.5:1): 흰 배경 본문 안전 최소 step = 각 hue 600(green/teal는 700), 다크 배경 최대 step = 500(green/teal 600).

## 다음 단계 후보 (미완)
1. **Semantic 레이어**: primitive를 alias한 `color.semantic.primary` 등 + 라이트/다크 테마 세트.
2. 컬러/타이포 값 미세 조정.
3. Style Dictionary 등 정식 빌드 파이프라인 도입(현재는 커스텀 python 생성기).
4. Figma 변수 실제 반영: Tokens Studio로 `build/tokens.figma.json` import → Export to Variables.
