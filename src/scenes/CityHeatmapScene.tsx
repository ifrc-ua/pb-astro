// Сцена «Місто зблизька»: скрол-керована теплова H3-мапа виборців міста.
// Порт рендера віджета «Де живуть виборці» (pb-kurs/city-heatmap/app.js):
// модель і шкала 1:1 (корінь-шкала на 5 стопах choropleth, design-data §8),
// maplibre dark (OpenFreeMap) + вуаль + deck.gl H3HexagonLayer; SVG-фолбек
// віджета перенесено разом — без WebGL кроки перемикають стани SVG.
// Кроки: (1) громада, місто як пляма → (2) зум у місто, соти проявляються →
// (3) контраст: найгустіша сота як «обрана» (жовтий лише з ink-обводкою).
import { useCallback, useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import "maplibre-gl/dist/maplibre-gl.css";
import { SceneShell } from "./SceneShell";
import { hasWebGL } from "../lib/webgl";
import { loadMapLibs, type MapLibs } from "../lib/map-libs";

const CONFIG = {
  VB_W: 760,
  SEQ_STOPS: ["#F6F4FB", "#EEEAF7", "#9C8BCC", "#7B66B8", "#4E3C84"],
  STYLE_URL: "https://tiles.openfreemap.org/styles/dark",
  VEIL: { color: "#16161D", opacity: 0.45 },
  SEAM: [22, 22, 29, 170] as [number, number, number, number],
  FILL_ALPHA: 185,
  BLEND_BG: [22, 22, 29] as [number, number, number],
  YELLOW: [255, 236, 8] as [number, number, number],
  INK: [26, 26, 26] as [number, number, number],
};

const NBSP = " ";
const fmtInt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

function voterWord(n: number) {
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return "виборець";
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "виборці";
  return "виборців";
}

// Тексти степ-карток — дослівно з розділу «Місто зблизька»
const STEPS = [
  "Усередині Івано-Франківська голоси також розподіляються нерівномірно. З одних районів голосує більше людей, з других — менше.",
  "Разом на мапі <strong>267 сот</strong> і майже <strong>83 тисячі</strong> міських виборців — від п'яти людей на соту до майже двох тисяч.",
  "Але це не означає, що мешканці районів, звідки надходить більше голосів, активніші. Найімовірніше, там просто живе більше людей.",
];

function closeRing(pts: number[][]) {
  const r = pts.slice();
  const a = r[0], b = r[r.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) r.push([a[0], a[1]]);
  return r;
}

function rewindRing(ring: number[][]) {
  const f: any = { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] } };
  if (d3.geoArea(f) > 2 * Math.PI) ring.reverse();
  return ring;
}

function buildModel(ch: any) {
  const hexFeatures = ch.hexes.map((h: any) => ({
    type: "Feature",
    properties: { hex_id: h.hex_id },
    geometry: { type: "Polygon", coordinates: [rewindRing(closeRing(h.boundary))] },
  }));
  const byHex = new Map(ch.hexes.map((h: any) => [h.hex_id, h]));
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const h of ch.hexes) for (const [x, y] of h.boundary) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    meta: ch.meta,
    hexes: ch.hexes,
    byHex,
    hexFeatures,
    bounds: [[minX, minY], [maxX, maxY]] as [[number, number], [number, number]],
  };
}

interface SceneApi {
  setStep: (i: number) => void;
  dispose: () => void;
}

