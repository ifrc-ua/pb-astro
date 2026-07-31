# Ten Springs of Participatory Budgeting

[UA Читати українською](README.ua.md)

A long-form data story on ten years of participatory budgeting in the
Ivano-Frankivsk urban territorial community, Ukraine: **1,565 submitted
projects**, roughly **781,000 votes**, more than **110,000 voters** across
2016–2026. No contest was held in 2022 because of the full-scale invasion.

- **Live site:** <https://pb.ifrc.org.ua>
- **First published by:** [KURS](https://kurs.if.ua/article/desyat-vesen-ivano-frankivskogo-byudzhetu-uchasti/), 11 July 2026
- **Written by:** [Nataliia Kobylchak](https://www.linkedin.com/in/nataliia-kobylchak)
- **Data and widget code:** [ifrc-ua/pb-kurs](https://github.com/ifrc-ua/pb-kurs)
- **Design system:** [ifrc-ua/pb-design](https://github.com/ifrc-ua/pb-design)

## What's inside

The article is 13 narrative blocks written in MDX. Visualisations come in two
kinds:

- **4 scroll-driven scenes** as React islands — a hex map of the city, the
  hourly pulse of voting, a river of voter cohorts, and the evolution of
  project categories. Each scene pins to the full viewport while step cards
  advance its states as you scroll. They hydrate with `client:visible`, so the
  heavy libraries never load on first paint.
- **10 embedded widgets** via `<WidgetFrame>` — self-contained static pages in
  an iframe.

`public/widgets/` holds 14 folders: the 10 embedded ones plus standalone
versions of the four visualisations whose logic was ported into React scenes for
this site. Every widget also runs on its own, outside this project.

Built with d3, deck.gl and MapLibre GL. All libraries are vendored locally — no
CDN requests.

## Licensing

This repository is mixed, so different parts carry different licenses. The full
breakdown is in [LICENSE](LICENSE).

| What | License |
| --- | --- |
| Source code | [MIT](LICENSE) |
| Aggregated data (`public/data/`, `public/widgets/*/data/`) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Article text (`src/content/article/`) | all rights reserved |
| Fonts | third-party licenses, see LICENSE |

The article text is journalism first published by KURS. It is **not** covered by
the MIT license and may not be republished without permission. Phenomena ships
here only as a self-hosted WOFF2 subset for this site's `@font-face`; download
the font separately from
[fontfabric.com](https://www.fontfabric.com/fonts/phenomena/) rather than taking
it from this repository.

## About the data

The source is every project submitted to the participatory budget between 2016
and 2026, together with the votes cast for them, as of June 2026.

Every published file is **aggregated and de-identified** — no personal data. A
k-anonymity rule applies: any cell backed by fewer than five people is
suppressed. Per-voter records only exist from 2021 onwards, so earlier campaigns
appear as per-project totals.

2022 is absent from every chart and map. Year-over-year figures across the
2021→2023 step therefore span two years instead of one, which is why values dip
there.

The full methodology lives in the "How we counted" section on the site itself.

## Running locally

Requires Node.js **22.12** or newer.

```sh
npm install
npm run dev        # dev server on localhost:4321
npm run build      # build to dist/
npm run preview    # preview the build locally
npm run smoke      # screenshots at 375 / 768 / 1440 px + touch-target checks
```

> `npm run check-numbers` cross-checks the article's figures against the
> canonical text and needs the sibling repository `../pb-kurs`. Without it the
> script exits with a note on what to clone.

## Layout

```text
src/
├── content/article/   13 article blocks (MDX)
├── scenes/            scroll-driven React scenes + shared shell
├── components/        Astro components (header, pull quotes, disclosures)
├── layouts/           page shell, meta tags
└── styles/            design-system tokens and global styles
public/
├── data/              aggregated data for the scenes
├── widgets/           14 self-contained widgets (10 embedded in the article)
└── fonts/             Phenomena WOFF2 (see licensing)
```

---

Published by Ivano-Frankivsk Regional Center, NGO · [od@ifrc.org.ua](mailto:od@ifrc.org.ua)
