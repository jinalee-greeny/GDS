import math, json, os

# 스크립트가 있는 폴더 기준 (어디로 옮겨도 동작)
OUT=os.path.dirname(os.path.abspath(__file__))
os.makedirs(f"{OUT}/tokens",exist_ok=True)
os.makedirs(f"{OUT}/build",exist_ok=True)
os.makedirs(f"{OUT}/docs",exist_ok=True)

# ---------- OKLCH -> hex ----------
def oklch_to_srgb(L,C,Hdeg):
    h=math.radians(Hdeg); a=C*math.cos(h); b=C*math.sin(h)
    l_=L+0.3963377774*a+0.2158037573*b
    m_=L-0.1055613458*a-0.0638541728*b
    s_=L-0.0894841775*a-1.2914855480*b
    l=l_**3;m=m_**3;s=s_**3
    r= 4.0767416621*l-3.3077115913*m+0.2309699292*s
    g=-1.2684380046*l+2.6097574011*m-0.3413193965*s
    bb=-0.0041960863*l-0.7034186147*m+1.7076147010*s
    def enc(x):
        x=max(0.0,min(1.0,x)); return 12.92*x if x<=0.0031308 else 1.055*(x**(1/2.4))-0.055
    return tuple(round(enc(v)*255) for v in (r,g,bb))
def hexof(L,C,H):
    r,g,b=oklch_to_srgb(L,C,H); return "#%02X%02X%02X"%(r,g,b)

steps=[50,100,200,300,400,500,600,700,800,900,950]
Lc=[0.972,0.940,0.885,0.808,0.720,0.638,0.560,0.487,0.410,0.335,0.262]
Cm=[0.30,0.55,0.85,1.05,1.15,1.10,1.00,0.88,0.72,0.55,0.42]
palettes={"gray":(268,0.010),"red":(27,0.190),"orange":(55,0.170),"amber":(82,0.165),
 "green":(150,0.150),"teal":(185,0.120),"blue":(255,0.180),"violet":(290,0.190),"pink":(350,0.185)}
color_ramps={n:{str(s):hexof(L,Cpk*cm,H) for s,L,cm in zip(steps,Lc,Cm)} for n,(H,Cpk) in palettes.items()}

# ---------- foundation scales ----------
font_family={"sans":"Pretendard, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
             "serif":"'Noto Serif KR', Georgia, 'Times New Roman', serif",
             "mono":"'JetBrains Mono', SFMono-Regular, Menlo, Consolas, monospace"}
font_size={"2xs":"11px","xs":"12px","sm":"14px","md":"16px","lg":"18px","xl":"20px",
           "2xl":"24px","3xl":"30px","4xl":"36px","5xl":"48px","6xl":"60px"}
font_weight={"regular":"400","medium":"500","semibold":"600","bold":"700"}
line_height={"none":"1","tight":"1.25","snug":"1.375","normal":"1.5","relaxed":"1.625","loose":"2"}
letter_spacing={"tighter":"-0.05em","tight":"-0.025em","normal":"0em","wide":"0.025em","wider":"0.05em"}
space={"0":"0px","1":"4px","2":"8px","3":"12px","4":"16px","5":"20px","6":"24px","8":"32px",
       "10":"40px","12":"48px","16":"64px","20":"80px","24":"96px"}
radius={"none":"0px","xs":"2px","sm":"4px","md":"6px","lg":"8px","xl":"12px","2xl":"16px","3xl":"24px","full":"9999px"}
border_width={"none":"0px","sm":"1px","md":"2px","lg":"4px"}
opacity={"0":"0","5":"0.05","10":"0.1","20":"0.2","40":"0.4","60":"0.6","80":"0.8","100":"1"}
shadow={"sm":"0 1px 2px rgba(0,0,0,0.08)","md":"0 2px 6px rgba(0,0,0,0.10)","lg":"0 6px 16px rgba(0,0,0,0.12)",
        "xl":"0 12px 28px rgba(0,0,0,0.16)","2xl":"0 24px 48px rgba(0,0,0,0.20)"}
zindex={"base":"0","dropdown":"1000","sticky":"1100","overlay":"1300","modal":"1400","popover":"1500","toast":"1600","tooltip":"1700"}
breakpoint={"sm":"640px","md":"768px","lg":"1024px","xl":"1280px","2xl":"1536px"}
duration={"fast":"100ms","base":"200ms","slow":"300ms","slower":"500ms"}
easing={"standard":"cubic-bezier(0.4,0,0.2,1)","decelerate":"cubic-bezier(0,0,0.2,1)","accelerate":"cubic-bezier(0.4,0,1,1)","linear":"linear"}

# ---------- DTCG builder ----------
def grp(tokens,ttype):
    return {k:{"$type":ttype,"$value":v} for k,v in tokens.items()}
def color_grp(ramps):
    out={}
    for name,ramp in ramps.items():
        out[name]={s:{"$type":"color","$value":v} for s,v in ramp.items()}
    return out

