# 6a17d9b7-46d5-477c-94f9-6fb8d4bb14e5 implementation handoff

This archive is the source of truth for turning the design into production code. Start from `index.html`, then preserve the visual system, responsive behavior, and interactions found in the exported files.

## Implementation target
- Build production UI from the exported design, not a loose reinterpretation.
- Preserve typography scale, spacing rhythm, color tokens, border radii, shadows, motion timing, and component states.
- Replace static placeholders only when the target app has real data or functional equivalents.
- Keep generated product UI free of OpenDesign chrome, preview labels, or design-process annotations.
- Treat this handoff as a visual contract: if implementation choices conflict, match the exported pixels and behavior first, then refactor internals.

## Source map
- Primary entry: `index.html`
- HTML screens detected: 2
- Stylesheets detected: 2
- Script/component files detected: 38
- Supporting assets detected: 185

## Responsive contract
Validate the implementation across this 2025–2026 viewport matrix:
- Mobile compact: 360×800
- Mobile standard: 390×844
- Mobile large: 430×932
- Foldable / small tablet: 600×960
- Tablet portrait: 820×1180
- Tablet landscape: 1024×768
- Laptop: 1366×768
- Desktop: 1440×900
- Wide desktop: 1920×1080

For responsive web exports, treat these as a modern breakpoint system for one adaptive web experience, not three fixed screenshots. Do not split responsive web into unrelated native app screens unless the project explicitly includes native targets. Use semantic layout thresholds, fluid `clamp()` type/spacing, and container queries where component width matters more than viewport width. Preserve any CSS media queries, container queries, fluid `clamp()` scales, and layout changes already present in the exported files.

## Design fidelity contract
- Extract reusable tokens before writing components: background, surface, foreground, muted text, border, accent, radius, shadow, spacing, type scale, and motion duration/easing.
- Map product screens, in-app modules/components, optional landing page, and optional OS widget surfaces before coding. Keep these surfaces separate in the target architecture.
- Match layout geometry: max-widths, gutters, grid columns, card proportions, sticky/fixed elements, and viewport-specific navigation.
- Preserve real copy, labels, and data shown in the export. Do not replace specific text with generic marketing filler.
- Preserve interactive affordances: hover, focus, pressed, disabled, loading, validation, copy/share, tab/accordion, modal/sheet, and keyboard states where present.
- Preserve accessibility semantics when converting: headings stay hierarchical, controls remain buttons/links/inputs, focus states stay visible.
- Do not keep prototype-only annotations, frame labels, or OpenDesign chrome in the production UI.

## CJX-ready UX contract
- Use `DESIGN-MANIFEST.json` as the machine-readable map for screens, app modules, OS widgets, landing pages, tokens, interactions, and viewport checks.
- Screen-file-first: when multiple user-facing surfaces exist, implement each HTML screen as its own route/file. Treat `index.html` as a launcher/overview when the manifest marks it that way, not as a combined final UI.
- If `landing.html`, app screens, platform screens, or OS widget files exist, preserve those boundaries in the target app instead of merging them into one page.
- A single self-contained `index.html` is acceptable only when the export truly contains one user-facing screen and its CSS/JS are structured enough to extract tokens, components, states, and behavior.
- If separate `css/` or `js/` files exist, treat them as source of truth for token/component/interactions before porting to React, Vue, SwiftUI, Compose, or another target stack.
- In-app modules/components are product UI blocks inside the app. OS widgets are home-screen/lock-screen/quick-access surfaces outside the app. Do not merge those concepts.

## Color and brand contract
- Use the exported design tokens and product/domain context as the color source of truth.
- Do not introduce warm beige / cream / peach / pink / orange-brown background washes unless they are already explicit brand/reference colors in the export.
- A stylesheet or design/token file was detected; inspect it for canonical color variables before choosing framework theme tokens.

## Implementation sequence for AI coding tools
1. Open `index.html` and `DESIGN-MANIFEST.json`; identify every screen file, launcher/overview file, app module, and interaction before coding.
2. If multiple HTML screens exist, map them to separate routes/surfaces first; do not merge `landing.html`, product app screens, platform screens, or OS widgets into one route.
3. Extract a token table from CSS/root styles and inline styles before building framework components.
4. Build product screens and domain-specific in-app modules from largest layout regions down to controls; avoid starting with isolated atoms that lose spatial intent.
5. Port responsive behavior across the modern viewport matrix and test each semantic breakpoint before cleanup.
6. Port interactions and states, then replace static placeholders only with real app data or functional equivalents.
7. Keep optional landing page and OS widget surfaces as separate surfaces if present.
8. Compare final screenshots against the export at 360×800, 390×844, 430×932, 820×1180, 1024×768, 1366×768, 1440×900, and 1920×1080 before declaring done.

