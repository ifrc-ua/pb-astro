"use strict";

const CONFIG = {
  VB_W: 760,
  SEQ_STOPS: [ "#F6F4FB", "#EEEAF7", "#9C8BCC", "#7B66B8", "#4E3C84" ],
  CITY: "Івано-Франківськ",
  STYLE_URL: "https://tiles.openfreemap.org/styles/dark",
  VEIL: {
    color: "#16161D",
    opacity: .45
  },
  SEAM: [ 22, 22, 29, 170 ],
  FILL_ALPHA: 185,
  BLEND_BG: [ 22, 22, 29 ],
  YELLOW: [ 255, 236, 8 ],
  INK: [ 26, 26, 26 ]
};

const NBSP = " ";

const fmtInt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  active: null,
  mode: null
};

const els = {};

let M = null;

let pathByHex = new Map;

let color = null;

let lo = 0, hi = 1;

let map = null;

let overlay = null;

let fillByHex = new Map;

let tooltipHoldUntil = 0;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  [ "widget", "mapWrap", "glMap", "map", "tooltip", "legendBar", "sceneCap", "loading" ].forEach(id => els[id] = document.getElementById(id));
  try {
    const ch = await fetch("data/city_heatmap.json", {
      cache: "no-cache"
    }).then(r => r.json());
    M = buildModel(ch);
  } catch (e) {
    els.loading.innerHTML = "Не вдалося завантажити дані віджета.";
    throw e;
  }
  buildScale();
  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape") clearActive();
  });
  if (hasWebGL()) {
    state.mode = "gl";
    els.mapWrap.classList.add("gl");
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
  renderLegend();
  renderSceneCap();
  els.loading.hidden = true;
  window.__pb = {
    mode: () => state.mode,
    map: () => map,
    model: () => M,
    active: () => state.active
  };
}

function startSVGFallback() {
  state.mode = "svg";
  els.mapWrap.classList.remove("gl");
  els.mapWrap.classList.add("svg-fallback");
  renderMapSVG();
}

function buildModel(ch) {
  const hexFeatures = ch.hexes.map(h => ({
    type: "Feature",
    properties: {
      hex_id: h.hex_id
    },
    geometry: {
      type: "Polygon",
      coordinates: [ rewindRing(closeRing(h.boundary)) ]
    }
  }));
  const byHex = new Map(ch.hexes.map(h => [ h.hex_id, h ]));
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
    bounds: [ [ minX, minY ], [ maxX, maxY ] ]
  };
}

function closeRing(pts) {
  const r = pts.slice();
  const a = r[0], b = r[r.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) r.push([ a[0], a[1] ]);
  return r;
}

function rewindRing(ring) {
  const f = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [ ring ]
    }
  };
  if (d3.geoArea(f) > 2 * Math.PI) ring.reverse();
  return ring;
}

function buildScale() {
  [lo, hi] = M.meta.people_range;
  const interp = d3.interpolateRgbBasis(CONFIG.SEQ_STOPS);
  color = v => interp(Math.sqrt(Math.max(0, v - lo) / (hi - lo)));
  for (const h of M.hexes) {
    const c = d3.rgb(color(h.people));
    fillByHex.set(h.hex_id, [ c.r, c.g, c.b ]);
  }
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch (e) {
    return false;
  }
}

