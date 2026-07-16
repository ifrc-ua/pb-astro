"use strict";

const CONFIG = {
  VB_W: 820,
  CITY: "Івано-Франківськ",
  AGG_HROMADA: "Вся громада",
  AGG_VILLAGES: "Усі села",
  RAMP: [ "#F6F4FB", "#EEEAF7", "#9C8BCC", "#7B66B8", "#654EA3", "#4E3C84" ],
  EMPTY_FILL: "#EFEFF1",
  GHOST_FILL: "#FFFFFF",
  K: 5
};

const COL = {
  f: "#9C8BCC",
  m: "#4E3C84",
  in: "#E0A73E",
  out: "#5A7085"
};

const NBSP = " ";

const NDASH = "–";

const fmtInt = n => n == null ? "—" : Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

const fmtPct = (x, d = 0) => x.toFixed(d).replace(".", ",") + "%";

const plural = (n, f) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return f[2];
  if (b > 1 && b < 5) return f[1];
  if (b === 1) return f[0];
  return f[2];
};

const proj = n => `${fmtInt(n)} ${plural(n, [ "проєкт", "проєкти", "проєктів" ])}`;

const PERCAP_YEARS = [ 2024, 2025, 2026 ];

const isPercapYear = y => PERCAP_YEARS.includes(Number(y));

const state = {
  mode: "hromada",
  year: "all",
  metric: "absolute",
  villageSel: CONFIG.AGG_VILLAGES
};

const els = {};

let META = null, DATA = null, geo = null;

let CATBYKEY = new Map;

let pathById = new Map;

let mapScale = null;

let tipTimer = null;

let ADULTS = new Map;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  [ "widget", "overline", "title", "modesBox", "modeHromada", "modeCity", "modeVillages", "metricBox", "metricAbsolute", "metricPer1000", "metricTurnout", "yearsBox", "yearAxis", "mapWrap", "map", "mapYear", "tooltip", "legendTitle", "legendCap", "legendBar", "sceneCap", "panel", "districtSelect", "selectLabel", "panelBody", "noteList", "loading" ].forEach(id => els[id] = document.getElementById(id));
  try {
    const [cp, gj, pop] = await Promise.all([ fetch("data/communities_projects.json", {
      cache: "no-cache"
    }).then(r => r.json()), fetch("data/communities.geojson", {
      cache: "no-cache"
    }).then(r => r.json()), fetch("data/population.json", {
      cache: "no-cache"
    }).then(r => r.json()) ]);
    META = cp.meta;
    DATA = cp.data;
    geo = gj;
    for (const c of META.categories) CATBYKEY.set(c.key, c);
    buildAdults(pop);
  } catch (e) {
    els.loading.innerHTML = "Не вдалося завантажити дані віджета.";
    throw e;
  }
  applyStaticText();
  renderMap();
  renderYearAxis();
  bindModes();
  bindMetrics();
  renderSelect();
  refreshYearButtons();
  update();
  els.loading.hidden = true;
  window.__pb = {
    ready: true,
    state,
    setMode,
    setYear,
    setMetric,
    setEntity: setEntityByName,
    entity: entityName,
    cell: (name, y) => DATA[name][String(y)],
    submittedOf,
    adultsOf,
    turnout: (name, y) => {
      const a = adultsOf(name, y);
      const p = cellOf(name, y).residents_voted?.people;
      return a && p != null ? p / a * 100 : null;
    },
    noLocation: noLocationCount()
  };
}

function buildAdults(pop) {
  for (const r of pop.by_district) {
    if (r.adults_18plus == null) continue;
    if (!ADULTS.has(r.district)) ADULTS.set(r.district, new Map);
    ADULTS.get(r.district).set(r.year, r.adults_18plus);
  }
  const missing = META.districts.filter(d => !ADULTS.has(d));
  if (missing.length) console.warn("[communities] нема населення для громад:", missing);
  const villages = META.districts.filter(d => d !== CONFIG.CITY);
  for (const [agg, subset] of [ [ CONFIG.AGG_HROMADA, META.districts ], [ CONFIG.AGG_VILLAGES, villages ] ]) {
    const m = new Map;
    for (const y of PERCAP_YEARS) {
      let s = 0, ok = true;
      for (const d of subset) {
        const a = ADULTS.get(d)?.get(y);
        if (a == null) {
          ok = false;
          break;
        }
        s += a;
      }
      if (ok) m.set(y, s);
    }
    ADULTS.set(agg, m);
  }
}

