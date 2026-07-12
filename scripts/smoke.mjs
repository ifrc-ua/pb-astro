// Смоук-скріншоти сторінки на ключових ширинах + перевірка горизонтального скролу
// й розміру тач-цілей. База для всіх наступних візуальних перевірок вікна C.
// Запуск: спершу `npm run preview`, тоді `node scripts/smoke.mjs`.
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "..", "_smoke");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE || "http://localhost:4321";
const WIDTHS = [375, 768, 1440];

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
let bad = 0;

for (const w of WIDTHS) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
  await page.goto(BASE + "/", { waitUntil: "networkidle0", timeout: 45000 });

  // прокрутити, щоб lazy-контент піднявся
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 100)); }
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 4500));

  // горизонтальний скрол?
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // найменша «кнопкова» тач-ціль (правило ≥44px, design.md §8).
  // Інлайн-лінки в прозі мають окреме правило (line-height+паддінг), тож виключені.
  const minTap = await page.evaluate(() => {
    const sel = "button, summary, [role=button], a";
    const isInlineProse = (el) => el.tagName === "A" && el.closest(".prose p, .pb-box__body");
    let min = Infinity, worst = "";
    for (const el of document.querySelectorAll(sel)) {
      if (isInlineProse(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // приховані
      const s = Math.min(r.width, r.height);
      if (s < min) { min = s; worst = (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30); }
    }
    return { min: Math.round(min), worst };
  });

  // fullPage може впасти на дуже високих сторінках (ліміт канви Chromium) —
  // тоді знімаємо перший екран, перевірки скролу/тачу від цього не залежать.
  try {
    await page.screenshot({ path: path.join(OUT, `page-${w}.png`), fullPage: true });
  } catch {
    await page.screenshot({ path: path.join(OUT, `page-${w}-top.png`) });
    console.log(`   (fullPage screenshot для ${w} завеликий — знято перший екран)`);
  }

  const hOk = overflow <= 1;
  // тач-ціль критична лише на мобільному (375)
  const tapOk = w > 599 || minTap.min >= 44;
  if (!hOk || !tapOk) bad++;
  console.log(`${hOk && tapOk ? "OK " : "FAIL"} w=${w}  h-overflow=${overflow}px  min-tap=${minTap.min}px${w<=599?` (${minTap.worst})`:""}`);
  await page.close();
}

await browser.close();
console.log(bad ? "\n=== Є ПРОБЛЕМИ ===" : `\n=== ${WIDTHS.length} ширин: без гор. скролу, тач-цілі ≥44px на 375 ===`);
process.exit(bad ? 1 : 0);
