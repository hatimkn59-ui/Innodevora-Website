# Clone Notes

**Target**: https://sites-template.framer.website/
**Clone method**: Faithful clone via OpenDesign web-clone skill.
**Complexity**: L3 (Framer-generated React SPA with full SSR HTML)
**Fidelity**: High – all assets (images, fonts, CSS, JS) localized; no tracking scripts; brand residues only in internal Framer search index (non-visible JSON).

## Steps performed
1. Initialized project skeleton (`init-clone.mjs`).
2. Reconned the target site with Edge (`recon-site.mjs`).
3. Harvested all assets (images, fonts, CSS) (`asset-harvest.mjs`).
4. Downloaded Framer JS runtime modules (28 preload + 13 lazy chunks).
5. Built `index.html` by rewriting all remote URLs to local `assets/` paths and removing the Framer analytics script.
6. Localized favicons and removed useless remote references (social links, preconnects, editor init).
7. Verified with `audit-clone.mjs` (no hard fidelity injuries).

## Assets
- `assets/images/` – 54 image files (SVG/PNG)
- `assets/fonts/` – 60 font files (WOFF2) + `fonts.css`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/` – 41 Framer JS modules
- `assets/css/unpkg.com/lenis-*.css` – Lenis smooth-scroll CSS (not used; kept for completeness)

## Deliverables
- `index.html` – the fully functional clone
- `NOTES.md` – this file
- `CLONE_AUDIT.md` – audit results (see above)
- `RECON/` – reconnaissance artefacts (original HTML, recon JSON, screenshots, asset manifest)

## Known limitations
- The clone relies on the Framer runtime modules; if Framer changes its CDN structure, the clone may break.
- No server-side logic (the original is pure static SPA).
- Offline use: all resources are local; open `index.html` in a browser to view.

## Next steps (optional)
- Replace brand residues in the Framer search index JSON files with your own brand.
- Swap images/content in `assets/images/` to personalize the site.
- Adjust the Favicon set if desired.
