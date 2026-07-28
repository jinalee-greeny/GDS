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
# Manual color model (mirrors core/token-core.js DEFAULT_CONFIG.color exactly).
# Each scale is an ordered step->hex map; a single-step scale (black/white) is
# a flat color. Order matters — output must byte-match the JS engine.
color_order=["black","white","black-alpha","white-alpha","gray","red","amber","green","blue"]
color_scales={
 "black":{"base":"#000000"},
 "white":{"base":"#FFFFFF"},
 "black-alpha":{"5":"#0000000D","10":"#0000001A","20":"#00000033","40":"#00000066","60":"#00000099","80":"#000000CC"},
 "white-alpha":{"5":"#FFFFFF0D","10":"#FFFFFF1A","20":"#FFFFFF33","40":"#FFFFFF66","60":"#FFFFFF99","80":"#FFFFFFCC"},
 "gray":{"50":"#F5F6F8","100":"#E9EBEF","200":"#D7D9DF","300":"#BDC0C7","400":"#A1A4AC","500":"#898B92","600":"#72747B","700":"#5D5F65","800":"#494A4E","900":"#35373A"},
 "red":{"50":"#FFE8E1","100":"#FFD1C5","200":"#FFAC9E","300":"#FF8477","400":"#FF5D53","500":"#F0443E","600":"#CC3430","700":"#AA2825","800":"#85201D","900":"#621A16"},
 "amber":{"50":"#FFF8E1","100":"#FFECB3","200":"#FFE082","300":"#FFD54F","400":"#FFCA28","500":"#FFB300","600":"#FF8F00","700":"#F57C00","800":"#E65100","900":"#BF360C"},
 "green":{"50":"#E1FFE6","100":"#C4FBCE","200":"#99F1AC","300":"#6BDC88","400":"#3DC267","500":"#21A651","600":"#0E8C41","700":"#067334","800":"#095A28","900":"#0C421E"},
 "blue":{"50":"#DEF8FF","100":"#BFEFFF","200":"#91DDFF","300":"#63C2FF","400":"#36A4FF","500":"#1B8AFF","600":"#0A72DA","700":"#035EB6","800":"#07498E","900":"#0A3668"},
}
color_ramps=color_scales

# ---------- foundation scales ----------
font_family={"sans":"Pretendard, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
             "serif":"'Nanum Myeongjo', ui-serif, Georgia, Cambria, 'Times New Roman', serif",
             "mono":"ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace"}
