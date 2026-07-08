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
- **Font family**: sans=Pretendard, serif=Noto Serif KR, mono=JetBrains Mono (모두 교체 가능한 슬롯).
- **Font size**: 2xs–6xl = 11/12/14/16/18/20/24/30/36/48/60px (정수 커브, "안 A").
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
```
tokens/tokens.json        # SSOT (DTCG). 값 수정은 여기서만.
build/tokens.css          # CSS 변수 (파생)
build/tailwind.preset.js  # Tailwind preset (파생)
build/tokens.figma.json   # Tokens Studio 단일 파일 포맷 (Figma 변수 import용, 파생)
docs/GUIDE.md             # 가이드라인 + 검증 리포트
docs/styleguide.html      # 리빙 스타일가이드
build_tokens.py           # tokens.json + css + tailwind + figma json 생성기
build_docs.py             # GUIDE.md + styleguide.html + 검증 생성기
```

## 산출물 재생성 방법
```bash
python3 build_tokens.py   # SSOT 데이터는 build_tokens.py 안의 딕셔너리에 정의됨
python3 build_docs.py     # tokens.json을 읽어 문서/검증 생성
```
> 주의: 현재 SSOT 데이터는 `build_tokens.py` 내부 파이썬 딕셔너리에 있음. 값 변경 시 이 스크립트를 수정 후 재실행하면 tokens.json 이하 전부 갱신됨.

## 검증 상태 (통과)
- 참조 무결성: 원시값만, 깨진 참조 0건.
- WCAG AA(4.5:1): 흰 배경 본문 안전 최소 step = 각 hue 600(green/teal는 700), 다크 배경 최대 step = 500(green/teal 600).

## 다음 단계 후보 (미완)
1. **Semantic 레이어**: primitive를 alias한 `color.semantic.primary` 등 + 라이트/다크 테마 세트.
2. 컬러/타이포 값 미세 조정.
3. Style Dictionary 등 정식 빌드 파이프라인 도입(현재는 커스텀 python 생성기).
4. Figma 변수 실제 반영: Tokens Studio로 `build/tokens.figma.json` import → Export to Variables.
