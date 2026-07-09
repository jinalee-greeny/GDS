#!/usr/bin/env python3
"""Assemble generated apps from canonical core/*.js by marker replacement.
SSOT lives in core/*.js and *.template.* files; generated files are never hand-edited."""
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f: return f.read()
def write(p, s):
    with open(os.path.join(ROOT, p), "w", encoding="utf-8") as f: f.write(s)

def inject(template, replacements):
    out = template
    for marker, content in replacements.items():
        if marker not in out:
            raise SystemExit(f"marker {marker!r} not found in template")
        out = out.replace(marker, content)
    return out

def main():
    token_core = read("core/token-core.js").rstrip("\n")
    studio_ui = read("core/studio-ui.js").rstrip("\n")
    studio_css = read("core/studio.css").rstrip("\n")
    # --- web app ---
    web = inject(read("tool/index.template.html"), {
        "/*__TOKEN_CORE__*/": token_core,
        "/*__STUDIO_UI__*/": studio_ui,
        "/*__STUDIO_CSS__*/": studio_css,
    })
    write("tool/index.html", web)
    print("wrote tool/index.html")

    # --- figma plugin UI ---
    figma_map = read("core/figma-map.js").rstrip("\n")
    plugin_ui = inject(read("plugin/ui.template.html"), {
        "/*__TOKEN_CORE__*/": token_core,
        "/*__STUDIO_UI__*/": studio_ui,
        "/*__FIGMA_MAP__*/": figma_map,
        "/*__STUDIO_CSS__*/": studio_css,
    })
    write("plugin/ui.html", plugin_ui)
    print("wrote plugin/ui.html")

    # --- figma plugin main thread ---
    plugin_code = inject(read("plugin/code.src.js"), {
        "/*__TOKEN_CORE__*/": token_core,
        "/*__FIGMA_MAP__*/": figma_map,
    })
    write("plugin/code.js", plugin_code)
    print("wrote plugin/code.js")

if __name__ == "__main__":
    main()