## Entry points
- `index.html`
- `RECON/original.html`

## Styles
- `assets/css/unpkg.com/lenis-8c49389c49.css`
- `assets/fonts/fonts.css`

## Scripts/components
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/8nHIglZ7GHjjiTcTwO8WeIk-pzO0XPYG9Tf3vjyEqqk.BVsgVEBo.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/augiA20Il.CzFmM2nr.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/f5jLThsZZ.Cw5S5Vs1.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/framer.B8sD0cWN.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/gWJA9AyzxhHpke4Ofld3XMT_4liPeytMe0Wx6Neufzc.CYepMphm.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/Ib9O_e84j.yW2IIdqW.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/IBczn6mY0WxM4CuWcdz0pwr9BSawxLDV8KHxVx2Aocg.Cqj7TM_m.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/iPBKuJam4.BKnJeOfs.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/JmHAYutT3.BZefU5lA.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/k1TgfEwQE.DM-6TAkZ.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/krId0kp8JVeCQ-paNJOC4qFfij2jeYnX1fO25X2lwMY.Bz9focMO.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/Lenis.ZM5G8cc1.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/LgSixTWsq.CrPtZQ2A.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/MOm7HQavEOnuQS_gLKMPZe0AAqoblXQs0emIzJxOuvU.DE37DWzA.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/motion.Ct0KaNkv.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/NdemCYkjw.Bl_hk7aS.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/OEdpwaUKz-jXlMI9rxo8oODuDJbxEQ7K8-Xncqu6JcU.HnmzukFE.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/oZLeJDMoe.BMWi7SB9.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/pEKR3Kp3c_k1sAQq2u5uWFU9mw6v9MuWFvaeoxgMgjo.C2xjo82j.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/PX9hIOIVM.Bz85GG8j.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/Q8buDk4wwGXTcrG_UUbQW5rxzWAXm5KDmbM7WR-up9Q.Cb0GzKHq.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/react.CGG9stYK.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/rH6FkpqMK.DwitgkLc.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/rJZ5KJfrk.U2ifrvRk.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/rolldown-runtime.uxh0A31G.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/S8x4PPOu16wyoPBZjdgOBSs82JMTYa64_7LnMT1PrcM.vGQWAK6o.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/script_main.DmsoPMe1.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/shared-lib.Lfm_5jms.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/siteMetadata.CPHH1qzD.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/sLEXEPYEr.DsYv4RB8.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/tLOFjvMmOz4g2ERUXCH6Bd3DGF6tt1Hl5pZkvYQ74H8.BW2Sjr7R.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/vhTY5iVxG.DnLzZl4e.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/VY_Azz3qy.CUrcx51y.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/Wn4ze0qT5.D7W5GPPK.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/X27YG-a-gJcODB6fl3zHi8xLnYCwjyRCfabLQe12GUU.Bds14E36.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/XBFsLKSOb6TbnWnNClOi_Z6DzXt5gMsIkaJOQd2BX2c.CfgzbsFD.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/Z0QPvnfKS.DIv1lpb1.mjs`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/zbblNcCzF.nNxNxeFH.mjs`