dtcg={
 "$description":"Master Design System Preset — Foundations (primitive layer). Platform-agnostic, DTCG-aligned.",
 "color":{**color_grp(color_ramps),"base":grp({"white":"#FFFFFF","black":"#000000"},"color")},
 "font":{
   "family":grp(font_family,"fontFamily"),
   "size":grp(font_size,"dimension"),
   "weight":grp(font_weight,"fontWeight"),
 },
 "lineHeight":grp(line_height,"number"),
 "letterSpacing":grp(letter_spacing,"dimension"),
 "space":grp(space,"dimension"),
 "radius":grp(radius,"dimension"),
 "borderWidth":grp(border_width,"dimension"),
 "opacity":grp(opacity,"number"),
 "shadow":grp(shadow,"shadow"),
 "zIndex":grp(zindex,"number"),
 "breakpoint":grp(breakpoint,"dimension"),
 "duration":grp(duration,"duration"),
 "easing":grp(easing,"cubicBezier"),
}
with open(f"{OUT}/tokens/tokens.json","w") as f: json.dump(dtcg,f,indent=2,ensure_ascii=False)

# ---------- CSS variables ----------
css=[":root {"]
for name,ramp in color_ramps.items():
    for s,v in ramp.items(): css.append(f"  --color-{name}-{s}: {v};")
css.append("  --color-white: #FFFFFF;")
css.append("  --color-black: #000000;")
for k,v in font_family.items(): css.append(f"  --font-{k}: {v};")
for k,v in font_size.items(): css.append(f"  --font-size-{k}: {v};")
for k,v in font_weight.items(): css.append(f"  --font-weight-{k}: {v};")
for k,v in line_height.items(): css.append(f"  --leading-{k}: {v};")
for k,v in letter_spacing.items(): css.append(f"  --tracking-{k}: {v};")
for k,v in space.items(): css.append(f"  --space-{k}: {v};")
for k,v in radius.items(): css.append(f"  --radius-{k}: {v};")
for k,v in border_width.items(): css.append(f"  --border-{k}: {v};")
for k,v in opacity.items(): css.append(f"  --opacity-{k}: {v};")
for k,v in shadow.items(): css.append(f"  --shadow-{k}: {v};")
for k,v in zindex.items(): css.append(f"  --z-{k}: {v};")
for k,v in breakpoint.items(): css.append(f"  --bp-{k}: {v};")
for k,v in duration.items(): css.append(f"  --duration-{k}: {v};")
for k,v in easing.items(): css.append(f"  --ease-{k}: {v};")
css.append("}")
open(f"{OUT}/build/tokens.css","w").write("\n".join(css)+"\n")

# ---------- Tailwind preset ----------
tw={
 "theme":{"extend":{
   "colors":{**color_ramps,"white":"#FFFFFF","black":"#000000"},
   "fontFamily":{k:v for k,v in font_family.items()},
   "fontSize":font_size,"fontWeight":font_weight,"lineHeight":line_height,"letterSpacing":letter_spacing,
   "spacing":space,"borderRadius":radius,"borderWidth":border_width,"opacity":opacity,"boxShadow":shadow,
   "zIndex":zindex,"screens":breakpoint,"transitionDuration":{k:v for k,v in duration.items()},
   "transitionTimingFunction":easing,
 }}
}
open(f"{OUT}/build/tailwind.preset.js","w").write("// Tailwind preset generated from tokens.json (SSOT)\nmodule.exports = "+json.dumps(tw,indent=2,ensure_ascii=False)+";\n")

# ---------- Tokens Studio / Figma import (flat strings) ----------
ts={}
def add(cat,d):
    ts[cat]={k:{"value":v,"type":cat} for k,v in d.items()}
tsout={"color":{}}
for name,ramp in color_ramps.items():
    tsout["color"][name]={s:{"value":v,"type":"color"} for s,v in ramp.items()}
tsout["color"]["base"]={"white":{"value":"#FFFFFF","type":"color"},"black":{"value":"#000000","type":"color"}}
tsout["fontFamilies"]={k:{"value":v,"type":"fontFamilies"} for k,v in font_family.items()}
tsout["fontSizes"]={k:{"value":v,"type":"fontSizes"} for k,v in font_size.items()}
tsout["fontWeights"]={k:{"value":v,"type":"fontWeights"} for k,v in font_weight.items()}
tsout["lineHeights"]={k:{"value":v,"type":"lineHeights"} for k,v in line_height.items()}
tsout["letterSpacing"]={k:{"value":v,"type":"letterSpacing"} for k,v in letter_spacing.items()}
tsout["spacing"]={k:{"value":v,"type":"spacing"} for k,v in space.items()}
tsout["borderRadius"]={k:{"value":v,"type":"borderRadius"} for k,v in radius.items()}
tsout["borderWidth"]={k:{"value":v,"type":"borderWidth"} for k,v in border_width.items()}
tsout["opacity"]={k:{"value":v,"type":"opacity"} for k,v in opacity.items()}
tsout["boxShadow"]={k:{"value":v,"type":"boxShadow"} for k,v in shadow.items()}
open(f"{OUT}/build/tokens.figma.json","w").write(json.dumps(tsout,indent=2,ensure_ascii=False))

print("Generated files:")
for root,_,files in os.walk(OUT):
    for fn in files: print(" -",os.path.join(root,fn).replace(OUT,"design-system-preset"))