function adultsOf(name, year) {
  return ADULTS.get(name)?.get(Number(year)) ?? null;
}

function entityName() {
  if (state.mode === "hromada") return CONFIG.AGG_HROMADA;
  if (state.mode === "city") return CONFIG.CITY;
  return state.villageSel;
}

function scopeOf(name) {
  return DATA[name].scope;
}

function cellOf(name, y) {
  return DATA[name][String(y)];
}

function submittedOf(d, y) {
  return cellOf(d, y).submitted_total;
}

function noLocationCount() {
  return META.reconciliation.projects_no_district;
}

function isVotingYear(y) {
  return y === "all" || (META.voting_years || []).includes(Number(y));
}

function setMode(mode) {
  state.mode = mode;
  if (mode === "villages" && (state.villageSel === CONFIG.CITY || state.villageSel === CONFIG.AGG_HROMADA)) state.villageSel = CONFIG.AGG_VILLAGES;
  syncModeButtons();
  update();
}

function syncModeButtons() {
  els.modeHromada.setAttribute("aria-checked", String(state.mode === "hromada"));
  els.modeCity.setAttribute("aria-checked", String(state.mode === "city"));
  els.modeVillages.setAttribute("aria-checked", String(state.mode === "villages"));
}

function bindModes() {
  els.modeHromada.addEventListener("click", () => setMode("hromada"));
  els.modeCity.addEventListener("click", () => setMode("city"));
  els.modeVillages.addEventListener("click", () => setMode("villages"));
}

function bindMetrics() {
  els.metricAbsolute.addEventListener("click", () => setMetric("absolute"));
  els.metricPer1000.addEventListener("click", () => setMetric("per1000"));
  els.metricTurnout.addEventListener("click", () => setMetric("turnout"));
}

function syncMetricButtons() {
  els.metricAbsolute.setAttribute("aria-checked", String(state.metric === "absolute"));
  els.metricPer1000.setAttribute("aria-checked", String(state.metric === "per1000"));
  els.metricTurnout.setAttribute("aria-checked", String(state.metric === "turnout"));
}

function setMetric(m) {
  if (state.metric === m) return;
  state.metric = m;
  syncMetricButtons();
  if (m !== "absolute" && !isPercapYear(state.year)) state.year = 2026;
  refreshYearButtons();
  update();
}

function setEntityByName(name) {
  const sc = scopeOf(name);
  if (sc === "hromada") state.mode = "hromada"; else if (sc === "city") state.mode = "city"; else if (sc === "villages") {
    state.mode = "villages";
    state.villageSel = CONFIG.AGG_VILLAGES;
  } else {
    state.mode = "villages";
    state.villageSel = name;
  }
  syncModeButtons();
  update();
}

const T = typeof window !== "undefined" && window.PB_TEXT || {};

function tpl(s, vars) {
  return String(s || "").replace(/\{(\w+)\}/g, (m, k) => k in vars ? vars[k] : m);
}

function applyStaticText() {
  if (els.overline) els.overline.textContent = T.overline || "";
  if (els.title) els.title.textContent = T.title || "";
  if (els.selectLabel && T.selectLabel) els.selectLabel.textContent = T.selectLabel;
  const noteVars = {
    withDistrict: fmtInt(DATA[CONFIG.AGG_HROMADA].all.submitted_total),
    total: fmtInt(META.reconciliation.window_total),
    noLocation: proj(noLocationCount())
  };
  els.noteList.innerHTML = (T.notes || []).map(n => `<li>${tpl(n, noteVars)}</li>`).join("");
  const mt = T.metrics || {};
  if (mt.absolute) els.metricAbsolute.textContent = mt.absolute.btn;
  if (mt.per1000) els.metricPer1000.textContent = mt.per1000.btn;
  if (mt.turnout) els.metricTurnout.textContent = mt.turnout.btn;
  syncMetricButtons();
}

