// Сцена «Що виграє»: скрол-керований streamgraph категорій 2016–2026.
// Порт рендера віджета «Еволюція пріоритетів» (pb-kurs/priorities/app.js):
// підготовка даних 1:1, d3 з npm; віджетні контроли прибрані — станами
// керує скрол-драйвер (SceneShell), тултипи збережені. Режим фіксований:
// «проєкти» (подання). Рік 2022 не має слота на осі — лише шов-пунктир.
import { useCallback, useEffect, useRef } from "react";
import * as d3 from "d3";
import { SceneShell } from "./SceneShell";

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2023, 2024, 2025, 2026];

// Категорійні кольори — канон design-data.md §4 (ifrc-ua/pb-design)
const CATS = [
  { key: "education-general", label: "Освіта", color: "#654EA3" },
  { key: "education-school", label: "Шкільні", color: "#4A2D87" },
  { key: "education-preschool", label: "Дошкільні", color: "#7B66B8" },
  { key: "education-extracurricular", label: "Позашкільні, профтехосвіта", color: "#9E5FAB" },
  { key: "improvement-general", label: "Благоустрій", color: "#2D6BAB" },
  { key: "improvement-streets", label: "Благоустрій малих вулиць", color: "#1A4F82" },
  { key: "heritage", label: "Архітектурна спадщина", color: "#A0571F" },
  { key: "greenery", label: "Зелені проєкти", color: "#3D7C3F" },
  { key: "afu-support", label: "Допомога ЗСУ", color: "#3F4049" },
  { key: "accessibility", label: "Доступність", color: "#0E7C8C" },
  { key: "other", label: "Інші проєкти", color: "#71737E" },
  { key: "uncategorized", label: "Без категоризації", color: "#CACAD1" },
];
const CAT_BY_KEY = new Map(CATS.map((c) => [c.key, c]));
const CAT_KEYS = CATS.map((c) => c.key);

// Віхи над графіком (порт із віджета; лише короткі прапорці)
const FLAGS: Record<number, string> = {
  2016: "старт",
  2019: "перші категорії",
  2021: "розмір → тема",
  2023: "зелені",
  2025: "ЗСУ поза конкурсом",
};

// Тексти степ-карток — дослівно зі статті («Як мінялися правила»,
// «Що виграє», методологія, «Війна наскрізно»)
const STEPS = [
  "Спершу проєкти ділили лише за вартістю, потім з'явилися тематичні категорії, згодом ремонт малих вулиць, зелені зони, поділ освіти на школи, садочки й позашкілля, а далі допомога армії та доступність.",
  "У 2018-му шкільні проєкти забрали більшу частину коштів, близько двох третин, і вже наступного року для освіти запровадили стелю в 40% від всієї суми бюджету участі. Відтоді її частка лише спадала: близько 30% у 2024-му і близько 20% у 2025-му та 2026-му.",
  "<strong>2022 рік.</strong> Через повномасштабне вторгнення конкурс у 2022 році не проводився.",
  "У 2025 році місто визнало це офіційно, і в бюджеті участі з'явилася окрема категорія «Допомога ЗСУ». Уже наступного, 2026 року, категорія повернулася в конкурс на загальних засадах.",
];

// Крок → підсвічені категорії; "all-dim" — крок шва 2022 (усе приглушено)
const STEP_HL: (string[] | "all-dim")[] = [
  ["uncategorized"],
  ["education-general", "education-school", "education-preschool", "education-extracurricular"],
  "all-dim",
  ["afu-support", "accessibility"],
];

const NBSP = " ";
const fmtInt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
const plural = (n: number, forms: [string, string, string]) => {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
};
const projWord = (n: number) => plural(n, ["проєкт", "проєкти", "проєктів"]);
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface ChartApi {
  setStep: (i: number) => void;
  dispose: () => void;
}