font_size={"xs":"12px","sm":"14px","md":"16px","lg":"18px","xl":"20px",
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

# ---------- semantic layer (mirrors core/token-core.js DEFAULT_CONFIG.semantic) ----------
semantic = json.loads(r'''{"color":{"light":{"bg":"{color.white}","surface":"{color.gray.50}","surface-sunken":"{color.gray.100}","surface-raised":"{color.white}","surface-hover":"{color.gray.100}","surface-disabled":"{color.gray.100}","overlay":"{color.black-alpha.60}","text":"{color.gray.900}","text-muted":"{color.gray.700}","text-subtle":"{color.gray.500}","text-inverse":"{color.white}","text-link":"{color.blue.700}","text-disabled":"{color.gray.400}","border":"{color.gray.200}","border-strong":"{color.gray.300}","border-subtle":"{color.gray.100}","border-focus":"{color.blue.500}","border-disabled":"{color.gray.200}","primary":"{color.blue.600}","primary-hover":"{color.blue.700}","primary-active":"{color.blue.800}","primary-fg":"{color.white}","primary-subtle":"{color.blue.50}","focus-ring":"{color.blue.500}","accent":"{color.blue.500}","danger":"{color.red.600}","danger-fg":"{color.white}","danger-subtle":"{color.red.50}","danger-on-subtle":"{color.red.700}","warning":"{color.amber.400}","warning-fg":"{color.gray.900}","warning-subtle":"{color.amber.50}","warning-on-subtle":"{color.amber.900}","success":"{color.green.700}","success-fg":"{color.white}","success-subtle":"{color.green.50}","success-on-subtle":"{color.green.700}","info":"{color.blue.600}","info-fg":"{color.white}","info-subtle":"{color.blue.50}","info-on-subtle":"{color.blue.700}"},"dark":{"bg":"{color.gray.900}","surface":"{color.gray.800}","surface-sunken":"{color.gray.900}","surface-raised":"{color.gray.800}","surface-hover":"{color.gray.700}","surface-disabled":"{color.gray.800}","overlay":"{color.black-alpha.60}","text":"{color.gray.50}","text-muted":"{color.gray.300}","text-subtle":"{color.gray.500}","text-inverse":"{color.gray.900}","text-link":"{color.blue.300}","text-disabled":"{color.gray.600}","border":"{color.gray.700}","border-strong":"{color.gray.600}","border-subtle":"{color.gray.800}","border-focus":"{color.blue.400}","border-disabled":"{color.gray.700}","primary":"{color.blue.600}","primary-hover":"{color.blue.700}","primary-active":"{color.blue.800}","primary-fg":"{color.white}","primary-subtle":"{color.blue.900}","focus-ring":"{color.blue.400}","accent":"{color.blue.400}","danger":"{color.red.600}","danger-fg":"{color.white}","danger-subtle":"{color.red.900}","danger-on-subtle":"{color.red.100}","warning":"{color.amber.400}","warning-fg":"{color.gray.900}","warning-subtle":"{color.amber.900}","warning-on-subtle":"{color.amber.100}","success":"{color.green.700}","success-fg":"{color.white}","success-subtle":"{color.green.900}","success-on-subtle":"{color.green.100}","info":"{color.blue.600}","info-fg":"{color.white}","info-subtle":"{color.blue.900}","info-on-subtle":"{color.blue.100}"}},"text":{"display":{"size":"{fontSize.6xl}","weight":"{fontWeight.bold}","lineHeight":"{lineHeight.none}","letterSpacing":"{letterSpacing.tighter}","family":"{fontFamily.sans}"},"h1":{"size":"{fontSize.4xl}","weight":"{fontWeight.bold}","lineHeight":"{lineHeight.tight}","letterSpacing":"{letterSpacing.tight}","family":"{fontFamily.sans}"},"h2":{"size":"{fontSize.3xl}","weight":"{fontWeight.bold}","lineHeight":"{lineHeight.snug}","letterSpacing":"{letterSpacing.normal}","family":"{fontFamily.sans}"},"h3":{"size":"{fontSize.2xl}","weight":"{fontWeight.semibold}","lineHeight":"{lineHeight.snug}","letterSpacing":"{letterSpacing.normal}","family":"{fontFamily.sans}"},"title":{"size":"{fontSize.xl}","weight":"{fontWeight.semibold}","lineHeight":"{lineHeight.snug}","letterSpacing":"{letterSpacing.normal}","family":"{fontFamily.sans}"},"body-lg":{"size":"{fontSize.lg}","weight":"{fontWeight.regular}","lineHeight":"{lineHeight.relaxed}","letterSpacing":"{letterSpacing.normal}","family":"{fontFamily.sans}"},"body":{"size":"{fontSize.md}","weight":"{fontWeight.regular}","lineHeight":"{lineHeight.normal}","letterSpacing":"{letterSpacing.normal}","family":"{fontFamily.sans}"},"body-sm":{"size":"{fontSize.sm}","weight":"{fontWeight.regular}","lineHeight":"{lineHeight.normal}","letterSpacing":"{letterSpacing.normal}","family":"{fontFamily.sans}"},"label":{"size":"{fontSize.sm}","weight":"{fontWeight.medium}","lineHeight":"{lineHeight.normal}","letterSpacing":"{letterSpacing.normal}","family":"{fontFamily.sans}"},"caption":{"size":"{fontSize.xs}","weight":"{fontWeight.regular}","lineHeight":"{lineHeight.normal}","letterSpacing":"{letterSpacing.normal}","family":"{fontFamily.sans}"},"overline":{"size":"{fontSize.xs}","weight":"{fontWeight.semibold}","lineHeight":"{lineHeight.normal}","letterSpacing":"{letterSpacing.wider}","family":"{fontFamily.sans}"},"code":{"size":"{fontSize.sm}","weight":"{fontWeight.regular}","lineHeight":"{lineHeight.normal}","letterSpacing":"{letterSpacing.normal}","family":"{fontFamily.mono}"}},"radius":{"sharp":"{radius.none}","field":"{radius.sm}","control":"{radius.md}","card":"{radius.lg}","modal":"{radius.xl}","pill":"{radius.full}"},"shadow":{"subtle":"{shadow.sm}","card":"{shadow.md}","popover":"{shadow.lg}","modal":"{shadow.xl}","overlay":"{shadow.2xl}"},"space":{"inset-xs":"{space.1}","inset-sm":"{space.2}","inset-md":"{space.4}","inset-lg":"{space.6}","inset-xl":"{space.8}","gap-xs":"{space.1}","gap-sm":"{space.2}","gap-md":"{space.4}","gap-lg":"{space.8}","gap-xl":"{space.12}","section":"{space.20}"}}''')
CSS_PREFIX={"color":"color","fontFamily":"font","fontSize":"font-size","fontWeight":"font-weight","lineHeight":"leading","letterSpacing":"tracking","space":"space","radius":"radius","borderWidth":"border","opacity":"opacity","shadow":"shadow","zIndex":"z","breakpoint":"bp","duration":"duration","easing":"ease"}
TEXT_AXIS_CSS={"size":"size","weight":"weight","lineHeight":"line-height","letterSpacing":"letter-spacing","family":"family"}
def ref_to_css_var(ref):
    if not isinstance(ref,str): return None
    r=ref.strip()
    if not (r.startswith("{") and r.endswith("}")): return None
    parts=r[1:-1].split("."); pre=CSS_PREFIX.get(parts[0])
    if not pre: return None
    return "var(--"+pre+(("-"+"-".join(parts[1:])) if len(parts)>1 else "")+")"
DTCG_TYPE={"color":"color","fontSize":"dimension","fontWeight":"fontWeight","fontFamily":"fontFamily","lineHeight":"number","letterSpacing":"dimension","space":"dimension","radius":"dimension","shadow":"shadow"}
DTCG_FONT_PATH={"fontSize":"font.size","fontWeight":"font.weight","fontFamily":"font.family"}
def sem_token_dtcg(ref):
    if not isinstance(ref,str): return None
    r=ref.strip()
    if not (r.startswith("{") and r.endswith("}")): return None
    parts=r[1:-1].split("."); t=DTCG_TYPE.get(parts[0])
    if not t: return None
    base=DTCG_FONT_PATH.get(parts[0])
    path=(base+(("."+".".join(parts[1:])) if len(parts)>1 else "")) if base else r[1:-1]
    return {"$type":t,"$value":"{"+path+"}"}
def _mapset_dtcg(s):
    o={}
    for k,v in s.items():
        t=sem_token_dtcg(v)
        if t: o[k]=t
    return o
def semantic_dtcg():
    out={"color":{"light":_mapset_dtcg(semantic["color"]["light"]),"dark":_mapset_dtcg(semantic["color"]["dark"])},"text":{}}
    for role,axes in semantic["text"].items(): out["text"][role]=_mapset_dtcg(axes)
    out["radius"]=_mapset_dtcg(semantic["radius"]); out["shadow"]=_mapset_dtcg(semantic["shadow"]); out["space"]=_mapset_dtcg(semantic["space"])
    return out

# ---------- DTCG builder ----------
def grp(tokens,ttype):
    return {k:{"$type":ttype,"$value":v} for k,v in tokens.items()}
def color_grp(order,scales):
    out={}
    for name in order:
        ramp=scales[name]
        if len(ramp)==1:
            out[name]={"$type":"color","$value":list(ramp.values())[0]}
        else:
            out[name]={s:{"$type":"color","$value":v} for s,v in ramp.items()}
    return out

dtcg={
 "$description":"Master Design System Preset — Foundations (primitive layer). Platform-agnostic, DTCG-aligned.",
 "color":color_grp(color_order,color_scales),
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
 "semantic":semantic_dtcg(),
}
with open(f"{OUT}/tokens/tokens.json","w") as f: json.dump(dtcg,f,indent=2,ensure_ascii=False)

# ---------- CSS variables ----------
css=[":root {"]
for name in color_order:
    ramp=color_scales[name]
    if len(ramp)==1:
        css.append(f"  --color-{name}: {list(ramp.values())[0]};")
    else:
        for s,v in ramp.items(): css.append(f"  --color-{name}-{s}: {v};")
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
# semantic tokens as var() chains onto primitives (theme-invariant + light colors)
css.append("")
css.append("  /* semantic — colors (light) */")
for r,ref in semantic["color"]["light"].items():
    v=ref_to_css_var(ref)
    if v: css.append(f"  --{r}: {v};")
css.append("  /* semantic — typography */")
for role,axes in semantic["text"].items():
    for axis,ref in axes.items():
        v=ref_to_css_var(ref)
        if v: css.append(f"  --type-{role}-{TEXT_AXIS_CSS.get(axis,axis)}: {v};")
for grp in ["radius","shadow","space"]:
    css.append(f"  /* semantic — {grp} */")
    for r,ref in semantic[grp].items():
        v=ref_to_css_var(ref)
        if v: css.append(f"  --{grp}-{r}: {v};")
css.append("}")
# dark theme: override the semantic color vars only
css.append("")
css.append(':root[data-theme="dark"] {')
for r,ref in semantic["color"]["dark"].items():
    v=ref_to_css_var(ref)
    if v: css.append(f"  --{r}: {v};")
css.append("}")
open(f"{OUT}/build/tokens.css","w").write("\n".join(css)+"\n")

# ---------- Tailwind preset ----------
tw={
 "theme":{"extend":{
   "colors":{name:(list(color_scales[name].values())[0] if len(color_scales[name])==1 else color_scales[name]) for name in color_order},
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
for name in color_order:
    ramp=color_scales[name]
    if len(ramp)==1:
        tsout["color"][name]={"value":list(ramp.values())[0],"type":"color"}
    else:
        tsout["color"][name]={s:{"value":v,"type":"color"} for s,v in ramp.items()}
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
