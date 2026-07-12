// Сцена «Клуб постійних»: скрол-керована ріка когорт 2021–2026.
// Порт рендера віджета cohort-river (pb-kurs/cohort-river/app.js): підготовка
// даних 1:1 (composition → сегменти стека), d3 з npm; панель/сходи/контроли
// віджета прибрані — станами керує скрол-драйвер (SceneShell), тултипи
// збережені. Рік 2022 не має слота — лише шов-пунктир на кроці 2.
import { useCallback, useEffect, useRef } from "react";
import * as d3 from "d3";
import { SceneShell } from "./SceneShell";

const YEARS = [2021, 2023, 2024, 2025, 2026];
const SLOTS = [2021, 2023, 2024, 2025, 2026];

// Колір шару = рік першої участі (порт із віджета; фіолетова шкала бренду)
const COHORT_COLOR: Record<number, string> = {
  2021: "#4E3C84",
  2023: "#654EA3",
  2024: "#7B66B8",
  2025: "#9C8BCC",
  2026: "#EEEAF7",
};
const COHORT_STROKE: Record<number, string> = {
  2025: "rgba(26,26,26,0.18)",
  2026: "rgba(26,26,26,0.25)",
};

// Тексти степ-карток — дослівно зі статті («Портрет учасника», «Квітневий ритуал»)
const STEPS = [
  "За останні п'ять виборчих кампаній склалося стабільне ядро, яке повертається рік за роком.",
  "У 2022-му, з початком повномасштабного вторгнення, бюджети участі завмерли по всій країні. Було не до них, і багато міст поставили їх на паузу надовго.",
  "З тих, хто вперше проголосував у 2021-му, майже половина голосувала й у 2026-му. Від кампанії до кампанії поверталися майже сім із десяти виборців, а понад 12 тисяч людей не пропустили жодної з п'яти кампаній у 2021–2026 роках.",
  "Новачків серед виборців стало майже вдвічі менше: з 39% у 2023-му до 22% у 2026-му. Бюджет участі росте вглиб, а не вшир: він стає клубом для своїх.",
];

// Крок → який сегмент (рік×когорта) підсвічено
type Seg = { year: number; cohort: number; people: number; slot: number; y0: number; y1: number; pctYear: number };
const STEP_LIT: ((d: Seg) => boolean)[] = [
  (d) => d.year === 2021, // старт обліку: колона 2021
  () => false, // розрив 2022: усе приглушено, видно шов
  (d) => d.cohort === 2021, // доля покоління-2021 через усі роки
  (d) => d.cohort === d.year && d.year !== 2021, // новачки 2023–2026 меншають
];

const NBSP = " ";
const fmtInt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
const fmtPct = (x: number, d = 1) => x.toFixed(d).replace(".", ",") + "%";
const plural = (n: number, forms: [string, string, string]) => {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
};
const PEOPLE: [string, string, string] = ["людина", "людини", "людей"];

interface ChartApi {
  setStep: (i: number) => void;
  dispose: () => void;
}