## Assets and supporting files
- `assets/fonts/fonts.gstatic.com/jizBRFtNs2ka5fXjeivQ4LroWlx-6zsTjmbI-73b57d1238.woff2`
- `assets/fonts/fonts.gstatic.com/jizBRFtNs2ka5fXjeivQ4LroWlx-6zUTjg-d65c264453.woff2`
- `assets/fonts/fonts.gstatic.com/vEF02_tTDB4M7-auWDN0ahZJW1ge6NmXpVAHV83Bfb_US2D2QYxoUKIkn98pdF9dDs4DrjXEXw-9b791bbb3d.woff2`
- `assets/fonts/fonts.gstatic.com/vEF02_tTDB4M7-auWDN0ahZJW1ge6NmXpVAHV83Bfb_US2D2QYxoUKIkn98poVhdDs4DrjXEXw-2a89923d81.woff2`
- `assets/fonts/fonts.gstatic.com/vEFy2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6OAVIJmeUDygwjiiVqrhlXD-wGvjU-0a04e6c7c6.woff2`
- `assets/fonts/fonts.gstatic.com/vEFy2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6OAVIJmeUDygwjivBtrhlXD-wGvjU-d5b4180092.woff2`
- `assets/fonts/framerusercontent.com/0E7IMbDzcGABpBwwqNEt60wU0w-2ffdfaac69.woff2`
- `assets/fonts/framerusercontent.com/1K3W8DizY3v4emK8Mb08YHxTbs-be91894f01.woff2`
- `assets/fonts/framerusercontent.com/2A4Xx7CngadFGlVV4xrO06OBHY-be47bff5d1.woff2`
- `assets/fonts/framerusercontent.com/43sJ6MfOPh1LCJt46OvyDuSbA6o-8e7d41d947.woff2`
- `assets/fonts/framerusercontent.com/4RAEQdEOrcnDkhHiiCbJOw92Lk-3be39f5de4.woff2`
- `assets/fonts/framerusercontent.com/5A3Ce6C9YYmCjpQx9M4inSaKU-94357736ab.woff2`
- `assets/fonts/framerusercontent.com/5vvr9Vy74if2I6bQbJvbw7SY1pQ-197dd74378.woff2`
- `assets/fonts/framerusercontent.com/6FI2EneKzM3qBy5foOZXey7coCA-88e3ebffd7.woff2`
- `assets/fonts/framerusercontent.com/6mJuEAguuIuMog10gGvH5d3cl8-d672e61ee3.woff2`
- `assets/fonts/framerusercontent.com/867QObYax8ANsfX4TGEVU9YiCM-1a94ddb4e1.woff2`
- `assets/fonts/framerusercontent.com/A0Wcc7NgXMjUuFdquHDrIZpzZw0-619644a6a4.woff2`
- `assets/fonts/framerusercontent.com/b6Y37FthZeALduNqHicBT6FutY-22b5f26fb6.woff2`
- `assets/fonts/framerusercontent.com/b8ezwLrN7h2AUoPEENcsTMVJ0-47619b8422.woff2`
- `assets/fonts/framerusercontent.com/Bo5CNzBv77CafbxOtKIkpw9egw-7d69d70e3f.woff2`
- `assets/fonts/framerusercontent.com/cdAe8hgZ1cMyLu9g005pAW3xMo-b3ddf3f2cc.woff2`
- `assets/fonts/framerusercontent.com/CfMzU8w2e7tHgF4T4rATMPuWosA-fb0edde261.woff2`
- `assets/fonts/framerusercontent.com/cRJyLNuTJR5jbyKzGi33wU9cqIQ-44c62d91b0.woff2`
- `assets/fonts/framerusercontent.com/DOfvtmE1UplCq161m6Hj8CSQYg-90f4958b2f.woff2`
- `assets/fonts/framerusercontent.com/DolVirEGb34pEXEp8t8FQBSK4-0c3a17ff05.woff2`
- `assets/fonts/framerusercontent.com/DpPBYI0sL4fYLgAkX8KXOPVt7c-9f76c3a5f7.woff2`
- `assets/fonts/framerusercontent.com/EOr0mi4hNtlgWNn9if640EZzXCo-f3fd018548.woff2`
- `assets/fonts/framerusercontent.com/GIryZETIX4IFypco5pYZONKhJIo-bcff39a6db.woff2`
- `assets/fonts/framerusercontent.com/GrgcKwrN6d3Uz8EwcLHZxwEfC4-d2835f64ba.woff2`
- `assets/fonts/framerusercontent.com/H89BbHkbHDzlxZzxi8uPzTsp90-e1fb1f6952.woff2`
- `assets/fonts/framerusercontent.com/hyOgCu0Xnghbimh0pE8QTvtt2AU-58bbd52279.woff2`
- `assets/fonts/framerusercontent.com/ia3uin3hQWqDrVloC1zEtYHWw-7342a84724.woff2`
- `assets/fonts/framerusercontent.com/JEXmejW8mXOYMtt0hyRg811kHac-c2bfacca7c.woff2`
- `assets/fonts/framerusercontent.com/JeYwfuaPfZHQhEG8U5gtPDZ7WQ-418c934c00.woff2`
- `assets/fonts/framerusercontent.com/khkJkwSL66WFg8SX6Wa726c-99b8d9182f.woff2`
- `assets/fonts/framerusercontent.com/lEJLP4R0yuCaMCjSXYHtJw72M-a8071e6b98.woff2`
- `assets/fonts/framerusercontent.com/mvNEIBLyHbscgHtwfsByjXUz3XY-0af6cca038.woff2`
- `assets/fonts/framerusercontent.com/NeGmSOXrPBfEFIy5YZeHq17LEDA-dbba5ba05c.woff2`
- `assets/fonts/framerusercontent.com/NTJ0nQgIF0gcDelS14zQ9NR9Q-48ac864786.woff2`
- `assets/fonts/framerusercontent.com/otTaNuNpVK4RbdlT7zDDdKvQBA-c95a827796.woff2`
- `assets/fonts/framerusercontent.com/oYaAX5himiTPYuN8vLWnqBbfD2s-8a68bceee1.woff2`
- `assets/fonts/framerusercontent.com/Oyn2ZbENFdnW7mt2Lzjk1h9Zb9k-4bca00b775.woff2`
- `assets/fonts/framerusercontent.com/OYrD2tBIBPvoJXiIHnLoOXnY9M-ea808fe7d6.woff2`
- `assets/fonts/framerusercontent.com/pKRFNWFoZl77qYCAIp84lN1h944-c55f5a8ab7.woff2`
- `assets/fonts/framerusercontent.com/QrcNhgEPfRl0LS8qz5Ln8olanl8-e1611c945a.woff2`
- `assets/fonts/framerusercontent.com/Qx95Xyt0Ka3SGhinnbXIGpEIyP4-96126f2d71.woff2`
- `assets/fonts/framerusercontent.com/syRNPWzAMIrcJ3wIlPIP43KjQs-452fe1601f.woff2`
- `assets/fonts/framerusercontent.com/tKtBcDnBMevsEEJKdNGhhkLzYo-3fa31eded4.woff2`
- `assets/fonts/framerusercontent.com/tUSCtfYVM1I1IchuyCwz9gDdQ-974fd13b31.woff2`
- `assets/fonts/framerusercontent.com/u6gJwDuwB143kpNK1T1MDKDWkMc-bba4fadd8b.woff2`
- `assets/fonts/framerusercontent.com/UjlFhCnUjxhNfep4oYBPqnEssyo-2ba1c0d544.woff2`
- `assets/fonts/framerusercontent.com/uy9s0iWuxiNnVt8EpTI3gzohpwo-bd8884f7e7.woff2`
- `assets/fonts/framerusercontent.com/VgYFWiwsAC5OYxAycRXXvhze58-b6c8387871.woff2`
- `assets/fonts/framerusercontent.com/vxBnBhH8768IFAXAb4Qf6wQHKs-45d9a97649.woff2`
- `assets/fonts/framerusercontent.com/wccHG0r4gBDAIRhfHiOlq6oEkqw-7b05451fe6.woff2`
- `assets/fonts/framerusercontent.com/WZ367JPwf9bRW6LdTHN8rXgSjw-78f4b8011b.woff2`
- `assets/fonts/framerusercontent.com/xYYWaj7wCU5zSQH0eXvSaS19wo-af51674aa2.woff2`
- `assets/fonts/framerusercontent.com/Y9k9QrlZAqio88Klkmbd8VoMQc-bb12e146ca.woff2`
- `assets/fonts/framerusercontent.com/yDtI2UI8XcEg1W2je9XPN3Noo-a113a1cb4f.woff2`
- `assets/fonts/framerusercontent.com/zSsEuoJdh8mcFVk976C05ZfQr8-05aecd81f0.woff2`
- `assets/images/favicon/apple.png`
- `assets/images/favicon/dark.png`
- `assets/images/favicon/light.png`
- `assets/images/framerusercontent.com/73s5DSdm8QHabEG68ef0Y2Eo23o-347be65646.svg`
- `assets/images/framerusercontent.com/BD3UbLIT0Kmd7BbzZQMynPdvVg-3a8b3291cc.png`
- `assets/images/framerusercontent.com/BD3UbLIT0Kmd7BbzZQMynPdvVg-edd3f5bf73.png`
- `assets/images/framerusercontent.com/CC3fn8C8Rd0JtyUKvgeBcUsMmgI-5372873359.png`
- `assets/images/framerusercontent.com/CC3fn8C8Rd0JtyUKvgeBcUsMmgI-c72354eda4.png`
- `assets/images/framerusercontent.com/CIQtmri3er9rB6tbNJBSgPDVh8-26b1d31207.png`
- `assets/images/framerusercontent.com/CIQtmri3er9rB6tbNJBSgPDVh8-9cbf46534b.png`
- `assets/images/framerusercontent.com/dtAAgj9QR9nXVHwJTUkojVqsNw-cde9287695.png`
- `assets/images/framerusercontent.com/f3nJvQTWnMDvDpV4lzM80xLnp8E-73a92a624c.png`
- `assets/images/framerusercontent.com/G2Qq7EjD6iiXD7oB62LTuBdU5d0-4b330ef082.png`
- `assets/images/framerusercontent.com/G2Qq7EjD6iiXD7oB62LTuBdU5d0-77c9663538.png`
- `assets/images/framerusercontent.com/G2Qq7EjD6iiXD7oB62LTuBdU5d0-7d881f18a4.png`
- `assets/images/framerusercontent.com/G2Qq7EjD6iiXD7oB62LTuBdU5d0-88800745a0.png`
- `assets/images/framerusercontent.com/GG0Av5lcJBJTSrfce2Qv3LniA-89a9873b5b.png`
- `assets/images/framerusercontent.com/Ggxj3sY0v3q2au2M31nUcjW3iSY-6be10b7873.png`
- `assets/images/framerusercontent.com/Ggxj3sY0v3q2au2M31nUcjW3iSY-a4b9d64bb9.png`
- `assets/images/framerusercontent.com/hoDF9ejwzx07eK7xWkXnwmIDEU-a146ac706c.png`
- `assets/images/framerusercontent.com/hoDF9ejwzx07eK7xWkXnwmIDEU-f547c749e1.png`
- `assets/images/framerusercontent.com/iaPx1kxp4nAwpKPpRasCCPtXgA4-00d70ce7b1.png`
- `assets/images/framerusercontent.com/iaPx1kxp4nAwpKPpRasCCPtXgA4-abfa51ac39.png`
- `assets/images/framerusercontent.com/ijcxfak4xA4RW6fUCYYa2lkDTsM-cd456b6a94.png`
- `assets/images/framerusercontent.com/JlDXENiOI61DgwGqUl1zABgEo-6fff642282.png`
- `assets/images/framerusercontent.com/jOp8UDm8NJHGcSxwzQQArcmPqk-4776c0740e.png`
- `assets/images/framerusercontent.com/K9MFFuqZqUuvVyc9ap8gwulO0s-a7a93201b6.png`
- `assets/images/framerusercontent.com/LD9dTtdRPvIs1mkTvhGUrPVZ6qI-42446eb2e1.png`
- `assets/images/framerusercontent.com/lP356xsiELuKcDpIVaJpJD9ohg-44a7e367db.svg`
- `assets/images/framerusercontent.com/lrNoeOIer7HnVjhbDJ34RlcwM-5639d12b8f.png`
- `assets/images/framerusercontent.com/lrNoeOIer7HnVjhbDJ34RlcwM-e43b81f770.png`
- `assets/images/framerusercontent.com/N1KauAPPSjqZz8hGrXh914kem1A-8b3d751316.png`
- `assets/images/framerusercontent.com/N1KauAPPSjqZz8hGrXh914kem1A-a500b8df68.png`
- `assets/images/framerusercontent.com/N6EoV39lGWPCfgThZTqBWL9bHM-e27b9f3afd.png`
- `assets/images/framerusercontent.com/N6EoV39lGWPCfgThZTqBWL9bHM-e2dc32235b.png`
- `assets/images/framerusercontent.com/nAitNTlINg6db8qIN26E2deUs-9827b33d2c.png`
- `assets/images/framerusercontent.com/O5ZuKxyLd9lsMCXiGZsp70y38OQ-2d630b2971.png`
- `assets/images/framerusercontent.com/O5ZuKxyLd9lsMCXiGZsp70y38OQ-4129bca7b4.png`
- `assets/images/framerusercontent.com/ob0tkTKPO3Lgfaku6pcDfnBlzw-99bd547e6e.png`
- `assets/images/framerusercontent.com/Qr0xNT99FkmZd7og4RaWrW3DTKA-f137bcde97.png`
- `assets/images/framerusercontent.com/qXW4zrFfGSQSeteK4BBpGxuE6rs-6e9a6814ee.png`
- `assets/images/framerusercontent.com/tS95hiDbjsMEKgy6haf49K3W70-ac14c7dc71.png`
- `assets/images/framerusercontent.com/uMwa2jbDUK8tJIWOZf2E45c7M-a64f19d5bc.png`
- `assets/images/framerusercontent.com/uMwa2jbDUK8tJIWOZf2E45c7M-cb4a90b0eb.png`
- `assets/images/framerusercontent.com/VPe4OEa0TtaKO7eOA9tNFax7k-36880093e7.png`
- `assets/images/framerusercontent.com/WaPglTBd48tVPI9reeP02zQga0-91c2897a10.svg`
- `assets/images/framerusercontent.com/ye17EMIMaOdtSKAd5W1sDlhDwg-6b559348df.png`
- `assets/images/framerusercontent.com/ye17EMIMaOdtSKAd5W1sDlhDwg-fe58b9b737.png`
- `assets/images/framerusercontent.com/YIkrKx50u0dydme9Bw2iK7W20o-30a54b5adb.png`
- `assets/images/framerusercontent.com/z19mTh67d1jJYusPnvtG58fv3M-3c0fae95fc.png`
- `assets/images/framerusercontent.com/z19mTh67d1jJYusPnvtG58fv3M-c519559962.png`
- `assets/images/svg--20e34f68a4.bin`
- `assets/images/svg--2c5a50f1b3.bin`
- `assets/images/svg--6eeea6be66.bin`
- `assets/images/svg--8b4c179050.bin`
- `assets/images/svg--d63e7fd857.bin`
- `assets/images/svg--d7983c8bea.bin`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/searchIndex-Bf6FNrOXyV5J.json`
- `assets/js/framerusercontent/sites/38UUnKPstCvsIOUTUjqT9c/searchIndex-UuJnSM6GTz1a.json`
- `CLONE_AUDIT.md`
- `NOTES.md`
- `RECON/asset-manifest.json`
- `RECON/clone-interactions.json`
- `RECON/clone-interactions.md`
- `RECON/clone-recon.json`
- `RECON/clone-route-map.json`
- `RECON/clone-route-map.md`
- `RECON/clone-summary.md`
- `RECON/img-map.json`
- `RECON/js-urls.txt`
- `RECON/original-recon.json`
- `RECON/original-summary.md`
- `RECON/screenshots/00-initial.png`
- `RECON/screenshots/01-scroll-middle-b04a45f075.png`
- `RECON/screenshots/02-scroll-bottom-7297e0cbea.png`
- `RECON/screenshots/03-hover-div-nth-of-type-1-div-nth-of-type-1-div-nth-of-type-1-div-nth-of-type-1-div-nth-of-t-071d92e807.png`
- `RECON/screenshots/04-hover--English-f770d7b7ae.png`
- `RECON/screenshots/05-hover-Accueil-fbd07ed3df.png`
- `RECON/screenshots/06-hover--propos-0d61844d8e.png`
- `RECON/screenshots/07-hover-Services-db9a1102a2.png`
- `RECON/screenshots/08-hover--tudes-de-cas-6a70b7e44e.png`
- `RECON/screenshots/09-hover-Contact-77b61454ba.png`
- `RECON/screenshots/10-hover-Menu-Fermer-a9bb4641a4.png`
- `RECON/screenshots/11-click-div-nth-of-type-1-div-nth-of-type-1-div-nth-of-type-1-div-nth-of-type-1-div-nth-of-t-16ff9aaf5b.png`
- `RECON/screenshots/12-click--English-d34140c39f.png`
- `RECON/screenshots/127.0.0.1-22-22-0c5e317d.png`
- `RECON/screenshots/127.0.0.1-22-a-propos-22-eb10e114.png`
- `RECON/screenshots/127.0.0.1-22-blog-22-afaaeb31.png`
- `RECON/screenshots/127.0.0.1-22-cdn-cgi-l-email-protection-22-76081461.png`
- `RECON/screenshots/127.0.0.1-22-cdn-cgi-l-email-protection-9937c0c7.png`
- `RECON/screenshots/127.0.0.1-22-contactez-nous-22-3e5f6c18.png`
- `RECON/screenshots/127.0.0.1-22-en-22-3d72af7b.png`
- `RECON/screenshots/127.0.0.1-22-etudes-de-cas-22-ea97ddf2.png`
- `RECON/screenshots/127.0.0.1-22-etudes-de-cas-refonte-et-redesign-de-site-web-de-bi-newvision-22-3411e524.png`
- `RECON/screenshots/127.0.0.1-22-faq-22-94ff1b36.png`
- `RECON/screenshots/127.0.0.1-22-mentions-legales-22-c9d3c0d5.png`
- `RECON/screenshots/127.0.0.1-22-politique-de-confidentialite-22-094c831d.png`
- `RECON/screenshots/127.0.0.1-22-services-22-8d6e1cd0.png`
- `RECON/screenshots/127.0.0.1-22https-web.facebook.com-grandecharteco-22-95eeef0e.png`
- `RECON/screenshots/127.0.0.1-22https-www.instagram.com-grandecharteco-22-f1539197.png`
- `RECON/screenshots/127.0.0.1-22https-www.linkedin.com-company-grandecharteco-about-22-7872dd44.png`
- `RECON/screenshots/127.0.0.1-22https-x.com-grandecharteco-22-ac9aec61.png`
- `RECON/screenshots/127.0.0.1-f0313c92.png`
- `RECON/screenshots/13-click-Accueil-adeb8d206c.png`
- `RECON/screenshots/14-click--propos-a2fecf2d51.png`
- `RECON/screenshots/15-click-Services-13c273adf6.png`
- `RECON/screenshots/16-click--tudes-de-cas-711efae0ce.png`
- `RECON/screenshots/17-click-Contact-3e6d8ef533.png`
- `RECON/screenshots/18-click-Menu-Fermer-84502192d7.png`
- `RECON/screenshots/19-click-Get-Connected-fedd428ce8.png`
- `RECON/screenshots/20-click-Learn-More-629b23a3ac.png`
- `RECON/screenshots/21-click-div-nth-of-type-1-div-nth-of-type-3-div-nth-of-type-1-div-nth-of-type-1-div-nth-of-t-c2a94bee3e.png`
- `RECON/screenshots/22-click-Voir-plus-7a43d66998.png`
- `RECON/screenshots/23-canvas-drag-div-nth-of-type-1-div-nth-of-type-1-div-nth-of-type-1-div-nth-of-type-1-div-nt-20ac9d1b42.png`
- `RECON/screenshots/24-canvas-drag-div-nth-of-type-1-div-nth-of-type-1-div-nth-of-type-1-div-nth-of-type-1-div-nt-8797ca08a4.png`
- `RECON/screenshots/25-canvas-drag-div-nth-of-type-2-div-nth-of-type-1-div-nth-of-type-1-div-nth-of-type-1-div-nt-e522c41956.png`
- `RECON/screenshots/26-canvas-drag-div-nth-of-type-1-div-nth-of-type-2-div-nth-of-type-1-div-nth-of-type-1-div-nt-00286b09ba.png`
- `RECON/screenshots/clone-1440.png`
- `RECON/screenshots/clone-390.png`
- `RECON/screenshots/clone-768.png`
- `RECON/screenshots/original-1440.png`
- `RECON/screenshots/original-390.png`
- `RECON/screenshots/original-768.png`
- `scripts/build-clone.py`
- `server.log`

## Coding checklist for AI tools
1. Inspect `index.html` and `DESIGN-MANIFEST.json` first and identify reusable components before coding.
2. Implement each user-facing screen file as its own route/surface; keep launcher, landing, app, platform, and OS widget files separate.
3. Extract design tokens into the target stack: colors, type scale, spacing, radius, shadows, and motion.
4. Implement layout with real 2025–2026 responsive breakpoints, fluid type/spacing, and container-query-aware component behavior; test with no horizontal overflow.
5. Preserve interactive controls, hover/focus/pressed states, form behavior, validation, and copy actions where present.
6. Implement domain-specific in-app modules with real states; do not flatten them into generic cards.
7. Keep landing page, product screens, and OS widget/quick-access surfaces separate when present.
8. Confirm the production result visually matches the exported design before refactoring internals.
9. Reject implementation shortcuts that flatten the design into generic cards, generic gradients, placeholder stats, or framework-default typography.
10. If a detail is ambiguous, keep the exported HTML/CSS/JS behavior rather than inventing a new pattern.