function renderMap() {
  const W = CONFIG.VB_W;
  const projection = d3.geoMercator().fitWidth(W, geo);
  const path = d3.geoPath(projection);
  const H = Math.ceil(path.bounds(geo)[1][1]);
  const svg = d3.select(els.map).attr("viewBox", `0 0 ${W} ${H}`);
  svg.selectAll("*").remove();
  const g = svg.append("g");
  g.selectAll("path").data(geo.features).join("path").attr("class", "district").attr("d", path).attr("tabindex", 0).attr("role", "button").each(function(f) {
    pathById.set(f.properties.district, this);
  }).on("click", (_, f) => setEntityByName(f.properties.district)).on("keydown", (ev, f) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      setEntityByName(f.properties.district);
    }
  }).on("mousemove", (ev, f) => showMapTip(ev, f.properties.district)).on("mouseleave", hideTip).on("focus", (_, f) => showMapTipAtPath(f.properties.district)).on("blur", hideTip);
}

function metricValue(d, year) {
  if (state.metric === "absolute") return submittedOf(d, year);
  const a = adultsOf(d, year);
  if (!a) return null;
  if (state.metric === "per1000") return submittedOf(d, year) / a * 1e3;
  const people = cellOf(d, year).residents_voted?.people;
  return people == null ? null : people / a * 100;
}

function fmtMetric(v) {
  if (state.metric === "absolute") return fmtInt(v);
  if (state.metric === "per1000") return v.toFixed(v < 10 ? 1 : 0).replace(".", ",");
  return Math.round(v) + "%";
}

function buildMapScale() {
  const pool = state.mode === "villages" ? META.districts.filter(d => d !== CONFIG.CITY) : META.districts;
  let max = 0;
  for (const d of pool) {
    const v = metricValue(d, state.year);
    if (v != null) max = Math.max(max, v);
  }
  const sqrtScale = state.metric === "absolute";
  const dom = sqrtScale ? Math.sqrt(max || 1) : max || 1;
  mapScale = d3.scaleSequential(d3.interpolateRgbBasis(CONFIG.RAMP)).domain([ 0, dom ]);
  mapScale.max = max;
  mapScale.sqrt = sqrtScale;
}

function colorAt(v) {
  return mapScale(mapScale.sqrt ? Math.sqrt(v) : v);
}

function fillFor(d) {
  if (state.mode === "villages" && d === CONFIG.CITY) return CONFIG.GHOST_FILL;
  const v = metricValue(d, state.year);
  return v == null || v <= 0 ? CONFIG.EMPTY_FILL : colorAt(v);
}

function mapTipText(d) {
  const yr = state.year === "all" ? "за всі роки" : `у ${state.year}`;
  if (state.metric === "per1000") {
    const v = metricValue(d, state.year);
    return v == null ? "нема даних населення" : `${fmtMetric(v)} проєкта на 1000 дорослих (нас. ${state.year})`;
  }
  if (state.metric === "turnout") {
    const v = metricValue(d, state.year);
    return v == null ? "нема даних населення" : `явка ${fmtMetric(v)} (нас. ${state.year})`;
  }
  const v = submittedOf(d, state.year);
  const w = cellOf(d, state.year).won_total;
  if (v === 0) return `подань ${yr} немає`;
  return `подано ${proj(v)} ${yr}, виграло ${fmtInt(w)}`;
}

function showMapTip(ev, d) {
  const rect = els.mapWrap.getBoundingClientRect();
  positionTip(ev.clientX - rect.left, ev.clientY - rect.top, d, mapTipText(d));
}

function showMapTipAtPath(d) {
  const p = pathById.get(d);
  const rect = els.mapWrap.getBoundingClientRect();
  const b = p.getBoundingClientRect();
  positionTip(b.left - rect.left + b.width / 2, b.top - rect.top + b.height / 2, d, mapTipText(d));
}

function positionTip(x, y, name, val) {
  const t = els.tooltip;
  t.innerHTML = `<span class="tt-name">${name}</span><br><span class="tt-val">${val}</span>`;
  t.hidden = false;
  t.style.position = "absolute";
  const ww = els.mapWrap.clientWidth, wh = els.mapWrap.clientHeight;
  const tw = t.offsetWidth, th = t.offsetHeight;
  let tx = x + 14, ty = y + 14;
  if (tx + tw > ww) tx = x - tw - 14;
  if (tx < 0) tx = 0;
  if (ty + th > wh) ty = y - th - 14;
  t.style.left = tx + "px";
  t.style.top = ty + "px";
}

function hideTip() {
  els.tooltip.hidden = true;
}