function buildChart(host: HTMLElement, DB: any, reduced: boolean, getStep: () => number): ChartApi {
  const cell = new Map<string, any>(DB.by_year_category.map((r: any) => [`${r.year}|${r.category}`, r]));
  const getCell = (y: number, c: string) => cell.get(`${y}|${c}`) ?? null;
  const val = (y: number, c: string) => getCell(y, c)?.projects ?? 0;

  const chartWrap = host.querySelector<HTMLElement>(".pr-chart")!;
  const svgEl = chartWrap.querySelector<SVGSVGElement>("svg")!;
  const axisEl = host.querySelector<HTMLElement>(".pr-axis")!;
  const tip = host.querySelector<HTMLElement>(".viz-tooltip")!;

  let entered = false;
  const REF: any = {};

  function geom() {
    const W = chartWrap.clientWidth;
    const narrow = window.innerWidth < 600;
    const vh = window.innerHeight;
    const H = narrow
      ? Math.min(340, Math.max(240, Math.round(vh * 0.42)))
      : Math.min(520, Math.max(360, Math.round(vh * 0.52)));
    const padTop = narrow ? 28 : 64;
    const padBottom = 10;
    const padX = 6;
    const step = (W - padX * 2) / YEARS.length;
    const x = (y: number) => padX + step * (YEARS.indexOf(y) + 0.5);
    return { W, H, step, x, narrow, padTop, padBottom };
  }

  function showTip(event: PointerEvent, yy: number, catK: string) {
    const c = CAT_BY_KEY.get(catK)!;
    const r = getCell(yy, catK);
    let valLine: string;
    let note = "";
    if (!r) {
      valLine = `${yy} — категорії ще не існувало`;
    } else {
      valLine = `${yy} · ${fmtInt(r.projects)} ${projWord(r.projects)}`;
      if (r.projects === 0) note = "була в бюлетені, подань не було";
    }
    tip.innerHTML =
      `<div class="tt-head"><i class="leg-sw" style="background:${c.color}"></i>${esc(c.label)}</div>` +
      `<div class="tt-val">${valLine}</div>` +
      (note ? `<div class="tt-note">${esc(note)}</div>` : "");
    const pad = 12;
    let tx = event.clientX + pad;
    let ty = event.clientY + pad;
    tip.classList.add("show");
    const r2 = tip.getBoundingClientRect();
    if (tx + r2.width > window.innerWidth - 8) tx = event.clientX - r2.width - pad;
    if (ty + r2.height > window.innerHeight - 8) ty = event.clientY - r2.height - pad;
    tip.style.left = tx + "px";
    tip.style.top = ty + "px";
  }
  const hideTip = () => tip.classList.remove("show");

  function nearestYear(event: PointerEvent) {
    const [xm] = d3.pointer(event, svgEl);
    let best = YEARS[0], dist = Infinity;
    for (const yy of YEARS) {
      const d = Math.abs(REF.geom.x(yy) - xm);
      if (d < dist) { dist = d; best = yy; }
    }
    return best;
  }

  function applyStep(i: number) {
    if (reduced) return; // reduced-motion: нейтральний фінальний стан без підсвіток
    const hl = STEP_HL[i] ?? [];
    d3.select(svgEl).selectAll<SVGPathElement, any>("path.layer")
      .classed("is-dimmed", (s: any) =>
        hl === "all-dim" ? true : hl.length ? !hl.includes(s.key) : false);
    REF.seamG?.classed("show", i === 2);
  }

  function layout() {
    const g = geom();
    const svg = d3.select(svgEl).attr("width", g.W).attr("height", g.H);
    svg.selectAll("*").remove();

    // Підготовка стека — 1:1 з віджетом (stackOffsetSilhouette, monotoneX)
    const grid = YEARS.map((y) => {
      const row: Record<string, number> = { year: y };
      for (const k of CAT_KEYS) row[k] = val(y, k);
      return row;
    });
    const series = d3.stack().keys(CAT_KEYS).value((d: any, k: string) => d[k])
      .offset(d3.stackOffsetSilhouette)(grid as any);
    let lo = 0, hi = 0;
    for (const s of series) for (const p of s) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[1]); }
    const y = d3.scaleLinear().domain([lo, hi]).range([g.H - g.padBottom, g.padTop]);
    const area = d3.area<any>()
      .x((d: any) => g.x(d.data.year))
      .y0((d: any) => y(d[0]))
      .y1((d: any) => y(d[1]))
      .curve(d3.curveMonotoneX);

    // Вхідна анімація-розкриття (один раз; у reduced-motion — одразу фінал)
    let clipUrl: string | null = null;
    if (!entered && !reduced) {
      const rect = svg.append("clipPath").attr("id", "pbSceneClipP").append("rect")
        .attr("x", 0).attr("y", 0).attr("height", g.H).attr("width", 0);
      rect.transition().duration(1000).ease(d3.easeCubicOut).attr("width", g.W);
      clipUrl = "url(#pbSceneClipP)";
    }
    entered = true;

    const layerG = svg.append("g");
    if (clipUrl) layerG.attr("clip-path", clipUrl);
    layerG.selectAll("path.layer").data(series, (s: any) => s.key).join("path")
      .attr("class", "layer")
      .attr("data-cat", (s: any) => s.key)
      .attr("fill", (s: any) => CAT_BY_KEY.get(s.key)!.color)
      .attr("d", area as any)
      .on("pointermove", function (event: PointerEvent) {
        const catK = (this as SVGPathElement).dataset.cat!;
        d3.select(svgEl).selectAll<SVGPathElement, any>("path.layer")
          .classed("is-dimmed", (s: any) => s.key !== catK);
        showTip(event, nearestYear(event), catK);
      })
      .on("pointerleave", () => { hideTip(); applyStep(getStep()); });

    // Віхи (лише на широких екранах — на 375px їм бракує місця)
    if (!g.narrow) {
      let rowToggle = 0;
      for (const yy of YEARS.filter((v) => FLAGS[v])) {
        const fx = g.x(yy);
        const rowY = rowToggle % 2 === 0 ? 14 : 32;
        rowToggle++;
        svg.append("circle").attr("class", "flag-dot").attr("cx", fx).attr("cy", rowY + 9).attr("r", 2.5);
        const anchor = yy === 2026 ? "end" : yy === 2016 ? "start" : "middle";
        const tx = yy === 2026 ? fx + 4 : yy === 2016 ? fx - 4 : fx;
        svg.append("text").attr("class", "flag-text").attr("x", tx).attr("y", rowY + 4)
          .attr("text-anchor", anchor).text(FLAGS[yy]);
        svg.append("line").attr("x1", fx).attr("x2", fx).attr("y1", rowY + 13).attr("y2", g.padTop - 16)
          .attr("class", "flag-line");
      }
    }

    // Шов 2022: пунктир між 2021 і 2023, БЕЗ слота на осі (крок 3)
    const seamX = (g.x(2021) + g.x(2023)) / 2;
    const seamG = svg.append("g").attr("class", "viz-seam");
    seamG.append("line").attr("class", "seam-line")
      .attr("x1", seamX).attr("x2", seamX)
      .attr("y1", g.padTop - 6).attr("y2", g.H - g.padBottom);
    seamG.append("text").attr("class", "seam-label")
      .attr("x", seamX).attr("y", g.padTop - 12).attr("text-anchor", "middle")
      .text("2022");
    REF.seamG = seamG;

    REF.geom = g;

    axisEl.style.paddingLeft = "6px";
    axisEl.innerHTML = YEARS
      .map((yy) => `<span style="width:${g.step}px">${g.narrow ? String(yy).slice(2) : yy}</span>`)
      .join("");

    applyStep(getStep());
  }

  layout();

  let t: ReturnType<typeof setTimeout> | undefined;
  let lastW = chartWrap.clientWidth;
  const ro = new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => {
      const w = chartWrap.clientWidth;
      if (w !== lastW) { lastW = w; layout(); }
    }, 150);
  });
  ro.observe(host);

  return {
    setStep: applyStep,
    dispose: () => { ro.disconnect(); clearTimeout(t); },
  };
}

