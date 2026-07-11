"use strict";

const CONFIG = {
  VB_W: 820,
  PLAY_INTERVAL_MS: 1800,
  SEQ_STOPS: [ "#F6F4FB", "#EEEAF7", "#9C8BCC", "#7B66B8", "#4E3C84" ],
  CITY: "Івано-Франківськ",
  MTG: "Вся громада",
  DEFAULT_DISTRICT: "Березівка"
};

const NBSP = " ";

const fmtInt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

const fmtPct = (x, d = 1) => x.toFixed(d).replace(".", ",") + "%";

const state = {
  layer: "channel",
  channelBasis: "votes",
  year: 2021,
  selected: CONFIG.MTG,
  playing: false,
  playTimer: null
};

const els = {};

let M = null;

let geo = null;

let pathById = new Map;

let colorChannel, colorPeople, colorSex;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  [ "widget", "contextLine", "layerChannel", "layerSex", "channelBasis", "basisVotes", "basisPeople", "yearsBox", "yearAxis", "playBtn", "mapWrap", "map", "mapYear", "tooltip", "legendTitle", "legendCap", "legendBar", "panel", "districtSelect", "panelBody", "loading" ].forEach(id => els[id] = document.getElementById(id));
  try {
    const [dd, gj] = await Promise.all([ fetch("data/digital_divide.json", {
      cache: "no-cache"
    }).then(r => r.json()), fetch("data/communities.geojson", {
      cache: "no-cache"
    }).then(r => r.json()) ]);
    geo = gj;
    M = buildModel(dd);
  } catch (e) {
    els.loading.innerHTML = "Не вдалося завантажити дані віджета.";
    throw e;
  }
  buildScales();
  renderContextLine();
  renderMap();
  renderYearAxis();
  renderSelect();
  bindControls();
  update();
  els.loading.hidden = true;
}

function buildModel(dd) {
  const byD = new Map;
  for (const d of dd.meta.districts) {
    byD.set(d, {
      votes: new Map,
      people: null,
      migration: null,
      sex: null
    });
  }
  for (const r of dd.votes) byD.get(r.district).votes.set(r.year, r);
  for (const r of dd.people) {
    const e = byD.get(r.district);
    e.people = r;
    e.channel_by_sex = r.channel_by_sex;
  }
  for (const r of dd.migration) byD.get(r.district).migration = r;
  for (const r of dd.sex) byD.get(r.district).sex = r;
  const t = dd.meta.totals;
  const mtg = {
    votes: new Map(t.votes.map(r => [ r.year, r ])),
    people: t.people,
    migration: t.migration,
    sex: t.sex,
    channel_by_sex: t.channel_by_sex
  };
  const years = dd.meta.years;
  const recOf = d => d === CONFIG.MTG ? mtg : byD.get(d);
  const paperPct = (d, y) => {
    const v = recOf(d).votes.get(y);
    return v ? v.paper / (v.paper + v.electronic) * 100 : null;
  };
  const paperPctAll = d => {
    let e = 0, p = 0;
    for (const v of recOf(d).votes.values()) {
      e += v.electronic;
      p += v.paper;
    }
    return p / (e + p) * 100;
  };
  const cnapPeoplePct = d => {
    const pr = recOf(d).people;
    const tot = (pr.only_online ?? 0) + (pr.only_paper ?? 0) + (pr.mixed ?? 0);
    const cnap = (pr.only_paper ?? 0) + (pr.mixed ?? 0);
    return tot ? cnap / tot * 100 : null;
  };
  const femalePct = d => {
    const s = recOf(d).sex;
    return s.F / (s.F + s.M) * 100;
  };
  return {
    meta: dd.meta,
    years,
    recOf,
    paperPct,
    paperPctAll,
    cnapPeoplePct,
    femalePct
  };
}

function buildScales() {
  let maxP = 0;
  for (const d of M.meta.districts) for (const y of M.years) maxP = Math.max(maxP, M.paperPct(d, y));
  const topP = Math.ceil(maxP / 5) * 5;
  colorChannel = d3.scaleSequential(d3.interpolateRgbBasis(CONFIG.SEQ_STOPS)).domain([ 0, topP ]);
  colorChannel.top = topP;
  const peopleVals = M.meta.districts.map(d => M.cnapPeoplePct(d));
  const topPeople = Math.ceil(d3.max(peopleVals) / 5) * 5;
  colorPeople = d3.scaleSequential(d3.interpolateRgbBasis(CONFIG.SEQ_STOPS)).domain([ 0, topPeople ]);
  colorPeople.top = topPeople;
  const sexVals = M.meta.districts.map(d => M.femalePct(d));
  const lo = Math.floor(d3.min(sexVals));
  const hi = Math.ceil(d3.max(sexVals));
  colorSex = d3.scaleSequential(d3.interpolateRgbBasis(CONFIG.SEQ_STOPS.slice(0, 4))).domain([ lo, hi ]);
  colorSex.lo = lo;
  colorSex.hi = hi;
}