function buildChart(host: HTMLElement, DB: any, reduced: boolean, getStep: () => number): ChartApi {
  const chartWrap = host.querySelector<HTMLElement>(".cr-chart")!;
  const svgEl = chartWrap.querySelector<SVGSVGElement>("svg")!;
  const tip = host.querySelector<HTMLElement>(".viz-tooltip")!;

  const yearTotal = new Map<number, number>(
    YEARS.map((y) => [y, DB.composition.filter((r: any) => r.year === y).reduce((s: number, r: any) => s + r.people, 0)])
  );
  const MAXTOTAL = Math.max(...yearTotal.values());

  let entered = false;
  const REF: any = {};

  function geom() {
    const W = chartWrap.clientWidth;
    const m = { l: 4, r: 4 };
    const unit = (W - m.l - m.r) / SLOTS.length;
    const cx = (slotIdx: number) => m.l + unit * (slotIdx + 0.5);
    const narrow = window.innerWidth < 600;
    const vh = window.innerHeight;
    const H = narrow
      ? Math.min(280, Math.max(190, Math.round(vh * 0.34)))
      : Math.min(420, Math.max(260, Math.round(vh * 0.42)));
    const colW = Math.min(unit * 0.72, 104);
    return { W, m, unit, H, cx, colW, narrow };
  }

  function tipHtml(d: Seg) {
    return (
      `<span class="t-head">Когорта ${d.cohort}</span><br>` +
      `у ${d.year}: <span class="t-num">${fmtInt(d.people)}</span> ` +
      `${plural(d.people, PEOPLE)} · ${fmtPct(d.pctYear)} складу року`
    );
  }
  function showTip(e: PointerEvent, d: Seg) {
    tip.innerHTML = tipHtml(d);
    const pad = 12;
    let tx = e.clientX + pad;
    let ty = e.clientY + pad;
    tip.classList.add("show");
    const r2 = tip.getBoundingClientRect();
    if (tx + r2.width > window.innerWidth - 8) tx = e.clientX - r2.width - pad;
    if (ty + r2.height > window.innerHeight - 8) ty = e.clientY - r2.height - pad;
    tip.style.left = tx + "px";
    tip.style.top = ty + "px";
  }
  const hideTip = () => tip.classList.remove("show");

  function applyStep(i: number) {
    if (reduced) return; // reduced-motion: нейтральний фінальний стан без підсвіток
    const lit = STEP_LIT[i] ?? (() => true);
    d3.select(svgEl).selectAll<SVGRectElement, Seg>("rect.seg")
      .attr("opacity", (d) => (lit(d) ? 1 : 0.4));
    REF.seamG?.classed("show", i === 1);
  }

  function layout() {
    const g = geom();
    const padTop = 46;
    const padBottom = 26;
    const totalH = padTop + g.H + padBottom;
    const baseline = padTop + g.H;
    const hOf = (n: number) => (n / MAXTOTAL) * g.H;
    const svg = d3.select(svgEl).attr("width", g.W).attr("height", totalH);
    svg.selectAll("*").remove();

    // Сегменти стека — 1:1 з віджетом (кумулятивно по когортах усередині року)
    const segs: Seg[] = [];
    YEARS.forEach((y) => {
      let cum = 0;
      YEARS.filter((c) => c <= y).forEach((c) => {
        const row = DB.composition.find((r: any) => r.year === y && r.cohort === c);
        if (!row) return;
        segs.push({
          year: y, cohort: c, people: row.people, slot: SLOTS.indexOf(y),
          y0: cum, y1: cum + row.people, pctYear: (100 * row.people) / yearTotal.get(y)!,
        });
        cum += row.people;
      });
    });

    svg.append("line").attr("class", "cr-base")
      .attr("x1", g.m.l).attr("x2", g.W - g.m.r)
      .attr("y1", baseline + 0.5).attr("y2", baseline + 0.5);

    const animate = !entered && !reduced;
    entered = true;
    const segSel = svg.selectAll("rect.seg").data(segs).join("rect")
      .attr("class", "seg")
      .attr("x", (d) => g.cx(d.slot) - g.colW / 2)
      .attr("width", g.colW)
      .attr("fill", (d) => COHORT_COLOR[d.cohort])
      .attr("stroke", (d) => COHORT_STROKE[d.cohort] || "var(--canvas)")
      .attr("stroke-width", 1)
      .on("pointermove", function (e: PointerEvent) {
        const d = d3.select<SVGRectElement, Seg>(this as SVGRectElement).datum();
        showTip(e, d);
      })
      .on("pointerleave", hideTip);
    if (animate) {
      segSel.attr("y", baseline).attr("height", 0)
        .transition().duration(700).ease(d3.easeCubicOut)
        .delay((d) => d.slot * 60)
        .attr("y", (d) => baseline - hOf(d.y1))
        .attr("height", (d) => Math.max(hOf(d.people), 0));
    } else {
      segSel.attr("y", (d) => baseline - hOf(d.y1)).attr("height", (d) => Math.max(hOf(d.people), 0));
    }

    // Підписи: рік під колоною, разом над колоною, частка нових
    for (const y of YEARS) {
      const slot = SLOTS.indexOf(y);
      const total = yearTotal.get(y)!;
      const nv = DB.loyalty.new_vs_repeat.find((r: any) => r.year === y);
      svg.append("text").attr("class", "cr-year")
        .attr("x", g.cx(slot)).attr("y", baseline + 17).attr("text-anchor", "middle")
        .text(y);
      svg.append("text").attr("class", "cr-total")
        .attr("x", g.cx(slot)).attr("y", baseline - hOf(total) - 21)
        .attr("text-anchor", "middle").attr("font-size", g.narrow ? 11 : 13)
        .text(fmtInt(total));
      svg.append("text").attr("class", "cr-new")
        .attr("x", g.cx(slot)).attr("y", baseline - hOf(total) - 8)
        .attr("text-anchor", "middle").attr("font-size", g.narrow ? 9.5 : 10.5)
        .text(y === 2021 ? "старт обліку" : `нові ${fmtPct(nv.new_pct, 0)}`);
    }

    // Шов 2022: пунктир між колонами 2021 і 2023, БЕЗ слота (крок 2)
    const seamX = (g.cx(0) + g.cx(1)) / 2;
    const seamG = svg.append("g").attr("class", "viz-seam");
    seamG.append("line").attr("class", "seam-line")
      .attr("x1", seamX).attr("x2", seamX)
      .attr("y1", padTop - 6).attr("y2", baseline);
    seamG.append("text").attr("class", "seam-label")
      .attr("x", seamX).attr("y", padTop - 12).attr("text-anchor", "middle")
      .text("2022");
    REF.seamG = seamG;

    applyStep(getStep());
  }

  layout();

  let t: ReturnType<typeof setTimeout> | undefined;
  let lastW = chartWrap.clientWidth;
  const ro = new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => {
      const w = chartWrap.clientWidth;
      if (w !== lastW) { lastW = w; hideTip(); layout(); }
    }, 150);
  });
  ro.observe(host);

  return {
    setStep: applyStep,
    dispose: () => { ro.disconnect(); clearTimeout(t); },
  };
}