export default function PrioritiesScene() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ChartApi | null>(null);
  const stepRef = useRef(0);

  const onStep = useCallback((i: number) => {
    stepRef.current = i;
    apiRef.current?.setStep(i);
  }, []);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const resp = await fetch("/data/priorities.json", { cache: "no-cache" });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const DB = await resp.json();
        if (disposed || !hostRef.current) return;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        apiRef.current = buildChart(hostRef.current, DB, reduced, () => stepRef.current);
        // тест-хук: суми по роках для звірки сцена = віджет
        (window as any).__pbSceneP = {
          ready: true,
          yearTotal: (y: number) =>
            DB.by_year_category.filter((r: any) => r.year === y).reduce((s: number, r: any) => s + r.projects, 0),
        };
      } catch (e) {
        console.error("Сцена «Що виграє»: дані не завантажились", e);
      }
    })();
    return () => { disposed = true; apiRef.current?.dispose(); };
  }, []);

  return (
    <SceneShell steps={STEPS} onStep={onStep}>
      <div className="scene-viz pr-viz" ref={hostRef}>
        <p className="sr-only">
          Діаграма-потік: товщина кольорових стрічок показує, скільки проєктів мала кожна
          тематична категорія Бюджету участі у 2016–2026 роках. У 2016–2018 тематичних
          категорій ще не було — ці роки показані сірою смугою. У 2022 році Бюджет участі
          не проводився. Текстові картки поруч переказують ключові стани діаграми.
        </p>
        <p className="viz-cap" aria-hidden="true">
          Бюджет участі · 2016–2026. Товщина стрічки — кількість поданих проєктів категорії
          того року. Сіра смуга 2016–2018 — роки до запровадження тематичних категорій.
        </p>
        <div className="pr-chart" aria-hidden="true"><svg /></div>
        <div className="pr-axis" aria-hidden="true"></div>
        <div className="viz-legend" aria-hidden="true">
          {CATS.map((c) => (
            <span className="leg-item" key={c.key}>
              <i className="leg-sw" style={{ background: c.color }} />
              {c.label}
            </span>
          ))}
        </div>
        <div className="viz-tooltip" aria-hidden="true"></div>
      </div>
    </SceneShell>
  );
}