function metricOf(d) {
  if (state.layer === "sex") return M.femalePct(d);
  return state.channelBasis === "people" ? M.cnapPeoplePct(d) : M.paperPct(d, state.year);
}

function colorOf(d) {
  if (state.layer === "sex") return colorSex(metricOf(d));
  return state.channelBasis === "people" ? colorPeople(metricOf(d)) : colorChannel(metricOf(d));
}

function renderContextLine() {
  const cityAll = M.paperPctAll(CONFIG.CITY);
  let maxD = null, maxV = -1;
  for (const d of M.meta.districts) {
    if (d === CONFIG.CITY) continue;
    const v = M.paperPctAll(d);
    if (v > maxV) {
      maxV = v;
      maxD = d;
    }
  }
  els.contextLine.innerHTML = `За всі кампанії 2021–2026 місто подало через ЦНАП лише <strong>${fmtPct(cityAll)}</strong> ` + `голосів, а ${maxD} найбільше — <strong>${fmtPct(maxV)}</strong>. Натискайте на ` + `населений пункт на мапі, щоб побачити його цифрову історію.`;
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
  }).on("click", (_, f) => selectDistrict(f.properties.district)).on("keydown", (ev, f) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      selectDistrict(f.properties.district);
    }
  }).on("mousemove", (ev, f) => showTooltip(ev, f.properties.district)).on("mouseleave", hideTooltip).on("focus", (_, f) => showTooltipAtPath(f.properties.district)).on("blur", hideTooltip);
}

function showTooltip(ev, d) {
  const rect = els.mapWrap.getBoundingClientRect();
  positionTooltip(ev.clientX - rect.left, ev.clientY - rect.top, d);
}

function showTooltipAtPath(d) {
  const p = pathById.get(d);
  const rect = els.mapWrap.getBoundingClientRect();
  const b = p.getBoundingClientRect();
  positionTooltip(b.left - rect.left + b.width / 2, b.top - rect.top + b.height / 2, d);
}

function positionTooltip(x, y, d) {
  const t = els.tooltip;
  t.innerHTML = `<span class="tt-name">${d}</span><br><span class="tt-val">${tooltipText(d)}</span>`;
  t.hidden = false;
  const wrapW = els.mapWrap.clientWidth;
  const tw = t.offsetWidth, th = t.offsetHeight;
  let tx = x + 14, ty = y + 14;
  if (tx + tw > wrapW) tx = x - tw - 14;
  if (tx < 0) tx = 0;
  if (ty + th > els.mapWrap.clientHeight) ty = y - th - 14;
  t.style.left = tx + "px";
  t.style.top = ty + "px";
}

function hideTooltip() {
  els.tooltip.hidden = true;
}

function tooltipText(d) {
  if (state.layer === "sex") {
    const s = M.recOf(d).sex;
    return `${fmtPct(M.femalePct(d))} жінок серед ${fmtInt(s.F + s.M)} виборців (усі кампанії)`;
  }
  if (state.channelBasis === "people") {
    const pr = M.recOf(d).people;
    const tot = (pr.only_online ?? 0) + (pr.only_paper ?? 0) + (pr.mixed ?? 0);
    const cnap = (pr.only_paper ?? 0) + (pr.mixed ?? 0);
    return `${fmtPct(M.cnapPeoplePct(d))} виборців хоч раз через ЦНАП ` + `(${fmtInt(cnap)} з ${fmtInt(tot)})`;
  }
  const v = M.recOf(d).votes.get(state.year);
  return `${fmtPct(M.paperPct(d, state.year))} через ЦНАП у ${state.year} ` + `(${fmtInt(v.paper)} з ${fmtInt(v.paper + v.electronic)} голосів)`;
}

function ariaLabelOf(d) {
  return `${d}: ${tooltipText(d)}`;
}

