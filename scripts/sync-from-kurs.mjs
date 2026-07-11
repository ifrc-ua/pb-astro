// Копіює віджети й дані з pb-kurs (../pb-kurs, канонічний публічний дистрибутив)
// у public/. Копії комітяться в git — Vercel бачить лише цей репозиторій.
import { cpSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const kurs = path.resolve(here, "..", "..", "pb-kurs");
const pub = path.resolve(here, "..", "public");

// channel-categories на сайт не йде (редакційне рішення)
const WIDGETS = ["at-a-glance", "budget-bars", "city-heatmap", "clock-map", "cohort-river",
  "communities-projects", "digital-divide", "flows", "priorities", "rules-timeline",
  "spotlight", "vote-breadth", "votes-vs-money", "who-builds"];

rmSync(path.join(pub, "widgets"), { recursive: true, force: true });
for (const w of WIDGETS) cpSync(path.join(kurs, w), path.join(pub, "widgets", w), { recursive: true });

// Дані для сцен — ті самі перевірені копії, що їдять віджети pb-kurs
const DATA = [["priorities", "priorities.json"], ["cohort-river", "cohorts.json"],
  ["city-heatmap", "city_heatmap.json"], ["clock-map", "clock_map.json"], ["clock-map", "communities.geojson"]];
rmSync(path.join(pub, "data"), { recursive: true, force: true });
mkdirSync(path.join(pub, "data"), { recursive: true });
for (const [w, f] of DATA) cpSync(path.join(kurs, w, "data", f), path.join(pub, "data", f));
console.log("synced from pb-kurs:", WIDGETS.length, "widgets,", DATA.length, "data files");