function renderYearAxis() {
  els.yearAxis.innerHTML = "";
  for (const y of [ ...META.years, "all" ]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "year-btn" + (y === "all" ? " year-btn-all" : "");
    b.textContent = y === "all" ? "Усі роки" : y;
    b.dataset.year = y;
    b.setAttribute("aria-pressed", String(String(y) === String(state.year)));
    b.addEventListener("click", () => setYear(y));
    els.yearAxis.appendChild(b);
  }
  els.yearAxis.addEventListener("keydown", ev => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    const btns = [ ...els.yearAxis.children ];
    let i = btns.indexOf(document.activeElement);
    if (i < 0) i = btns.findIndex(b => String(b.dataset.year) === String(state.year));
    const step = ev.key === "ArrowLeft" ? -1 : 1;
    let j = i + step;
    while (j >= 0 && j < btns.length && btns[j].getAttribute("aria-disabled") === "true") j += step;
    if (j < 0 || j >= btns.length) return;
    setYear(btns[j].dataset.year);
    btns[j].focus();
  });
}

function yearGated(y) {
  return state.metric !== "absolute" && !(y !== "all" && isPercapYear(y));
}

function refreshYearButtons() {
  for (const b of els.yearAxis.children) {
    const y = b.dataset.year;
    const gated = yearGated(y);
    b.setAttribute("aria-disabled", String(gated));
    b.setAttribute("aria-pressed", String(String(y) === String(state.year)));
    b.title = gated ? T.gatedYearTitle || "" : "";
  }
}

function setYear(y) {
  if (yearGated(y)) return;
  state.year = y === "all" ? "all" : Number(y);
  refreshYearButtons();
  update();
}

function renderSelect() {
  els.districtSelect.addEventListener("change", () => setEntityByName(els.districtSelect.value));
  refreshSelect();
}

function refreshSelect() {
  const villages = META.districts.filter(d => d !== CONFIG.CITY).sort((a, b) => submittedOf(b, state.year) - submittedOf(a, state.year));
  const order = [ CONFIG.AGG_HROMADA, CONFIG.CITY, CONFIG.AGG_VILLAGES, ...villages ];
  els.districtSelect.innerHTML = "";
  const cur = entityName();
  for (const name of order) {
    const o = document.createElement("option");
    o.value = name;
    const n = submittedOf(name, state.year);
    o.textContent = `${name} — ${proj(n)}`;
    if (name === cur) o.selected = true;
    els.districtSelect.appendChild(o);
  }
}

function update() {
  buildMapScale();
  const cur = entityName();
  const selVillage = state.mode === "villages" && state.villageSel !== CONFIG.AGG_VILLAGES ? state.villageSel : null;
  for (const [d, p] of pathById) {
    p.setAttribute("fill", fillFor(d));
    p.setAttribute("aria-label", `${d}: ${mapTipText(d)}`);
    const ghost = state.mode === "villages" && d === CONFIG.CITY;
    const faded = state.mode === "city" && d !== CONFIG.CITY;
    p.classList.toggle("ghost", ghost);
    p.classList.toggle("faded", faded);
    let selected = false;
    if (state.mode === "city") selected = d === CONFIG.CITY; else if (selVillage) selected = d === selVillage;
    p.classList.toggle("is-selected", selected);
  }
  const selPath = pathById.get(state.mode === "city" ? CONFIG.CITY : selVillage);
  if (selPath) selPath.parentNode.appendChild(selPath);
  els.mapYear.textContent = state.year === "all" ? "усі\nроки" : state.year;
  const mt = T.metrics && T.metrics[state.metric] || {};
  els.legendTitle.textContent = mt.legend || "";
  if (state.metric === "absolute") {
    els.legendCap.textContent = state.mode === "villages" ? "лише села — місто не враховано у шкалі" : state.year === "all" ? "за всі роки (2020–2026)" : `у ${state.year} році`;
  } else {
    els.legendCap.textContent = `у ${state.year} · нас. ${state.year}`;
  }
  els.sceneCap.innerHTML = (mt.cap || "") + (state.mode === "villages" ? " " + (T.mapVillagesNote || "") : "");
  renderMapLegend();
  refreshSelect();
  renderPanel();
}

