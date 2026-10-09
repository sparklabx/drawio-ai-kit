#!/usr/bin/env python3
"""build_pack.py — build a base64 icon pack from packs/<name>/manifest.json → catalog/<name>.json.

Each manifest icon resolves a square AWS-style tile one of three ways:
  - "slug": <simple-icons slug>  → monochrome glyph on a brand-colour square (white logo).
  - "url":  <svg url>            → embed the SVG AS-IS (already a coloured logo, e.g. Databricks).
  - neither                      → coloured text tile (fallback) using "abbr" or "label".

catalog/*.json packs are merged by core.loadCatalog, so icons become searchable like AWS ones.
Stdlib only. Usage: python3 scripts/build_pack.py <pack>... [--raster]   (default: bigdata)
Default embeds minified SVG (a 96 px PNG when that is smaller). --raster forces PNG (macOS qlmanage).
--shrink-png re-encodes the PNGs already in catalog/<pack>.json at 96 px, in place (macOS sips).
"""
import sys, json, base64, re, glob, shutil, subprocess, tempfile, urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SIMPLE_ICONS = "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/{}.svg"
DEVICON = "https://raw.githubusercontent.com/devicons/devicon/master/icons/{n}/{n}-{v}.svg"
STYLE = ("sketch=0;html=1;outlineConnect=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;"
         "fontColor=#232F3E;aspect=fixed;shape=image;image={};")


def fetch(url):
    for _ in range(3):  # retry: simple-icons fetches flake occasionally → don't silently drop a logo
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "drawio-ai-kit"})
            with urllib.request.urlopen(req, timeout=25) as r:  # noqa: S310 (trusted icon sources)
                if r.status == 200:
                    return r.read().decode("utf-8", "replace")
        except Exception:
            pass
    return None


def fg(color):  # readable glyph/text colour for a given tile bg (white on dark, dark on light/yellow)
    c = color.lstrip("#")
    if len(c) != 6:
        return "#ffffff"
    r, g, b = (int(c[i:i + 2], 16) for i in (0, 2, 4))
    lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    return "#232F3E" if lum > 0.6 else "#ffffff"


def tile_logo(color, paths):  # monochrome glyph (24x24) → contrast-colour on a brand 64x64 tile
    inner = "".join(f'<path d="{d}"/>' for d in paths)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            f'<rect width="64" height="64" fill="{color}"/>'
            f'<g transform="translate(14 14) scale(1.5)" fill="{fg(color)}">{inner}</g></svg>')


def tile_text(color, text):
    fs = 18 if len(text) <= 3 else (13 if len(text) <= 6 else 10)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            f'<rect width="64" height="64" fill="{color}"/>'
            f'<text x="32" y="33" font-family="Arial,Helvetica,sans-serif" font-size="{fs}" font-weight="700" '
            f'fill="{fg(color)}" text-anchor="middle" dominant-baseline="central">{text}</text></svg>')


def _inner_and_viewbox(svg):  # split a logo SVG into body + viewBox + namespace decls so it nests in a tile
    m = re.search(r"<svg\b([^>]*)>(.*)</svg>", svg, flags=re.S)
    attrs, body = (m.group(1), m.group(2)) if m else ("", svg)
    vb = re.search(r'viewBox="([^"]+)"', attrs)
    if vb:
        vb = vb.group(1)
    else:
        w, h = re.search(r'\bwidth="([\d.]+)', attrs), re.search(r'\bheight="([\d.]+)', attrs)
        vb = f"0 0 {w.group(1)} {h.group(1)}" if w and h else "0 0 24 24"
    # carry the logo's xmlns:* prefixes (sodipodi/inkscape/dc/rdf/xlink…) onto the nested <svg> — Inkscape
    # / vectorlogo.zone SVGs use them in the body; without the decls the nested XML is malformed (error page).
    ns = " ".join(re.findall(r'xmlns:[\w-]+="[^"]*"', attrs))
    return body, vb, ns


