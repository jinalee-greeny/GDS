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
    # --- web app ---
    web = inject(read("tool/index.template.html"), {
        "/*__TOKEN_CORE__*/": token_core,
    })
    write("tool/index.html", web)
    print("wrote tool/index.html")

if __name__ == "__main__":
    main()