function renderYearAxis() {
  els.yearAxis.innerHTML = "";
  for (const y of M.years) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "year-btn";
    b.textContent = y;
    b.setAttribute("aria-pressed", String(y === state.year));
    b.addEventListener("click", () => {
      stopPlay();
      setYear(y);
    });
    els.yearAxis.appendChild(b);
  }
  els.yearAxis.addEventListener("keydown", ev => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    const i = M.years.indexOf(state.year);
    const j = ev.key === "ArrowLeft" ? Math.max(0, i - 1) : Math.min(M.years.length - 1, i + 1);
    stopPlay();
    setYear(M.years[j]);
    els.yearAxis.children[j].focus();
  });
}

function renderSelect() {
  els.districtSelect.addEventListener("change", () => {
    selectDistrict(els.districtSelect.value, {
      fromSelect: true
    });
  });
  refreshSelect();
}

function refreshSelect() {
  const sorted = [ ...M.meta.districts ].sort((a, b) => metricOf(b) - metricOf(a));
  const order = [ CONFIG.MTG, ...sorted ];
  els.districtSelect.innerHTML = "";
  for (const d of order) {
    const o = document.createElement("option");
    o.value = d;
    o.textContent = `${d} — ${fmtPct(metricOf(d))}`;
    if (d === state.selected) o.selected = true;
    els.districtSelect.appendChild(o);
  }
}

function bindControls() {
  els.layerChannel.addEventListener("click", () => setLayer("channel"));
  els.layerSex.addEventListener("click", () => setLayer("sex"));
  els.basisVotes.addEventListener("click", () => setBasis("votes"));
  els.basisPeople.addEventListener("click", () => setBasis("people"));
  els.playBtn.addEventListener("click", () => state.playing ? stopPlay() : startPlay());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPlay();
  });
}

function setLayer(layer) {
  if (state.layer === layer) return;
  state.layer = layer;
  stopPlay();
  const isCh = layer === "channel";
  els.layerChannel.setAttribute("aria-checked", String(isCh));
  els.layerSex.setAttribute("aria-checked", String(!isCh));
  els.channelBasis.hidden = !isCh;
  setYearsEnabled(isCh && state.channelBasis === "votes");
  update();
}

function setBasis(basis) {
  if (state.channelBasis === basis) return;
  state.channelBasis = basis;
  stopPlay();
  els.basisVotes.setAttribute("aria-checked", String(basis === "votes"));
  els.basisPeople.setAttribute("aria-checked", String(basis === "people"));
  setYearsEnabled(basis === "votes");
  update();
}

function setYearsEnabled(on) {
  els.yearsBox.setAttribute("aria-disabled", String(!on));
  els.playBtn.disabled = !on;
  for (const b of els.yearAxis.children) b.disabled = !on;
}

function setYear(y) {
  state.year = y;
  [ ...els.yearAxis.children ].forEach((b, i) => b.setAttribute("aria-pressed", String(M.years[i] === y)));
  update();
}

function startPlay() {
  state.playing = true;
  els.playBtn.setAttribute("aria-pressed", "true");
  els.playBtn.textContent = "⏸";
  els.playBtn.setAttribute("aria-label", "Пауза");
  state.playTimer = setInterval(() => {
    const i = M.years.indexOf(state.year);
    setYear(M.years[(i + 1) % M.years.length]);
  }, CONFIG.PLAY_INTERVAL_MS);
}

function stopPlay() {
  if (!state.playing) return;
  state.playing = false;
  clearInterval(state.playTimer);
  els.playBtn.setAttribute("aria-pressed", "false");
  els.playBtn.textContent = "▶";
  els.playBtn.setAttribute("aria-label", "Програти роки підряд");
}

function selectDistrict(d, opts = {}) {
  state.selected = d;
  if (!opts.fromSelect) els.districtSelect.value = d;
  update();
}

function update() {
  for (const [d, p] of pathById) {
    p.setAttribute("fill", colorOf(d));
    p.setAttribute("aria-label", ariaLabelOf(d));
    p.classList.toggle("is-selected", d === state.selected);
  }
  const sel = pathById.get(state.selected);
  if (sel) sel.parentNode.appendChild(sel);
  if (state.layer === "channel" && state.channelBasis === "votes") {
    els.mapYear.textContent = state.year;
  } else {
    els.mapYear.textContent = "2021–2026";
  }
  renderLegend();
  refreshSelect();
  renderPanel();
}