def as_is(svg):  # embed a ready-made (already square / full-bleed) logo; just guarantee namespaces
    head = svg.split(">", 1)[0]
    if "xmlns" not in head:
        svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    return svg


def tile_framed(logo_svg):  # full-colour logo centred on a white square tile (AWS-style footprint)
    body, vb, ns = _inner_and_viewbox(logo_svg)
    # xmlns:xlink on the wrapper (devicon masks/clips use xlink:href); `ns` carries the logo's own prefixes.
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64">'
            '<rect x="0.75" y="0.75" width="62.5" height="62.5" fill="#FFFFFF" stroke="#E1E5EA" stroke-width="1.5"/>'
            f'<svg {ns} x="10" y="10" width="44" height="44" viewBox="{vb}" preserveAspectRatio="xMidYMid meet">{body}</svg>'
            '</svg>')


def png_tile(png_bytes, framed=True):  # a vendored PNG logo centred on a tile (white square if framed)
    b64 = base64.b64encode(png_bytes).decode("ascii")
    rect = ('<rect x="0.75" y="0.75" width="62.5" height="62.5" fill="#FFFFFF" stroke="#E1E5EA" stroke-width="1.5"/>'
            if framed else "")
    x, wh = (10, 44) if framed else (2, 60)
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64">'
            f'{rect}<image x="{x}" y="{x}" width="{wh}" height="{wh}" preserveAspectRatio="xMidYMid meet" '
            f'xlink:href="data:image/png;base64,{b64}"/></svg>')


PNG_PX = 96  # icons draw at 48 px; 96 keeps them sharp on 2x screens. 256 px tiles were ~3x larger for no gain.
SVG_MAX = 12_000  # a minified SVG above this usually wraps a big raster (delta, kyverno…) → a 96 px PNG is smaller