function renderMapLegend() {
  const W = 420, H = 38, barH = 12;
  const svg = d3.select(els.legendBar).attr("viewBox", `0 0 ${W} ${H}`);
  svg.selectAll("*").remove();
  const max = mapScale.max || 1;
  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "cpGrad");
  for (let i = 0; i <= 20; i++) grad.append("stop").attr("offset", `${i * 5}%`).attr("stop-color", colorAt(max * i / 20));
  svg.append("rect").attr("x", 0).attr("y", 2).attr("width", 26).attr("height", barH).attr("rx", 3).attr("fill", CONFIG.EMPTY_FILL).attr("stroke", "#E2E2E6");
  svg.append("text").attr("x", 13).attr("y", H - 4).attr("text-anchor", "middle").text("0");
  const gx = 38;
  svg.append("rect").attr("x", gx).attr("y", 2).attr("width", W - gx).attr("height", barH).attr("rx", 3).attr("fill", "url(#cpGrad)").attr("stroke", "#E2E2E6");
  const x = d3.scaleLinear().domain([ 0, max ]).range([ gx, W ]);
  let ticks;
  if (state.metric === "absolute") ticks = max <= 10 ? d3.range(1, max + 1) : x.ticks(5).filter(t => t > 0); else ticks = x.ticks(5).filter(t => t > 0);
  for (const t of ticks) {
    const tx = Math.min(Math.max(x(t), gx + 6), W - 6);
    svg.append("text").attr("x", tx).attr("y", H - 4).attr("text-anchor", t === ticks[ticks.length - 1] ? "end" : "middle").text(fmtMetric(t));
  }
}

function yrPhraseProj() {
  return state.year === "all" ? "за всі роки" : `у ${state.year}`;
}

function yrPhraseVote() {
  return state.year === "all" ? `за 2021${NDASH}2026` : `у ${state.year}`;
}

function scopeWord(scope) {
  return {
    city: "міста",
    village: "села",
    hromada: "громади",
    villages: "сіл"
  }[scope] || "громади";
}

function perCapitaLine(name, c) {
  const y = state.year;
  const a = adultsOf(name, y);
  if (y !== "all" && isPercapYear(y) && a) {
    const people = c.residents_voted ? c.residents_voted.people : null;
    const turnout = people != null ? fmtPct(people / a * 100, 1) : "—";
    const v = c.submitted_total / a * 1e3;
    const per1000 = v.toFixed(v < 10 ? 2 : 1).replace(".", ",");
    return `<p class="hero-percap">${tpl(T.cardPerCapita || "", {
      turnout,
      popYear: y,
      per1000
    })}</p>`;
  }
  return `<p class="hero-percap dim">${T.cardPerCapitaHint || ""}</p>`;
}

function renderPanel() {
  const name = entityName();
  const c = cellOf(name, state.year);
  const scope = scopeOf(name);
  const subWord = {
    city: "місто",
    village: "село",
    hromada: "вся громада",
    villages: "усі села (без міста)"
  }[scope];
  const P = [];
  P.push(`<h2 class="panel-title">${name}</h2>`);
  P.push(`<p class="panel-sub">${subWord} · Івано-Франківська МТГ · ${state.year === "all" ? "доба МТГ (2020–2026)" : state.year + " рік"}</p>`);
  P.push(`<div class="hero-row">\n    <div class="hero-stat"><span class="num">${fmtInt(c.submitted_total)}</span><span class="lab">подано проєктів</span></div>\n    <div class="hero-stat"><span class="num num-win">${fmtInt(c.won_total)}</span><span class="lab">виграло</span></div>\n  </div>`);
  if (scope === "city") P.push(`<p class="hero-note">+${proj(noLocationCount())} без прив'язки до місця — не на мапі.</p>`);
  P.push(perCapitaLine(name, c));
  P.push(`<div class="donuts">\n    ${donutBlock("Подані", c.submitted_by_cat, c.submitted_total, c.submitted_precat, "s")}\n    ${donutBlock("Переможні", c.won_by_cat, c.won_total, c.won_precat, "w")}\n  </div>`);
  P.push(categoryTable(c));
  P.push(votingSection(c, scope));
  els.panelBody.innerHTML = P.join("");
  wireDonutInteractions();
}

