// Звірка чисел: усі числові токени тексту статті на сайті (MDX-блоки) проти
// канону pb-kurs/content.md. Допоміжний інструмент — фінальне слово за вичиткою.
//
// Витягуємо числові токени (цілі з роздільником-тисяч, десяткові з комою,
// відсотки, роки), нормалізуємо пробіли й порівнюємо мультимножини.
// Розбіжності друкуємо списком. Код виходу 1, якщо мультимножини не збігаються.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const KURS = path.resolve(here, "..", "..", "pb-kurs", "content.md");
const MDX_DIR = path.resolve(here, "..", "src", "content", "article");

// Число: одна+ цифра, далі групи «роздільник + цифри» (пробіл/nbsp/кома/крапка),
// опційний хвіст «%». En-dash між роками ловиться як два окремі числа — це нормально.
const NUM = /\d[\d  .,]*\d%?|\d%?/g;

function tokens(text) {
  const found = text.match(NUM) || [];
  const m = new Map();
  for (let t of found) {
    // Нормалізація: nbsp→пробіл (роздільник тисяч), тримаємо кому як десятковий роздільник.
    t = t.replace(/ /g, " ").trim();
    // Відкидаємо порожнє й самотні роздільники
    if (!/\d/.test(t)) continue;
    m.set(t, (m.get(t) || 0) + 1);
  }
  return m;
}

// Канон: беремо тільки прозу (числа в тексті), як єдиний рядок.
const canon = tokens(readFileSync(KURS, "utf8").replace(/\r\n/g, "\n"));

// MDX: усі блоки; знімаємо рядки-імпорти й JSX-мітки віджетів, щоб не рахувати
// службові токени (шляхи компонентів чисел не містять, але про всяк випадок).
let mdxText = "";
for (const f of readdirSync(MDX_DIR).filter((f) => f.endsWith(".mdx")).sort()) {
  let s = readFileSync(path.join(MDX_DIR, f), "utf8").replace(/\r\n/g, "\n");
  s = s.replace(/^import .*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  mdxText += s + "\n";
}
const mdx = tokens(mdxText);

// Порівняння мультимножин в обидва боки.
const keys = new Set([...canon.keys(), ...mdx.keys()]);
const missing = []; // є в каноні, бракує/менше в MDX
const extra = [];   // є в MDX, нема/більше в каноні
for (const k of [...keys].sort()) {
  const c = canon.get(k) || 0;
  const m = mdx.get(k) || 0;
  if (m < c) missing.push(`  «${k}» — у каноні ${c}, у MDX ${m}`);
  if (m > c) extra.push(`  «${k}» — у MDX ${m}, у каноні ${c}`);
}

if (!missing.length && !extra.length) {
  console.log("OK, розбіжностей немає (числа MDX = каноні).");
  process.exit(0);
}
if (missing.length) {
  console.log("НЕ ВИСТАЧАЄ в MDX (є в каноні):");
  missing.forEach((l) => console.log(l));
}
if (extra.length) {
  console.log("ЗАЙВЕ в MDX (нема/менше в каноні):");
  extra.forEach((l) => console.log(l));
}
console.log("\nПримітка: числа hero (Hero.astro) і майбутніх сцен у каноні можуть бути в іншій формі — це очікувані винятки, звіряються вичиткою.");
process.exit(1);
