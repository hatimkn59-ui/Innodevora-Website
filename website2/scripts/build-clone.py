#!/usr/bin/env python3
"""Build the local clone of sites-template.framer.website.

Strategy: take the original SSR HTML verbatim, localize every resource
reference to the project's assets/ directory, and remove tracking scripts.
Nothing is re-generated — the DOM, CSS, inline JS and Framer runtime are
preserved so the clone is a 1:1 faithful reproduction.
"""
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "RECON", "original.html")
OUT = os.path.join(ROOT, "index.html")
MANIFEST = os.path.join(ROOT, "RECON", "asset-manifest.json")

html = open(SRC, encoding="utf-8").read()
manifest = json.load(open(MANIFEST, encoding="utf-8"))

# ---- 1. Build URL -> local relative path maps -----------------------------
img_map, font_map, css_map = {}, {}, {}
for a in manifest["assets"]:
    base = a["url"].split("?")[0]
    if a["kind"] == "image":
        img_map[base] = a["localPath"]
    elif a["kind"] == "font":
        font_map[base] = a["localPath"]
    elif a["kind"] == "stylesheet":
        css_map[base] = a["localPath"]

# Framer site JS modules downloaded separately into assets/js
js_map = {}
js_dir = os.path.join(ROOT, "assets", "js", "framerusercontent", "sites", "38UUnKPstCvsIOUTUjqT9c")
if os.path.isdir(js_dir):
    for fn in os.listdir(js_dir):
        if fn.endswith(".mjs"):
            js_map[fn] = f"assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/{fn}"

# ---- 2. Rewrite resource references ---------------------------------------
def rewrite_url(u):
    base = u.split("?")[0]
    if base in img_map:
        return img_map[base]
    if base in font_map:
        return font_map[base]
    if base in css_map:
        return css_map[base]
    m = re.search(r"/sites/38UUnKPstCvsIOUTUjqT9c/([^?]+)$", u)
    if m and m.group(1) in js_map:
        return js_map[m.group(1)]
    return None

def replace_attr(match):
    attr, quote, u = match.group(1), match.group(2), match.group(3)
    local = rewrite_url(u)
    return f'{attr}="{local}"' if local else match.group(0)

html = re.sub(r'(href|src)=(["\'])([^"\']+)\2', replace_attr, html)

def rewrite_css_url(m):
    u = m.group(1).strip("\"'")
    local = rewrite_url(u)
    return f'url("{local}")' if local else m.group(0)

html = re.sub(r'url\((["\']?)([^)\s]+)\1\)', rewrite_css_url, html)

# ---- 3. Remove tracking / non-essential remote scripts -------------------
html = re.sub(
    r'<script[^>]*src="https://events\.framer\.com/script\?v=2"[^>]*>\s*</script>',
    '', html)

# ---- 4. Inject self-hosted font stylesheet link ---------------------------
if 'fonts/fonts.css' not in html:
    html = html.replace('</head>', '<link rel="stylesheet" href="assets/fonts/fonts.css">\n</head>', 1)

# ---- 5. Write out ----------------------------------------------------------
open(OUT, "w", encoding="utf-8").write(html)
print(f"wrote {OUT} ({len(html)} bytes)")

remaining = {u for u in re.findall(r'(?:href|src)="(https?://[^"]+)"', html)
             if 'framerusercontent.com/sites/38UUnKPstCvsIOUTUjqT9c' not in u}
print(f"remaining remote references: {len(remaining)}")
for u in sorted(remaining)[:20]:
    print("  ", u)