function donutBlock(title, byCat, total, precat, idp) {
  if (total < CONFIG.K) {
    const tail = state.year === "all" ? "" : ` <button type="button" class="inline-all" data-act="all">Перемкніть «Усі роки»</button>`;
    return `<div class="donut-block"><h3 class="donut-title">${title}</h3>\n      <p class="donut-fallback">${total === 0 ? "немає" : proj(total)} ${yrPhraseProj()} —\n      замало для розподілу за категоріями.${tail}</p></div>`;
  }
  let segs = [];
  let sum = 0;
  for (const cat of META.categories) {
    const n = byCat[cat.key];
    if (n) {
      segs.push({
        ...cat,
        n
      });
      sum += n;
    }
  }
  let maxIdx = 0;
  segs.forEach((s, i) => {
    if (s.n > segs[maxIdx].n) maxIdx = i;
  });
  segs = segs.slice(maxIdx).concat(segs.slice(0, maxIdx));
  const precatNote = precat > 0 ? `<p class="donut-precat">+${proj(precat)} без тематичної категорії</p>` : "";
  return `<div class="donut-block">\n    <h3 class="donut-title">${title}</h3>\n    ${donutSVG(segs, sum, idp)}${precatNote}</div>`;
}

function donutSVG(segs, sum, idp) {
  const W = 220, H = 68, R = 32, r = 21;
  const pie = d3.pie().value(s => s.n).sort(null).padAngle(.012);
  const arcs = pie(segs);
  const arc = d3.arc().innerRadius(r).outerRadius(R).cornerRadius(2);
  let s = `<svg class="donut-svg" viewBox="0 0 ${W} ${H}" role="img"\n    aria-label="${segs.map(x => `${x.label}: ${fmtInt(x.n)}`).join(", ")}">`;
  s += `<g transform="translate(${W / 2},${H / 2})">`;
  arcs.forEach((a, i) => {
    const pct = a.data.n / sum * 100;
    s += `<path class="donut-arc" d="${arc(a)}" fill="${a.data.color}" tabindex="0" role="img"\n      data-label="${a.data.label}" data-n="${a.data.n}" data-pct="${pct.toFixed(1)}"\n      aria-label="${a.data.label}: ${fmtInt(a.data.n)}, ${fmtPct(pct)}"></path>`;
  });
  s += `<text class="donut-center-n" text-anchor="middle" dy="-1">${fmtInt(sum)}</text>`;
  s += `<text class="donut-center-l" text-anchor="middle" dy="8">за категоріями</text>`;
  s += `</g></svg>`;
  return s;
}

function categoryTable(c) {
  const keys = new Set([ ...Object.keys(c.submitted_by_cat), ...Object.keys(c.won_by_cat) ]);
  if (!keys.size) return "";
  const rows = META.categories.filter(cat => keys.has(cat.key)).map(cat => {
    const sN = c.submitted_by_cat[cat.key] || 0;
    const wN = c.won_by_cat[cat.key] || 0;
    return `<tr><td class="cat-name-cell"><i class="cat-sw" style="background:${cat.color}"></i>${cat.label}</td>\n      <td class="num-s">${fmtInt(sN)}</td><td class="num-w">${fmtInt(wN)}</td></tr>`;
  }).join("");
  return `<table class="cat-table"><caption>Категорії</caption>\n    <thead><tr><th scope="col">Категорія</th><th scope="col">подано</th><th scope="col">виграло</th></tr></thead>\n    <tbody>${rows}</tbody></table>`;
}

function wireDonutInteractions() {
  els.panelBody.querySelectorAll(".donut-arc").forEach(p => {
    p.addEventListener("mousemove", ev => positionTipPage(ev.clientX, ev.clientY, p.dataset.label, donutTipText(p)));
    p.addEventListener("mouseleave", hideTip);
    p.addEventListener("focus", () => showDonutTipAtEl(p));
    p.addEventListener("blur", hideTip);
    p.addEventListener("click", () => showDonutTipAtEl(p, true));
  });
  els.panelBody.querySelectorAll('[data-act="all"]').forEach(b => b.addEventListener("click", () => setYear("all")));
}

function donutTipText(p) {
  return `${proj(+p.dataset.n)} · ${fmtPct(+p.dataset.pct, 1)}`;
}

function showDonutTipAtEl(p, tap) {
  const b = p.getBoundingClientRect();
  positionTipPage(b.left + b.width / 2, b.top, p.dataset.label, donutTipText(p));
  if (tap) {
    clearTimeout(tipTimer);
    tipTimer = setTimeout(hideTip, 2600);
  }
}