function renderLegend() {
  let scale, title, cap;
  if (state.layer === "sex") {
    scale = colorSex;
    title = "Жінки серед виборців";
    cap = `людей за всі кампанії; розкид між громадами невеликий — шкала охоплює ` + `лише ${colorSex.lo}–${colorSex.hi}%`;
  } else if (state.channelBasis === "people") {
    scale = colorPeople;
    title = "Виборці у ЦНАПі";
    cap = "частка людей, які хоч раз голосували через ЦНАП";
  } else {
    scale = colorChannel;
    title = "Голоси через ЦНАП";
    cap = `частка голосів громади у ${state.year} році`;
  }
  els.legendTitle.textContent = title;
  els.legendCap.textContent = cap;
  const [lo, hi] = scale.domain();
  const W = 420, H = 34, barH = 12;
  const svg = d3.select(els.legendBar).attr("viewBox", `0 0 ${W} ${H}`);
  svg.selectAll("*").remove();
  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "legGrad");
  for (let i = 0; i <= 20; i++) {
    grad.append("stop").attr("offset", `${i * 5}%`).attr("stop-color", scale(lo + (hi - lo) * i / 20));
  }
  svg.append("rect").attr("x", 0).attr("y", 2).attr("width", W).attr("height", barH).attr("rx", 3).attr("fill", "url(#legGrad)").attr("stroke", "#E2E2E6");
  const x = d3.scaleLinear().domain([ lo, hi ]).range([ 0, W ]);
  const ticks = state.layer === "sex" ? x.ticks(5) : x.ticks(6);
  for (const t of ticks) {
    const tx = Math.min(Math.max(x(t), 8), W - 8);
    svg.append("text").attr("x", tx).attr("y", H - 4).attr("text-anchor", t === lo ? "start" : t === hi ? "end" : "middle").text(`${t}%`);
  }
}

function renderPanel() {
  const d = state.selected;
  const rec = M.recOf(d);
  const isMtg = d === CONFIG.MTG;
  const isCity = d === CONFIG.CITY;
  const parts = [];
  parts.push(`<h2 class="panel-title">${d}</h2>`);
  const sub = isMtg ? "усі 19 населених пунктів · Івано-Франківська МТГ" : `${isCity ? "місто" : "село"} · Івано-Франківська МТГ`;
  parts.push(`<p class="panel-sub">${sub}</p>`);
  if (state.layer === "sex") {
    parts.push(heroSex(d, rec));
  } else if (state.channelBasis === "people") {
    parts.push(heroPeople(d, rec));
  } else {
    parts.push(heroVotes(d, rec));
  }
  parts.push(sectionSpark(d));
  parts.push(sectionProfile(rec));
  parts.push(sectionChannelBySex(rec));
  parts.push(sectionMigration(rec));
  els.panelBody.innerHTML = parts.join("");
}

function heroVotes(d, rec) {
  const v = rec.votes.get(state.year);
  return `<div class="hero-stat hero-channel"><span class="num">${fmtPct(M.paperPct(d, state.year))}</span>` + `<span class="lab">голосів через ЦНАП у ${state.year} (${fmtInt(v.paper)} ` + `з ${fmtInt(v.paper + v.electronic)})</span></div>`;
}

function heroPeople(d, rec) {
  const pr = rec.people;
  const tot = (pr.only_online ?? 0) + (pr.only_paper ?? 0) + (pr.mixed ?? 0);
  const cnap = (pr.only_paper ?? 0) + (pr.mixed ?? 0);
  return `<div class="hero-stat hero-channel"><span class="num">${fmtPct(M.cnapPeoplePct(d))}</span>` + `<span class="lab">виборців хоч раз голосували через ЦНАП за всі кампанії ` + `(${fmtInt(cnap)} з ${fmtInt(tot)})</span></div>`;
}

function heroSex(d, rec) {
  const s = rec.sex;
  return `<div class="hero-stat hero-sex"><span class="num">${fmtPct(M.femalePct(d))}</span>` + `<span class="lab">жінок серед ${fmtInt(s.F + s.M)} виборців за всі кампанії</span></div>`;
}

function sectionSpark(d) {
  return `<div class="panel-sec"><h3>Шлях в онлайн</h3>\n    <p class="sec-cap">частка голосів через ЦНАП за кампаніями</p>\n    ${sparklineSVG(d)}</div>`;
}