function initGLMap() {
  const [[minX, minY], [maxX, maxY]] = M.bounds;
  map = new maplibregl.Map({
    container: els.glMap,
    style: CONFIG.STYLE_URL,
    bounds: [ [ minX, minY ], [ maxX, maxY ] ],
    fitBoundsOptions: {
      padding: 20
    },
    maxBounds: [ [ minX - .18, minY - .12 ], [ maxX + .18, maxY + .12 ] ],
    minZoom: 10,
    maxZoom: 15.5,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: {
      compact: true
    },
    cooperativeGestures: true,
    locale: {
      "CooperativeGesturesHandler.WindowsHelpText": "Утримуйте Ctrl і прокручуйте, щоб масштабувати мапу",
      "CooperativeGesturesHandler.MacHelpText": "Утримуйте ⌘ і прокручуйте, щоб масштабувати мапу",
      "CooperativeGesturesHandler.MobileHelpText": "Масштабуйте мапу двома пальцями"
    }
  });
  map.touchZoomRotate.disableRotation();
  overlay = new deck.MapboxOverlay({
    interleaved: false,
    layers: buildHexLayers(),
    onHover: onGLHover,
    onClick: onGLClick,
    getCursor: ({isDragging, isHovering}) => isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
  });
  map.addControl(overlay);
  map.once("idle", () => {
    const deckEl = map.getContainer().querySelector('div[tabindex="0"]:not([aria-label])');
    if (deckEl) deckEl.setAttribute("aria-label", "Теплова мапа сот міста");
  });
  let refitTimer = 0;
  new ResizeObserver(() => {
    map.resize();
    clearTimeout(refitTimer);
    refitTimer = setTimeout(() => {
      map.fitBounds(M.bounds, {
        padding: 20,
        duration: REDUCED ? 0 : 500
      });
    }, 200);
  }).observe(els.glMap);
  return new Promise((resolve, reject) => {
    let loaded = false;
    map.on("load", () => {
      loaded = true;
      map.addLayer({
        id: "veil",
        type: "background",
        paint: {
          "background-color": CONFIG.VEIL.color,
          "background-opacity": CONFIG.VEIL.opacity
        }
      });
      resolve();
    });
    map.on("error", e => {
      if (!loaded) reject(e && e.error ? e.error : new Error("map error"));
    });
  });
}

function teardownGL() {
  try {
    if (map) map.remove();
  } catch (e) {}
  map = null;
  overlay = null;
}

function buildHexLayers() {
  const layers = [ new deck.H3HexagonLayer({
    id: "hexes",
    data: M.hexes,
    getHexagon: h => h.hex_id,
    filled: true,
    getFillColor: h => [ ...fillByHex.get(h.hex_id), CONFIG.FILL_ALPHA ],
    stroked: true,
    getLineColor: CONFIG.SEAM,
    lineWidthUnits: "pixels",
    getLineWidth: .6,
    extruded: false,
    pickable: true,
    parameters: {
      depthTest: false
    }
  }) ];
  if (state.active && M.byHex.has(state.active)) {
    const a = [ M.byHex.get(state.active) ];
    layers.push(new deck.H3HexagonLayer({
      id: "active-ink",
      data: a,
      getHexagon: h => h.hex_id,
      filled: false,
      stroked: true,
      getLineColor: [ ...CONFIG.INK, 220 ],
      lineWidthUnits: "pixels",
      getLineWidth: 4.4,
      extruded: false,
      pickable: false,
      parameters: {
        depthTest: false
      }
    }), new deck.H3HexagonLayer({
      id: "active-yellow",
      data: a,
      getHexagon: h => h.hex_id,
      filled: false,
      stroked: true,
      getLineColor: [ ...CONFIG.YELLOW, 255 ],
      lineWidthUnits: "pixels",
      getLineWidth: 2.6,
      extruded: false,
      pickable: false,
      parameters: {
        depthTest: false
      }
    }));
  }
  return layers;
}

function onGLHover(info) {
  if (info && info.object) {
    positionTooltip(info.x, info.y, info.object.hex_id);
  } else if (performance.now() > tooltipHoldUntil) {
    hideTooltip();
  }
}

function onGLClick(info) {
  if (info && info.object) {
    state.active = info.object.hex_id;
    overlay.setProps({
      layers: buildHexLayers()
    });
    tooltipHoldUntil = performance.now() + 450;
    positionTooltip(info.x, info.y, info.object.hex_id);
  } else {
    clearActive();
  }
}

function renderMapSVG() {
  const W = CONFIG.VB_W;
  const data = {
    type: "FeatureCollection",
    features: M.hexFeatures
  };
  const PAD = 10;
  const projection = d3.geoMercator().fitWidth(W - 2 * PAD, data);
  const [tx, ty] = projection.translate();
  projection.translate([ tx + PAD, ty + PAD ]);
  const path = d3.geoPath(projection);
  const H = Math.ceil(path.bounds(data)[1][1]) + PAD;
  const svg = d3.select(els.map).attr("viewBox", `0 0 ${W} ${H}`);
  svg.selectAll("*").remove();
  const g = svg.append("g").attr("class", "hexes");
  g.selectAll("path").data(M.hexFeatures).join("path").attr("class", "hex").attr("d", path).attr("fill", f => color(M.byHex.get(f.properties.hex_id).people)).attr("aria-label", f => ariaLabelOf(f.properties.hex_id)).attr("tabindex", 0).attr("role", "img").each(function(f) {
    pathByHex.set(f.properties.hex_id, this);
  }).on("mousemove", (ev, f) => showTooltip(ev, f.properties.hex_id)).on("mouseleave", hideTooltip).on("focus", (_, f) => focusHex(f.properties.hex_id)).on("blur", hideTooltip).on("click", (ev, f) => {
    ev.stopPropagation();
    focusHex(f.properties.hex_id);
  }).on("keydown", (ev, f) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      focusHex(f.properties.hex_id);
    }
    if (ev.key === "Escape") clearActive();
  });
  svg.on("click", clearActive);
}