function positionTipPage(cx, cy, name, val) {
  const t = els.tooltip;
  t.innerHTML = `<span class="tt-name">${name}</span><br><span class="tt-val">${val}</span>`;
  t.hidden = false;
  t.style.position = "fixed";
  const tw = t.offsetWidth, th = t.offsetHeight;
  let tx = cx + 12, ty = cy + 12;
  if (tx + tw > window.innerWidth) tx = cx - tw - 12;
  if (ty + th > window.innerHeight) ty = cy - th - 12;
  t.style.left = Math.max(4, tx) + "px";
  t.style.top = Math.max(4, ty) + "px";
}

function splitBar(aVal, bVal, aCol, bCol, aLab, bLab) {
  if (aVal == null || bVal == null) {
    return `<p class="vote-empty">Розбивку приховано (замало даних, k${NBSP}≥${NBSP}5).</p>`;
  }
  const tot = aVal + bVal || 1;
  const pa = aVal / tot * 100, pb = bVal / tot * 100;
  return `<div class="split-bar" role="img" aria-label="${aLab} ${fmtInt(aVal)} (${fmtPct(pa, 1)}); ${bLab} ${fmtInt(bVal)} (${fmtPct(pb, 1)})">\n      <span class="seg" style="width:${pa}%;background:${aCol}"></span>\n      <span class="seg" style="width:${pb}%;background:${bCol}"></span></div>\n    <div class="split-cap">\n      <span><span class="sw" style="background:${aCol}"></span>${aLab} <b>${fmtInt(aVal)}</b> · ${fmtPct(pa, 1)}</span>\n      <span><span class="sw" style="background:${bCol}"></span>${bLab} <b>${fmtInt(bVal)}</b> · ${fmtPct(pb, 1)}</span></div>`;
}

function locLabels(scope) {
  if (scope === "city") return [ "мешканці міста", "з інших населених пунктів" ];
  if (scope === "village") return [ "мешканці села", "з інших населених пунктів" ];
  if (scope === "hromada") return [ "за свій НП", "за інший НП" ];
  return [ "мешканці того ж села", "з інших населених пунктів" ];
}

function votingSection(c, scope) {
  const rv = c.residents_voted, sp = c.support;
  if (!isVotingYear(state.year)) {
    return `<div class="vblock"><span class="vblock-tag">голосування</span>\n      <p class="vote-empty">${tpl(T.noVotesYear || "Дані голосувань ведуться з 2021 року.", {
      year: state.year
    })}</p></div>`;
  }
  let s = "";
  if (rv) {
    s += `<div class="vblock"><span class="vblock-tag">за проживанням</span>`;
    if (state.year === "all") {
      s += `<div class="vstat-row">\n        <div class="vstat"><span class="vnum">${fmtInt(rv.people_sum)}</span>\n          <span class="vlab">голосувань-людей за 2021${NDASH}2026 (сумарно по кампаніях)</span></div>\n        <div class="vstat"><span class="vnum">${fmtInt(rv.people)}</span>\n          <span class="vlab">унікальних виборців (різних людей)</span></div>\n        <div class="vstat"><span class="vnum vnum-votes">${fmtInt(rv.votes)}</span>\n          <span class="vlab">голосів подали (усіх кампаній)</span></div></div>`;
    } else {
      s += `<div class="vstat-row">\n        <div class="vstat"><span class="vnum">${fmtInt(rv.people)}</span>\n          <span class="vlab">унікальних виборців у ${state.year}</span></div>\n        <div class="vstat"><span class="vnum vnum-votes">${fmtInt(rv.votes)}</span>\n          <span class="vlab">голосів подали у ${state.year}</span></div></div>`;
    }
    s += splitBar(rv.F, rv.M, COL.f, COL.m, "жінки", "чоловіки");
    s += `</div>`;
  }
  if (sp) {
    const [inL, outL] = locLabels(scope);
    s += `<div class="vblock"><span class="vblock-tag tag-proj">за місцем проєкту</span>\n      <div class="vstat-row"><div class="vstat">\n        <span class="vnum">${fmtInt(sp.total)}</span>\n        <span class="vlab">голосів зібрали проєкти ${scopeWord(scope)} ${yrPhraseVote()}</span></div></div>\n      ${splitBar(sp.residents, sp.outsiders, COL.in, COL.out, inL, outL)}</div>`;
  } else {
    s += `<div class="vblock"><span class="vblock-tag tag-proj">за місцем проєкту</span>\n      <p class="vote-empty">Своїх проєктів у бюлетені ${yrPhraseVote()} не було.</p></div>`;
  }
  return s;
}