function buildHeatmap(host: HTMLElement, DB: any, reduced: boolean, getStep: () => number, libs: MapLibs | null): SceneApi {
  const els = {
    glMap: host.querySelector<HTMLElement>(".mh-glmap")!,
    svgWrap: host.querySelector<HTMLElement>(".mh-svgwrap")!,
    svg: host.querySelector<SVGSVGElement>(".mh-svg")!,
    tooltip: host.querySelector<HTMLElement>(".mh-tooltip")!,
    legendBar: host.querySelector<SVGSVGElement>(".mh-legendbar")!,
    sceneCap: host.querySelector<HTMLElement>(".mh-scenecap")!,
  };

  const state: any = { active: null, mode: null, step: 0 };
  const M = buildModel(DB);
  const pathByHex = new Map<string, SVGPathElement>();
  const fillByHex = new Map<string, [number, number, number]>();
  let color: (v: number) => string;
  let lo = 0, hi = 1;
  let map: any = null;
  let overlay: any = null;
  let tooltipHoldUntil = 0;
  let disposed = false;
  let ro: ResizeObserver | null = null;
  let refitTimer: ReturnType<typeof setTimeout> | undefined;
  let topTipTimer: ReturnType<typeof setTimeout> | undefined;

  // найгустіша сота — «обрана» на кроці контрастів
  const topHex = M.hexes.reduce((a: any, b: any) => (a.people > b.people ? a : b));
  const hexCenter = (h: any): [number, number] => {
    let sx = 0, sy = 0;
    for (const [x, y] of h.boundary) { sx += x; sy += y; }
    return [sx / h.boundary.length, sy / h.boundary.length];
  };

  function buildScale() {
    [lo, hi] = M.meta.people_range;
    const interp = d3.interpolateRgbBasis(CONFIG.SEQ_STOPS);
    color = (v) => interp(Math.sqrt(Math.max(0, v - lo) / (hi - lo)));
    for (const h of M.hexes) {
      const c = d3.rgb(color(h.people));
      fillByHex.set(h.hex_id, [c.r, c.g, c.b]);
    }
  }

  function scenePadding() {
    const w = els.glMap.clientWidth, h = els.glMap.clientHeight;
    if (window.matchMedia("(max-width: 599px)").matches) {
      return { top: 64, bottom: Math.round(h * 0.3), left: 12, right: 12 };
    }
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const left = wide ? Math.round(window.innerWidth * 0.06) + 452 : Math.max(16, Math.min(36, w * 0.04));
    return { top: Math.max(90, Math.min(140, h * 0.16)), bottom: Math.max(24, Math.min(48, h * 0.08)), left, right: Math.max(16, Math.min(36, w * 0.04)) };
  }

  function initGLMap() {
    const { maplibregl, MapboxOverlay } = libs!;
    const [[minX, minY], [maxX, maxY]] = M.bounds;
    map = new maplibregl.Map({
      container: els.glMap,
      style: CONFIG.STYLE_URL,
      bounds: M.bounds,
      fitBoundsOptions: { padding: scenePadding() },
      maxBounds: [[minX - 0.18, minY - 0.12], [maxX + 0.18, maxY + 0.12]],
      minZoom: 10,
      maxZoom: 15.5,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
      cooperativeGestures: true,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": "Утримуйте Ctrl і прокручуйте, щоб масштабувати мапу",
        "CooperativeGesturesHandler.MacHelpText": "Утримуйте ⌘ і прокручуйте, щоб масштабувати мапу",
        "CooperativeGesturesHandler.MobileHelpText": "Масштабуйте мапу двома пальцями",
      },
    });
    map.touchZoomRotate.disableRotation();
    overlay = new MapboxOverlay({
      interleaved: false,
      layers: buildHexLayers(),
      onHover: onGLHover,
      onClick: onGLClick,
      getCursor: ({ isDragging, isHovering }: any) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab"),
    });
    map.addControl(overlay);
    map.once("idle", () => {
      const deckEl = map.getContainer().querySelector('div[tabindex="0"]:not([aria-label])');
      if (deckEl) deckEl.setAttribute("aria-label", "Теплова мапа сот міста");
    });
    ro = new ResizeObserver(() => {
      if (!map) return;
      map.resize();
      clearTimeout(refitTimer);
      refitTimer = setTimeout(() => applyCamera(state.step, true), 200);
    });
    ro.observe(els.glMap);
    return new Promise<void>((resolve, reject) => {
      let loaded = false;
      map.on("load", () => {
        loaded = true;
        map.addLayer({
          id: "veil",
          type: "background",
          paint: { "background-color": CONFIG.VEIL.color, "background-opacity": CONFIG.VEIL.opacity },
        });
        resolve();
      });
      map.on("error", (e: any) => {
        if (!loaded) reject(e && e.error ? e.error : new Error("map error"));
      });
    });
  }

  function teardownGL() {
    try { if (map) map.remove(); } catch {}
    map = null;
    overlay = null;
    ro?.disconnect();
    ro = null;
  }

  function startSVGFallback() {
    state.mode = "svg";
    host.classList.remove("gl");
    host.classList.add("svg-fallback");
    renderMapSVG();
  }

  function buildHexLayers() {
    const { H3HexagonLayer } = libs!;
    const layers: any[] = [
      new H3HexagonLayer({
        id: "hexes",
        data: M.hexes,
        getHexagon: (h: any) => h.hex_id,
        filled: true,
        getFillColor: (h: any) => [...fillByHex.get(h.hex_id)!, CONFIG.FILL_ALPHA],
        stroked: true,
        getLineColor: CONFIG.SEAM,
        lineWidthUnits: "pixels",
        getLineWidth: 0.6,
        extruded: false,
        pickable: true,
        parameters: { depthTest: false },
      }),
    ];
    if (state.active && M.byHex.has(state.active)) {
      const a = [M.byHex.get(state.active)];
      layers.push(
        new H3HexagonLayer({
          id: "active-ink",
          data: a,
          getHexagon: (h: any) => h.hex_id,
          filled: false,
          stroked: true,
          getLineColor: [...CONFIG.INK, 220],
          lineWidthUnits: "pixels",
          getLineWidth: 4.4,
          extruded: false,
          pickable: false,
          parameters: { depthTest: false },
        }),
        new H3HexagonLayer({
          id: "active-yellow",
          data: a,
          getHexagon: (h: any) => h.hex_id,
          filled: false,
          stroked: true,
          getLineColor: [...CONFIG.YELLOW, 255],
          lineWidthUnits: "pixels",
          getLineWidth: 2.6,
          extruded: false,
          pickable: false,
          parameters: { depthTest: false },
        })
      );
    }
    return layers;
  }

  function onGLHover(info: any) {
    if (info && info.object) {
      positionTooltip(info.x, info.y, info.object.hex_id);
    } else if (performance.now() > tooltipHoldUntil) {
      hideTooltip();
    }
  }

  function onGLClick(info: any) {
    if (info && info.object) {
      state.active = info.object.hex_id;
      overlay.setProps({ layers: buildHexLayers() });
      tooltipHoldUntil = performance.now() + 450;
      positionTooltip(info.x, info.y, info.object.hex_id);
    } else {
      clearActive();
    }
  }

  function renderMapSVG() {
    const W = CONFIG.VB_W;
    const data: any = { type: "FeatureCollection", features: M.hexFeatures };
    const PAD = 10;
    const projection = d3.geoMercator().fitWidth(W - 2 * PAD, data);
    const [tx, ty] = projection.translate();
    projection.translate([tx + PAD, ty + PAD]);
    const path = d3.geoPath(projection);
    const H = Math.ceil(path.bounds(data)[1][1]) + PAD;
    const svg = d3.select(els.svg).attr("viewBox", `0 0 ${W} ${H}`);
    svg.selectAll("*").remove();
    const g = svg.append("g").attr("class", "hexes");
    g.selectAll("path")
      .data(M.hexFeatures)
      .join("path")
      .attr("class", "mh-hex")
      .attr("d", path as any)
      .attr("fill", (f: any) => color(M.byHex.get(f.properties.hex_id).people))
      .attr("aria-label", (f: any) => ariaLabelOf(f.properties.hex_id))
      .attr("tabindex", 0)
      .attr("role", "img")
      .each(function (f: any) {
        pathByHex.set(f.properties.hex_id, this as SVGPathElement);
      })
      .on("mousemove", (ev: MouseEvent, f: any) => showTooltip(ev, f.properties.hex_id))
      .on("mouseleave", hideTooltip)
      .on("focus", (_: any, f: any) => focusHex(f.properties.hex_id))
      .on("blur", hideTooltip)
      .on("click", (ev: MouseEvent, f: any) => {
        ev.stopPropagation();
        focusHex(f.properties.hex_id);
      })
      .on("keydown", (ev: KeyboardEvent, f: any) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          focusHex(f.properties.hex_id);
        }
        if (ev.key === "Escape") clearActive();
      });
    svg.on("click", clearActive);
  }

  function focusHex(hex: string) {
    state.active = hex;
    const el = pathByHex.get(hex)!;
    el.parentNode!.appendChild(el);
    for (const [h, p] of pathByHex) p.classList.toggle("is-active", h === hex);
    showTooltipAtHex(hex);
  }

  function clearActive() {
    state.active = null;
    if (state.mode === "gl" && overlay) {
      overlay.setProps({ layers: buildHexLayers() });
    } else {
      for (const [, p] of pathByHex) p.classList.remove("is-active");
    }
    hideTooltip();
  }

  function tooltipHTML(hex: string) {
    const h = M.byHex.get(hex);
    return `<span class="tt-val">${fmtInt(h.people)}</span>` + `<span class="tt-lab">${voterWord(h.people)}</span>`;
  }

  function ariaLabelOf(hex: string) {
    const n = M.byHex.get(hex).people;
    return `Сота: ${fmtInt(n)} ${voterWord(n)}.`;
  }

  function showTooltip(ev: MouseEvent, hex: string) {
    const rect = host.getBoundingClientRect();
    positionTooltip(ev.clientX - rect.left, ev.clientY - rect.top, hex);
  }

  function showTooltipAtHex(hex: string) {
    const p = pathByHex.get(hex)!;
    const rect = host.getBoundingClientRect();
    const b = p.getBoundingClientRect();
    positionTooltip(b.left - rect.left + b.width / 2, b.top - rect.top + b.height / 2, hex);
  }

  function positionTooltip(x: number, y: number, hex: string) {
    const t = els.tooltip;
    t.innerHTML = tooltipHTML(hex);
    t.hidden = false;
    const wrapW = host.clientWidth, wrapH = host.clientHeight;
    const tw = t.offsetWidth, th = t.offsetHeight;
    let tx = x + 14, ty = y + 14;
    if (tx + tw > wrapW) tx = x - tw - 14;
    if (tx < 0) tx = 2;
    if (ty + th > wrapH) ty = y - th - 14;
    if (ty < 0) ty = 2;
    t.style.left = tx + "px";
    t.style.top = ty + "px";
  }

  function hideTooltip() {
    els.tooltip.hidden = true;
  }

  function renderSceneCap() {
    els.sceneCap.innerHTML =
      `Діапазон по сотах коливається від <strong>${fmtInt(lo)}</strong> до ` +
      `<strong>${fmtInt(hi)}</strong> виборців. Відтінки відображені за корінь-шкалою, ` +
      `яка вирівнює контраст між рекордними і звичайними сотами.`;
  }

  function legendColor(v: number) {
    if (state.mode !== "gl") return color(v);
    const a = CONFIG.FILL_ALPHA / 255;
    const c = d3.rgb(color(v));
    const [br, bg, bb] = CONFIG.BLEND_BG;
    return d3
      .rgb(Math.round(c.r * a + br * (1 - a)), Math.round(c.g * a + bg * (1 - a)), Math.round(c.b * a + bb * (1 - a)))
      .formatHex();
  }

  function renderLegend() {
    const W = 440, H = 36, barH = 12;
    const svg = d3.select(els.legendBar).attr("viewBox", `0 0 ${W} ${H}`);
    svg.selectAll("*").remove();
    const defs = svg.append("defs");
    const grad = defs.append("linearGradient").attr("id", "mhGrad");
    for (let i = 0; i <= 20; i++) {
      grad.append("stop").attr("offset", `${i * 5}%`).attr("stop-color", legendColor(lo + ((hi - lo) * i) / 20));
    }
    svg.append("rect").attr("x", 0).attr("y", 2).attr("width", W).attr("height", barH).attr("rx", 3).attr("fill", "url(#mhGrad)").attr("stroke", "#E2E2E6");
    const x = d3.scaleLinear().domain([lo, hi]).range([0, W]);
    const ticks = x.ticks(5);
    if (ticks[0] > lo + (hi - lo) * 0.02) ticks.unshift(lo);
    if (ticks[ticks.length - 1] < hi - (hi - lo) * 0.02) ticks.push(hi);
    for (const tk of ticks) {
      const tx = Math.min(Math.max(x(tk), 0), W);
      const anchor = tx <= 12 ? "start" : tx >= W - 12 ? "end" : "middle";
      svg.append("text").attr("x", tx).attr("y", H - 4).attr("text-anchor", anchor).text(fmtInt(tk));
    }
  }

  // --- Хореографія кроків (лише GL; SVG-фолбек перемикає стани підсвітки) ---
  const [[minX, minY], [maxX, maxY]] = M.bounds;
  const wideBounds: [[number, number], [number, number]] = [
    [minX - 0.14, minY - 0.1],
    [maxX + 0.14, maxY + 0.1],
  ];

  function showTopTooltip() {
    if (state.mode !== "gl" || !map) return;
    const pt = map.project(hexCenter(topHex));
    tooltipHoldUntil = performance.now() + 1200;
    positionTooltip(pt.x, pt.y, topHex.hex_id);
  }

  function applyCamera(i: number, instant?: boolean) {
    if (state.mode !== "gl" || !map) return;
    const dur = instant || reduced ? 0 : 1400;
    if (i === 0) {
      map.fitBounds(wideBounds, { padding: scenePadding(), duration: dur });
    } else if (i === 1) {
      map.fitBounds(M.bounds, { padding: scenePadding(), duration: dur });
    } else {
      const cam = map.cameraForBounds(M.bounds, { padding: scenePadding() });
      const zoom = Math.min((cam?.zoom ?? map.getZoom()) + 0.9, 15.5);
      map.flyTo({ center: hexCenter(topHex), zoom, duration: dur, essential: true });
    }
  }

  function applyStep(i: number) {
    state.step = i;
    if (state.mode === "svg") {
      // фолбек: камера статична, крок контрастів підсвічує найгустішу соту
      if (i === 2) focusHex(topHex.hex_id); else clearActive();
      return;
    }
    if (state.mode !== "gl" || !map) return;
    if (reduced) return; // фінальний стан виставлено на ініціалізації
    if (i === 2) {
      state.active = topHex.hex_id;
      overlay.setProps({ layers: buildHexLayers() });
      applyCamera(2);
      // тултип — після прибуття камери; таймер надійніший за once("moveend"),
      // який губиться, коли maplibre скорочує анімацію
      clearTimeout(topTipTimer);
      topTipTimer = setTimeout(() => {
        if (!disposed && state.step === 2) showTopTooltip();
      }, 1600);
    } else {
      clearTimeout(topTipTimer);
      clearActive();
      applyCamera(i);
    }
  }

  const api: SceneApi = {
    setStep: applyStep,
    dispose: () => {
      disposed = true;
      clearTimeout(refitTimer);
      clearTimeout(topTipTimer);
      teardownGL();
    },
  };

  (async () => {
    buildScale();
    host.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") clearActive();
    });
    if (libs && hasWebGL()) {
      state.mode = "gl";
      host.classList.add("gl");
      try {
        await initGLMap();
      } catch (e) {
        console.warn("Мапа-підложка недоступна, вмикаю SVG-фолбек:", e);
        teardownGL();
        startSVGFallback();
      }
    } else {
      startSVGFallback();
    }
    if (disposed) return;
    renderLegend();
    renderSceneCap();
    if (state.mode === "gl" && reduced) {
      // reduced-motion: одразу фінальний стан — місто із сотами і контрастом
      state.active = topHex.hex_id;
      overlay.setProps({ layers: buildHexLayers() });
      map.fitBounds(M.bounds, { padding: scenePadding(), duration: 0 });
      topTipTimer = setTimeout(() => { if (!disposed) showTopTooltip(); }, 500);
    } else {
      applyStep(getStep());
    }
    (window as any).__pbSceneH = {
      ready: true,
      mode: () => state.mode,
      st: () => ({
        step: state.step,
        mode: state.mode,
        active: state.active,
        zoom: map ? map.getZoom() : null,
        hexes: M.hexes.length,
        people: M.hexes.reduce((s: number, h: any) => s + h.people, 0),
        range: M.meta.people_range,
        topHex: topHex.hex_id,
        topPeople: topHex.people,
        tooltipVisible: !els.tooltip.hidden,
      }),
    };
  })();

  return api;
}