function focusHex(hex) {
  state.active = hex;
  const el = pathByHex.get(hex);
  el.parentNode.appendChild(el);
  for (const [h, p] of pathByHex) p.classList.toggle("is-active", h === hex);
  showTooltipAtHex(hex);
}

function clearActive() {
  state.active = null;
  if (state.mode === "gl" && overlay) {
    overlay.setProps({
      layers: buildHexLayers()
    });
  } else {
    for (const [, p] of pathByHex) p.classList.remove("is-active");
  }
  hideTooltip();
}

function voterWord(n) {
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return "виборець";
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "виборці";
  return "виборців";
}

function tooltipHTML(hex) {
  const h = M.byHex.get(hex);
  return `<span class="tt-val">${fmtInt(h.people)}</span>` + `<span class="tt-lab">${voterWord(h.people)}</span>`;
}

function ariaLabelOf(hex) {
  const n = M.byHex.get(hex).people;
  return `Сота: ${fmtInt(n)} ${voterWord(n)}.`;
}

function showTooltip(ev, hex) {
  const rect = els.mapWrap.getBoundingClientRect();
  positionTooltip(ev.clientX - rect.left, ev.clientY - rect.top, hex);
}

function showTooltipAtHex(hex) {
  const p = pathByHex.get(hex);
  const rect = els.mapWrap.getBoundingClientRect();
  const b = p.getBoundingClientRect();
  positionTooltip(b.left - rect.left + b.width / 2, b.top - rect.top + b.height / 2, hex);
}

function positionTooltip(x, y, hex) {
  const t = els.tooltip;
  t.innerHTML = tooltipHTML(hex);
  t.hidden = false;
  const wrapW = els.mapWrap.clientWidth, wrapH = els.mapWrap.clientHeight;
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
  els.sceneCap.innerHTML = `Діапазон по сотах коливається від <strong>${fmtInt(lo)}</strong> до ` + `<strong>${fmtInt(hi)}</strong> виборців. Відтінки відображені за корінь-шкалою, ` + `яка вирівнює контраст між рекордними і звичайними сотами.`;
}

function legendColor(v) {
  if (state.mode !== "gl") return color(v);
  const a = CONFIG.FILL_ALPHA / 255;
  const c = d3.rgb(color(v));
  const [br, bg, bb] = CONFIG.BLEND_BG;
  return d3.rgb(Math.round(c.r * a + br * (1 - a)), Math.round(c.g * a + bg * (1 - a)), Math.round(c.b * a + bb * (1 - a))).formatHex();
}

function renderLegend() {
  const W = 440, H = 36, barH = 12;
  const svg = d3.select(els.legendBar).attr("viewBox", `0 0 ${W} ${H}`);
  svg.selectAll("*").remove();
  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "chGrad");
  for (let i = 0; i <= 20; i++) {
    grad.append("stop").attr("offset", `${i * 5}%`).attr("stop-color", legendColor(lo + (hi - lo) * i / 20));
  }
  svg.append("rect").attr("x", 0).attr("y", 2).attr("width", W).attr("height", barH).attr("rx", 3).attr("fill", "url(#chGrad)").attr("stroke", "#E2E2E6");
  const x = d3.scaleLinear().domain([ lo, hi ]).range([ 0, W ]);
  const ticks = x.ticks(5);
  if (ticks[0] > lo + (hi - lo) * .02) ticks.unshift(lo);
  if (ticks[ticks.length - 1] < hi - (hi - lo) * .02) ticks.push(hi);
  for (const tk of ticks) {
    const tx = Math.min(Math.max(x(tk), 0), W);
    const anchor = tx <= 12 ? "start" : tx >= W - 12 ? "end" : "middle";
    svg.append("text").attr("x", tx).attr("y", H - 4).attr("text-anchor", anchor).text(fmtInt(tk));
  }
}