def rasterize(svg, size=PNG_PX):
    # Bake a tile to PNG. macOS QuickLook (WebKit) renders SVG paths + text faithfully with zero extra
    # deps. ponytail: macOS-only — on Linux install librsvg + use rsvg-convert.
    if not shutil.which("qlmanage"):
        return None
    with tempfile.TemporaryDirectory() as td:
        (Path(td) / "tile.svg").write_text(svg)
        subprocess.run(["qlmanage", "-t", "-s", str(size), "-o", td, str(Path(td) / "tile.svg")],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        out = glob.glob(str(Path(td) / "*.png"))
        return (Path(out[0])).read_bytes() if out else None


def minify_svg(svg):
    # Strip what draw.io never draws (prolog, comments, editor metadata, inter-tag whitespace) and round
    # coordinates to 2 decimals — invisible at icon size (0.01 of an 18-unit viewBox ≈ 0.03 px at 48 px).
    svg = re.sub(r"<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--.*?-->", "", svg, flags=re.S)
    svg = re.sub(r"<(metadata|title|desc|sodipodi:namedview)\b.*?(</\1>|/>)", "", svg, flags=re.S)
    svg = re.sub(r"(-?\d*\.\d{2})\d+", r"\1", svg)
    return re.sub(r">\s+<", "><", svg).strip()


def data_uri(svg):
    # drawio splits style tokens on ";", so the usual "data:image/png;base64," breaks the image=
    # value. drawio's own convention drops ";base64" — "data:image/<type>,<base64>" (comma) — and
    # assumes base64. Match it.
    # Default: embed the (minified) SVG — ~8x smaller than a 256 px PNG, and current draw.io desktop
    # exports SVG data-URIs fine (verified with rlespinasse/drawio-desktop-headless). --raster keeps the
    # old PNG bake for draw.io builds that don't.
    small = minify_svg(svg)
    png = rasterize(svg) if RASTER or len(small) > SVG_MAX else None
    if png and (RASTER or len(png) < len(small)):
        return "data:image/png," + base64.b64encode(png).decode("ascii")
    return "data:image/svg+xml," + base64.b64encode(small.encode("utf-8")).decode("ascii")


def shrink_png(pack):
    # Re-encode the PNGs already embedded in catalog/<pack>.json at PNG_PX, in place — offline, and it
    # keeps hand-tuned entries (e.g. network/keycloak) that a manifest rebuild would drop.
    p = ROOT / "catalog" / f"{pack}.json"
    cat = json.loads(p.read_text())
    before = after = 0
    with tempfile.TemporaryDirectory() as td:
        for i in cat["icons"]:
            m = re.search(r"image=data:image/png,([^;]+)", i["style"])
            if not m:
                continue
            src, out = Path(td) / "in.png", Path(td) / "out.png"
            src.write_bytes(base64.b64decode(m.group(1)))
            subprocess.run(["sips", "-Z", str(PNG_PX), str(src), "--out", str(out)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            new = base64.b64encode(out.read_bytes()).decode("ascii")
            before += len(m.group(1))
            if len(new) < len(m.group(1)):
                i["style"] = i["style"].replace(m.group(1), new)
                after += len(new)
            else:
                after += len(m.group(1))
    p.write_text(json.dumps(cat, ensure_ascii=False, indent=1))
    print(f"shrunk catalog/{pack}.json PNGs: {before // 1024} KB -> {after // 1024} KB")


def main(pack):
    man = json.loads((ROOT / "packs" / pack / "manifest.json").read_text())
    icons = []
    for t in man["icons"]:
        svg = src = None
        # frame:false → embed the logo as-is (for logos that are already a full-bleed square, e.g. ClickHouse)
        wrap = as_is if t.get("frame") is False else tile_framed
        # 0) vendored local asset (PNG/SVG under packs/<pack>/), highest priority — user-supplied exact logo
        if t.get("file"):
            fp = ROOT / "packs" / pack / t["file"]
            if fp.exists():
                if fp.suffix.lower() == ".svg":
                    svg, src = wrap(fp.read_text()), "file"
                else:
                    svg, src = png_tile(fp.read_bytes(), framed=t.get("frame") is not False), "file"
        # 1) devicon: authentic full-colour symbol → white square tile (or as-is if frame:false)
        if svg is None and t.get("devicon"):
            for v in ("original", "plain"):
                raw = fetch(DEVICON.format(n=t["devicon"], v=v))
                if raw:
                    svg, src = wrap(raw), "devicon"
                    break
        # 2) explicit full-colour logo URL
        if svg is None and t.get("url"):
            raw = fetch(t["url"])
            if raw:
                svg, src = wrap(raw), "asis"
        # 3) simple-icons monochrome glyph → contrast colour on a brand-colour tile
        if svg is None and t.get("slug"):
            raw = fetch(SIMPLE_ICONS.format(t["slug"]))
            if raw:
                svg, src = tile_logo(t["color"], re.findall(r'<path[^>]*\bd="([^"]+)"', raw)), "logo"
        # 4) coloured text tile (last resort)
        if svg is None:
            svg, src = tile_text(t.get("color", "#5A6B7B"), t.get("abbr", t["label"])), "text"
        icons.append({
            "name": t["name"], "label": t["label"], "category": t.get("category", man.get("category", "Big Data")),
            "color": t.get("color", "#5A6B7B"), "w": 48, "h": 48,
            "tags": t.get("tags", t["label"].lower()), "style": STYLE.format(data_uri(svg)), "src": src,
        })
    out = {"meta": {"pack": pack, "source": man.get("note", ""), "generator": "scripts/build_pack.py"},
           "categoryColors": {}, "groups": [], "icons": icons}
    (ROOT / "catalog" / f"{pack}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"wrote catalog/{pack}.json ({len(icons)} icons: {dict(Counter(i['src'] for i in icons))})")


RASTER = "--raster" in sys.argv

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    for pack in args or ["bigdata"]:
        shrink_png(pack) if "--shrink-png" in sys.argv else main(pack)
