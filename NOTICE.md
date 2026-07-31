# Notices — material not covered by the MIT license

[LICENSE](LICENSE) applies to the **source code** of this repository. It is kept
free of any additions so that automated tools detect it as MIT; everything that
carries different terms is listed here instead.

## 1. Aggregated participatory-budget data — CC BY 4.0

Files under `public/data/` and `public/widgets/*/data/` are published under the
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
license. Reuse is welcome with attribution to Ivano-Frankivsk Regional Center,
NGO. The canonical copy of the dataset lives in
[ifrc-ua/pb-kurs](https://github.com/ifrc-ua/pb-kurs).

Every published file is aggregated and de-identified. A k-anonymity rule
applies: cells backed by fewer than five people are suppressed.

## 2. Article text — all rights reserved

The editorial content under `src/content/article/`, together with the step-card
and widget copy that quotes it, was written by
[Nataliia Kobylchak](https://www.linkedin.com/in/nataliia-kobylchak) and first
published by the online media [KURS](https://kurs.if.ua/article/desyat-vesen-ivano-frankivskogo-byudzhetu-uchasti/)
on 11 July 2026.

This text is journalism, not software. It is **not** covered by the MIT license
and may not be republished, translated or adapted without permission.

## 3. Fonts — third-party licenses

**Phenomena** — `public/fonts/`, `public/widgets/*/fonts/`. Free for personal
and commercial use under the Fontfabric Free Fonts EULA. It ships here only as a
self-hosted WOFF2 subset so that this site can reference it from `@font-face`.
The EULA does not permit redistribution of the font files as fonts: to use
Phenomena in your own work, download it from
[fontfabric.com](https://www.fontfabric.com/fonts/phenomena/).

**Inter** — SIL Open Font License 1.1. See [rsms/inter](https://github.com/rsms/inter).

**Proxima Nova** is deliberately absent. The design system specifies it for print
and local renders only; its webfont license is a separate paid product, so every
web surface resolves that token to Inter instead.

## 4. Bundled third-party libraries — their own licenses

Files under `public/widgets/*/lib/` are vendored copies, distributed under their
respective upstream licenses:

| Library | License |
| --- | --- |
| [d3](https://github.com/d3/d3) (incl. d3-sankey) | ISC |
| [deck.gl](https://github.com/visgl/deck.gl) | MIT |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | BSD-3-Clause |
| [h3-js](https://github.com/uber/h3-js) | Apache-2.0 |

Consult each project for the authoritative text; the table is a convenience
summary, not a substitute.