export default function CohortRiverScene() {
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
        const resp = await fetch("/data/cohorts.json", { cache: "no-cache" });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const DB = await resp.json();
        if (disposed || !hostRef.current) return;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        apiRef.current = buildChart(hostRef.current, DB, reduced, () => stepRef.current);
        // тест-хук: суми по роках для звірки сцена = віджет
        (window as any).__pbSceneC = {
          ready: true,
          yearTotal: (y: number) =>
            DB.composition.filter((r: any) => r.year === y).reduce((s: number, r: any) => s + r.people, 0),
        };
      } catch (e) {
        console.error("Сцена «Клуб постійних»: дані не завантажились", e);
      }
    })();
    return () => { disposed = true; apiRef.current?.dispose(); };
  }, []);

  return (
    <SceneShell steps={STEPS} onStep={onStep}>
      <div className="scene-viz cr-viz" ref={hostRef}>
        <p className="sr-only">
          Діаграма: стовпчики — учасники голосування кожного року з 2021 до 2026
          (у 2022 році Бюджет участі не проводився). Кольорові шари стовпчика показують,
          у якому році ці люди проголосували вперше. Текстові картки поруч переказують
          ключові стани діаграми.
        </p>
        <p className="viz-cap" aria-hidden="true">
          Бюджет участі · виборці 2021–2026. Висота стовпчика — скільки людей голосувало
          того року; колір шару — рік першої участі.
        </p>
        <div className="cr-chart" aria-hidden="true"><svg /></div>
        <div className="viz-legend" aria-hidden="true">
          {YEARS.map((c) => (
            <span className="leg-item" key={c}>
              <i className="leg-sw" style={{ background: COHORT_COLOR[c], boxShadow: c >= 2025 ? "inset 0 0 0 1px rgba(26,26,26,.25)" : "none" }} />
              {c}
            </span>
          ))}
        </div>
        <div className="viz-tooltip" aria-hidden="true"></div>
      </div>
    </SceneShell>
  );
}
