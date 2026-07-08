import json,math,os
OUT=os.path.dirname(os.path.abspath(__file__))
T=json.load(open(f"{OUT}/tokens/tokens.json"))

def val(node): return node["$value"]
def ramp(name): return {k:val(v) for k,v in T["color"][name].items()}
color_names=[n for n in T["color"] if n!="base"]

# ---------- contrast ----------
def lum(hex):
    r,g,b=[int(hex[i:i+2],16)/255 for i in (1,3,5)]
    f=lambda c:c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def ratio(a,b):
    la,lb=lum(a),lum(b); L,D=max(la,lb),min(la,lb); return (L+0.05)/(D+0.05)

# validation report
report=[]
white="#FFFFFF"; black="#000000"
report.append("## 접근성(대비) 검증 — WCAG AA 4.5:1 기준\n")
report.append("각 hue에서 흰 배경 대비 본문 텍스트로 안전한 최소 단계, 검은 배경(다크) 대비 최소 단계.\n")
report.append("| 팔레트 | 흰 배경에 AA 통과 최소 step | 검은 배경에 AA 통과 최대 step |")
report.append("|---|---|---|")
for n in ["gray"]+ [x for x in color_names if x!="gray"]:
    r=ramp(n)
    on_white=[s for s,hx in r.items() if ratio(hx,white)>=4.5]
    on_black=[s for s,hx in r.items() if ratio(hx,black)>=4.5]
    ow=min(on_white,key=lambda s:int(s)) if on_white else "—"
    ob=max(on_black,key=lambda s:int(s)) if on_black else "—"
    report.append(f"| {n} | {ow} | {ob} |")
contrast_md="\n".join(report)

# reference integrity: primitive layer -> all raw, no aliases. check no $value startswith {
broken=[]
def walk(node,path=""):
    if isinstance(node,dict):
        if "$value" in node:
            v=node["$value"]
            if isinstance(v,str) and v.strip().startswith("{"): broken.append(path)
        else:
            for k,vv in node.items():
                if not k.startswith("$"): walk(vv,f"{path}.{k}")
walk(T)
integrity="✅ 참조 무결성: 모든 토큰이 원시값(alias 없음) — 깨진 참조 0건." if not broken else f"⚠️ 깨진 참조: {broken}"

# ---------- styleguide.html ----------
def sw(hex):
    tc="#111" if lum(hex)>0.45 else "#fff"
    return f'<div class="sw" style="background:{hex};color:{tc}"><b>{{step}}</b><span>{hex}</span></div>'
html=['<!doctype html><meta charset="utf-8"><title>Design System Preset — Foundations</title>',
'<style>',
'body{font-family:Pretendard,system-ui,-apple-system,sans-serif;margin:0;background:#fafafa;color:#1a1a1a}',
'.wrap{max-width:960px;margin:0 auto;padding:48px 24px}',
'h1{font-size:32px;margin:0 0 4px}h2{font-size:20px;margin:44px 0 14px;padding-bottom:8px;border-bottom:1px solid #e5e5e5}',
'.sub{color:#888;font-size:14px;margin-bottom:8px}',
'.ramp{display:grid;grid-template-columns:repeat(11,1fr);gap:4px;margin-bottom:6px}',
'.rname{font-size:12px;font-weight:700;text-transform:capitalize;margin:10px 0 4px}',
'.sw{border-radius:6px;height:52px;display:flex;flex-direction:column;justify-content:flex-end;padding:5px;font-family:ui-monospace,Menlo,monospace;font-size:9px}',
'.sw b{font-size:10px}.sw span{opacity:.8}',
'.grid{display:flex;flex-wrap:wrap;gap:14px}',
'.card{background:#fff;border:1px solid #eee;border-radius:10px;padding:14px 16px;font-size:13px}',
'.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}',
'table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #eaeaea;padding:6px 10px;text-align:left}',
'.chip{display:inline-block;width:56px;height:56px;background:#6247B5;border-radius:8px}',
'</style>',
'<div class="wrap">',
'<h1>Design System Preset · Foundations</h1>',
'<div class="sub">Master preset (primitive layer) · DTCG-aligned · platform-agnostic</div>']

html.append('<h2>Color</h2>')
for n in color_names:
    r=ramp(n)
    html.append(f'<div class="rname">{n}</div><div class="ramp">')
    for s,hx in r.items():
        tc="#111" if lum(hx)>0.45 else "#fff"
        html.append(f'<div class="sw" style="background:{hx};color:{tc}"><b>{s}</b><span>{hx[1:]}</span></div>')
    html.append('</div>')

# type
html.append('<h2>Typography · size</h2><div class="grid">')
for k,node in T["font"]["size"].items():
    px=val(node)
    html.append(f'<div class="card"><div style="font-size:{px};font-weight:600">Ag 가나다 {k}</div><div class="mono">font-size-{k} · {px}</div></div>')
html.append('</div>')

# space
html.append('<h2>Spacing</h2><table><tr><th>token</th><th>value</th><th></th></tr>')
for k,node in T["space"].items():
    v=val(node); px=int(v.replace("px","")) if v.endswith("px") else 0
    html.append(f'<tr><td class="mono">space-{k}</td><td class="mono">{v}</td><td><div style="height:12px;width:{max(px,1)}px;background:#6247B5;border-radius:2px"></div></td></tr>')
html.append('</table>')

# radius
html.append('<h2>Radius</h2><div class="grid">')
for k,node in T["radius"].items():
    v=val(node)
    html.append(f'<div class="card" style="text-align:center"><div class="chip" style="border-radius:{v}"></div><div class="mono">{k} · {v}</div></div>')
html.append('</div>')

# shadow
html.append('<h2>Elevation</h2><div class="grid">')
for k,node in T["shadow"].items():
    v=val(node)
    html.append(f'<div style="text-align:center"><div style="width:88px;height:60px;background:#fff;border-radius:10px;box-shadow:{v}"></div><div class="mono" style="margin-top:8px">{k}</div></div>')
html.append('</div>')

html.append('</div>')
open(f"{OUT}/docs/styleguide.html","w").write("\n".join(html))

# ---------- GUIDE.md ----------
guide=f"""# Design System Master Preset — Foundations

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

- **컬러**: 숫자 스케일 `color.{{hue}}.{{50–950}}` (예: `color.blue.500`)
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

{integrity}

{contrast_md}
"""
open(f"{OUT}/docs/GUIDE.md","w").write(guide)
print("OK")
print(integrity)
print(contrast_md)