export default function CityHeatmapScene() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const stepRef = useRef(0);
  const [started, setStarted] = useState(false);

  const onStep = useCallback((i: number) => {
    stepRef.current = i;
    apiRef.current?.setStep(i);
  }, []);

  useEffect(() => {
    setStarted(true);
  }, []);

  useEffect(() => {
    if (!started || !hostRef.current) return;
    let disposed = false;
    (async () => {
      try {
        const webglOk = hasWebGL();
        const [libs, ch] = await Promise.all([
          webglOk ? loadMapLibs() : Promise.resolve(null),
          fetch("/data/city_heatmap.json", { cache: "no-cache" }).then((r) => {
            if (!r.ok) throw new Error("city_heatmap.json: " + r.status);
            return r.json();
          }),
        ]);
        if (disposed || !hostRef.current) return;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        apiRef.current = buildHeatmap(hostRef.current, ch, reduced, () => stepRef.current, libs);
      } catch (e) {
        console.error("Сцена «Місто зблизька»: дані не завантажились", e);
      }
    })();
    return () => {
      disposed = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [started]);

  return (
    <SceneShell steps={STEPS} onStep={onStep}>
      <div className="scene-map mh-viz" ref={hostRef}>
        <p className="sr-only">
          Теплова мапа міста Івано-Франківськ, складена з однакових шестикутних сот
          близько 350 метрів. Колір соти показує, скільки різних виборців Бюджету участі
          за кампанії 2021–2026 живе на цій території: темніше — більше виборців. Це мапа
          того, де виборці живуть (слід електорату), а не як вони голосують і не явка всіх
          мешканців: населення соти невідоме. На мапі 267 сот, у них разом 82 758 виборців;
          діапазон — від 5 до 1 872 виборців на соту. Текстові картки поруч переказують
          ключові стани мапи.
        </p>
        <div className="mh-glmap" aria-hidden="true"></div>
        <div className="mh-svgwrap" aria-hidden="true">
          <svg className="mh-svg"></svg>
        </div>
        <div className="mv-meta" aria-hidden="true">
          <div className="mv-card mh-legend">
            <span className="mh-legend-title">Виборців на соту</span>
            <svg className="mh-legendbar"></svg>
            <p className="mh-scenecap"></p>
          </div>
        </div>
        <p className="mv-note" aria-hidden="true">
          Мапа показує, де живуть виборці 2021–2026 (слід електорату), а не як вони
          голосують: населення сот невідоме, тож більше виборців найчастіше означає
          щільнішу забудову. Соти ~350 м (H3), агрегати від 5; кожен виборець порахований
          один раз — за адресою останньої кампанії.
        </p>
        <div className="mh-tooltip" role="presentation" hidden></div>
      </div>
    </SceneShell>
  );
}