function sectionProfile(rec) {
  const pr = rec.people;
  const tot = [ "only_online", "only_paper", "mixed" ].reduce((s, k) => s + (pr[k] ?? 0), 0);
  const segW = k => pr[k] == null ? 0 : pr[k] / tot * 100;
  const valTxt = k => pr[k] == null ? "<5" : fmtInt(pr[k]);
  return `<div class="panel-sec"><h3>Люди та їхній канал (за всі кампанії разом)</h3>\n    <p class="sec-cap">${fmtInt(tot)} виборців за всі кампанії — яким каналом користувались</p>\n    <div class="profile-bar" role="img" aria-label="Лише онлайн: ${valTxt("only_online")}, лише ЦНАП: ${valTxt("only_paper")}, змішані: ${valTxt("mixed")}">\n      <span class="seg seg-online" style="width:${segW("only_online")}%"></span>\n      <span class="seg seg-paper" style="width:${segW("only_paper")}%"></span>\n      <span class="seg seg-mixed" style="width:${segW("mixed")}%"></span>\n    </div>\n    <ul class="profile-legend">\n      <li><i class="pl-sw pl-online"></i>лише онлайн (BankID)<span class="val">${valTxt("only_online")}</span></li>\n      <li><i class="pl-sw pl-paper"></i>лише ЦНАП<span class="val">${valTxt("only_paper")}</span></li>\n      <li><i class="pl-sw pl-mixed"></i>змішані<span class="val">${valTxt("mixed")}</span></li>\n    </ul></div>`;
}

function sectionChannelBySex(rec) {
  const c = rec.channel_by_sex;
  const row = (sx, lab, cls) => {
    const cell = c[sx];
    if (!cell || cell.total == null) {
      return `<div class="cbs-row"><span class="cbs-lab">${lab}</span>` + `<span class="cbs-na">надто мало даних</span></div>`;
    }
    const pct = cell.cnap_ever / cell.total * 100;
    return `<div class="cbs-row"><span class="cbs-lab">${lab}</span>` + `<div class="cbs-track"><span class="cbs-fill ${cls}" style="width:${pct}%"></span></div>` + `<span class="cbs-val">${fmtPct(pct)}</span></div>`;
  };
  return `<div class="panel-sec"><h3>Канал × стать</h3>\n    <p class="sec-cap">частка людей, які хоч раз голосували через ЦНАП</p>\n    ${row("F", "жінки", "f")}${row("M", "чоловіки", "m")}</div>`;
}

function sectionMigration(rec) {
  const mg = rec.migration;
  const migNum = k => mg[k] == null ? `<span class="num dim">надто мало даних</span>` : `<span class="num">${fmtInt(mg[k])}</span>`;
  return `<div class="panel-sec"><h3>Міграція між каналами</h3>\n    <p class="sec-cap">люди з 2+ кампаніями: канал першого року → останнього року,\n    проміжні кампанії не враховано</p>\n    <div class="mig-grid">\n      <div class="mig-card">${migNum("paper_to_online")}<span class="lab">ЦНАП → онлайн</span></div>\n      <div class="mig-card">${migNum("online_to_paper")}<span class="lab">онлайн → ЦНАП</span></div>\n    </div></div>`;
}

function sparklineSVG(d) {
  const W = 300, H = 96, padL = 20, padR = 20, padT = 18, padB = 18;
  const years = M.years;
  const vals = years.map(y => M.paperPct(d, y));
  const x = d3.scalePoint().domain(years).range([ padL, W - padR ]);
  const yMax = Math.max(colorChannel.top, 10);
  const y = d3.scaleLinear().domain([ 0, yMax ]).range([ H - padB, padT ]);
  const line = d3.line().x((_, i) => x(years[i])).y(v => y(v));
  const liveYear = state.layer === "channel" && state.channelBasis === "votes";
  let s = `<svg class="spark-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${years.map((yy, i) => `${yy}: ${fmtPct(vals[i])}`).join(", ")}">`;
  s += `<path class="spark-line" d="${line(vals)}"></path>`;
  years.forEach((yy, i) => {
    const cur = liveYear && yy === state.year;
    s += `<circle class="spark-dot${cur ? " is-current" : ""}" cx="${x(yy)}" cy="${y(vals[i])}" r="${cur ? 5 : 3.5}"></circle>`;
    s += `<text class="spark-val" x="${x(yy)}" y="${y(vals[i]) - 9}" text-anchor="middle">${Math.round(vals[i])}%</text>`;
    s += `<text x="${x(yy)}" y="${H - 4}" text-anchor="middle">${yy}</text>`;
  });
  s += `</svg>`;
  return s;
}
