"use strict";

const CONFIG = {
  chartH: 400,
  chartHNarrow: 330,
  padTop: 64,
  padBottom: 10,
  padX: 6,
  entryMs: 1e3,
  morphMs: 600
};

const YEARS = [ 2016, 2017, 2018, 2019, 2020, 2021, 2023, 2024, 2025, 2026 ];

const CATS = [ {
  key: "education-general",
  label: "Освіта",
  color: "#654EA3"
}, {
  key: "education-school",
  label: "Шкільні",
  color: "#4A2D87"
}, {
  key: "education-preschool",
  label: "Дошкільні",
  color: "#7B66B8"
}, {
  key: "education-extracurricular",
  label: "Позашкільні, профтехосвіта",
  color: "#9E5FAB"
}, {
  key: "improvement-general",
  label: "Благоустрій",
  color: "#2D6BAB"
}, {
  key: "improvement-streets",
  label: "Благоустрій малих вулиць",
  color: "#1A4F82"
}, {
  key: "heritage",
  label: "Архітектурна спадщина",
  color: "#A0571F"
}, {
  key: "greenery",
  label: "Зелені проєкти",
  color: "#3D7C3F"
}, {
  key: "afu-support",
  label: "Допомога ЗСУ",
  color: "#3F4049"
}, {
  key: "accessibility",
  label: "Доступність",
  color: "#0E7C8C"
}, {
  key: "other",
  label: "Інші проєкти",
  color: "#71737E"
}, {
  key: "uncategorized",
  label: "Без категоризації",
  color: "#CACAD1"
} ];

const CAT_BY_KEY = new Map(CATS.map(c => [ c.key, c ]));

const CAT_KEYS = CATS.map(c => c.key);

const MILESTONES = {
  2016: {
    flag: "старт",
    text: "Перший конкурс Бюджету участі: 80 «малих» проєктів, 2 090 голосів."
  },
  2018: {
    flag: null,
    text: "Поруч із «малими» вперше з'явилися «великі» проєкти."
  },
  2019: {
    flag: "перші категорії",
    text: "Перший тематичний поділ — «Освітні» та «Інші»; проєкти також ділилися на локальні й загальноміські."
  },
  2020: {
    flag: null,
    text: "Ковідний рік: рекордні 303 подання. У реєстрі збереглися лише голоси переможців, тому в режимі «голоси» смуга 2020 неповна."
  },
  2021: {
    flag: "розмір → тема",
    text: "Останній рік розмірного поділу (розмір × тема); вперше — «Об'єкти культурної спадщини». Восени розпочато перехід до чисто тематичної класифікації."
  },
  2023: {
    flag: "зелені",
    text: "Перший повоєнний конкурс — найкомпактніший за 10 років (137 подань). Чисто тематична класифікація; з'явилися «Зелені проєкти»."
  },
  2024: {
    flag: null,
    text: "Освіта розділилася на три гілки: шкільні, дошкільні та позашкільні."
  },
  2025: {
    flag: "ЗСУ поза конкурсом",
    text: "З'явилися «Допомога ЗСУ» і «Доступність». ЗСУ-проєкти 2025 відбиралися поза конкурсним голосуванням — у даних 0 голосів."
  },
  2026: {
    flag: null,
    text: "«Допомога ЗСУ» повернулась у конкурсне голосування й стала найбільшою категорією подань; повернулась і «Архітектурна спадщина»."
  }
};

const NBSP = " ";

const fmtInt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

const fmt1 = x => x.toFixed(1).replace(".", ",");

const fmtUah = n => {
  if (n == null) return "—";
  if (n >= 1e6) return `₴${fmt1(n / 1e6)}${NBSP}млн`;
  if (n >= 1e3) return `₴${fmtInt(Math.round(n / 1e3))}${NBSP}тис.`;
  return `₴${fmtInt(n)}`;
};

const plural = (n, forms) => {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
};

const votesWord = n => plural(n, [ "голос", "голоси", "голосів" ]);

const projWord = n => plural(n, [ "проєкт", "проєкти", "проєктів" ]);

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const state = {
  mode: "projects",
  year: null,
  cat: null
};

let DB = null;

let cell = null;

let sizeRows = null;

let totals = null;

let reducedMotion = false;

let entered = false;

const REF = {};

const cellKey = (y, c) => `${y}|${c}`;

const getCell = (y, c) => cell.get(cellKey(y, c)) || null;

const val = (y, c) => {
  const r = getCell(y, c);
  if (!r) return 0;
  return state.mode === "projects" ? r.projects : r.votes;
};

const yearRows = y => CATS.map(c => getCell(y, c.key)).filter(Boolean);

const yearTotal = (y, field) => yearRows(y).reduce((s, r) => s + r[field], 0);

const catYears = c => YEARS.filter(y => getCell(y, c));

window.addEventListener("DOMContentLoaded", async () => {
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    const resp = await fetch("data/priorities.json", {
      cache: "no-cache"
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    DB = await resp.json();
  } catch (e) {
    document.getElementById("loading").innerHTML = "Не вдалося завантажити дані віджета. Спробуйте оновити сторінку.";
    console.error(e);
    return;
  }
  cell = new Map(DB.by_year_category.map(r => [ cellKey(r.year, r.category), r ]));
  sizeRows = new Map;
  for (const r of DB.by_year_size) {
    if (!sizeRows.has(r.year)) sizeRows.set(r.year, []);
    sizeRows.get(r.year).push(r);
  }
  totals = {
    projects: DB.by_year_category.reduce((s, r) => s + r.projects, 0),
    votes: DB.by_year_category.reduce((s, r) => s + r.votes, 0)
  };
  document.getElementById("loading").hidden = true;
  buildAxis();
  buildLegend();
  bindMode();
  layout(true);
  renderPanel();
  let t = null;
  let lastW = document.getElementById("chartInner").clientWidth;
  new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => {
      const w = document.getElementById("chartInner").clientWidth;
      if (w !== lastW) {
        lastW = w;
        layout(false);
      }
    }, 150);
  }).observe(document.querySelector(".scene"));
  window.__pb = {
    ready: true,
    state,
    totals,
    yearTotal: y => ({
      projects: yearTotal(y, "projects"),
      votes: yearTotal(y, "votes")
    }),
    select,
    setMode,
    panelText: () => document.getElementById("panel").textContent
  };
});

function geom() {
  const inner = document.getElementById("chartInner");
  const W = inner.clientWidth;
  const narrow = window.innerWidth < 600;
  const H = narrow ? CONFIG.chartHNarrow : CONFIG.chartH;
  const step = (W - CONFIG.padX * 2) / YEARS.length;
  const x = y => CONFIG.padX + step * (YEARS.indexOf(y) + .5);
  return {
    W,
    H,
    step,
    x,
    narrow
  };
}

function layout(allowEntry) {
  const g = geom();
  const svg = d3.select("#stream").attr("viewBox", null).attr("width", g.W).attr("height", g.H);
  svg.selectAll("*").remove();
  const grid = YEARS.map(y => {
    const row = {
      year: y
    };
    for (const k of CAT_KEYS) row[k] = val(y, k);
    return row;
  });
  const series = d3.stack().keys(CAT_KEYS).value((d, k) => d[k]).offset(d3.stackOffsetSilhouette)(grid);
  let lo = 0, hi = 0;
  for (const s of series) for (const p of s) {
    lo = Math.min(lo, p[0]);
    hi = Math.max(hi, p[1]);
  }
  const y = d3.scaleLinear().domain([ lo, hi ]).range([ g.H - CONFIG.padBottom, CONFIG.padTop ]);
  const area = d3.area().x(d => g.x(d.data.year)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveMonotoneX);
  let clipUrl = null;
  if (allowEntry && !entered && !reducedMotion) {
    const rect = svg.append("clipPath").attr("id", "pbClip").append("rect").attr("x", 0).attr("y", 0).attr("height", g.H).attr("width", 0);
    rect.transition().duration(CONFIG.entryMs).ease(d3.easeCubicOut).attr("width", g.W);
    clipUrl = "url(#pbClip)";
  }
  entered = true;
  const layerG = svg.append("g");
  if (clipUrl) layerG.attr("clip-path", clipUrl);
  layerG.selectAll("path.layer").data(series, s => s.key).join("path").attr("class", "layer").attr("data-cat", s => s.key).attr("fill", s => CAT_BY_KEY.get(s.key).color).attr("d", area).on("pointermove", onLayerMove).on("pointerleave", onLayerLeave).on("click", onLayerClick);
  const flags = YEARS.filter(yy => MILESTONES[yy] && MILESTONES[yy].flag);
  let rowToggle = 0;
  for (const yy of flags) {
    const fx = g.x(yy);
    const rowY = rowToggle % 2 === 0 ? 14 : 32;
    rowToggle++;
    svg.append("circle").attr("class", "flag-dot").attr("cx", fx).attr("cy", rowY + 9).attr("r", 2.5);
    const anchor = yy === 2026 ? "end" : yy === 2016 ? "start" : "middle";
    const tx = yy === 2026 ? fx + 4 : yy === 2016 ? fx - 4 : fx;
    svg.append("text").attr("class", "flag-text").attr("x", tx).attr("y", rowY + 4).attr("text-anchor", anchor).text(MILESTONES[yy].flag);
    svg.append("line").attr("x1", fx).attr("x2", fx).attr("y1", rowY + 13).attr("y2", CONFIG.padTop - 16).attr("stroke", "#CACAD1").attr("stroke-width", 1);
  }
  REF.selG = svg.append("g");
  REF.geom = g;
  REF.yScale = y;
  REF.series = series;
  const axis = document.getElementById("yearAxis");
  axis.style.paddingLeft = CONFIG.padX + "px";
  axis.querySelectorAll(".year-btn").forEach(b => {
    b.style.width = g.step + "px";
  });
  applySelection();
}

function layerMidY(yearV, catK) {
  const s = REF.series.find(ss => ss.key === catK);
  if (!s) return null;
  const p = s[YEARS.indexOf(yearV)];
  if (!p || p[1] - p[0] === 0) return null;
  return REF.yScale((p[0] + p[1]) / 2);
}

function applySelection() {
  const {cat, year} = state;
  d3.selectAll("path.layer").classed("is-dimmed", s => cat ? s.key !== cat : false);
  const selG = REF.selG;
  selG.selectAll("*").remove();
  if (year) {
    const gx = REF.geom.x(year);
    selG.append("line").attr("class", "guide-line").attr("x1", gx).attr("x2", gx).attr("y1", CONFIG.padTop - 6).attr("y2", REF.geom.H - CONFIG.padBottom);
    if (cat) {
      const my = layerMidY(year, cat);
      if (my != null) {
        selG.append("circle").attr("class", "select-dot").attr("cx", gx).attr("cy", my).attr("r", 7);
      }
    }
  }
  document.querySelectorAll(".year-btn").forEach(b => {
    b.setAttribute("aria-pressed", String(Number(b.dataset.year) === year));
  });
  document.querySelectorAll(".leg-btn").forEach(b => {
    b.setAttribute("aria-pressed", String(b.dataset.cat === cat));
  });
}

function nearestYear(event) {
  const [xm] = d3.pointer(event, document.getElementById("stream"));
  let best = YEARS[0], dist = Infinity;
  for (const yy of YEARS) {
    const d = Math.abs(REF.geom.x(yy) - xm);
    if (d < dist) {
      dist = d;
      best = yy;
    }
  }
  return best;
}

function onLayerMove(event) {
  const catK = event.currentTarget.dataset.cat;
  const yy = nearestYear(event);
  d3.selectAll("path.layer").classed("is-dimmed", s => s.key !== catK);
  showTip(event, yy, catK);
}

function onLayerLeave() {
  hideTip();
  applySelection();
}

function onLayerClick(event) {
  const catK = event.currentTarget.dataset.cat;
  select(nearestYear(event), catK);
}

function showTip(event, yy, catK) {
  const c = CAT_BY_KEY.get(catK);
  const r = getCell(yy, catK);
  const tip = document.getElementById("tooltip");
  let valLine, note = "";
  if (!r) {
    valLine = `${yy} — категорії ще не існувало`;
  } else if (state.mode === "projects") {
    valLine = `${yy} · ${fmtInt(r.projects)} ${projWord(r.projects)}`;
    if (r.projects === 0) note = "була в бюлетені, подань не було";
  } else {
    valLine = `${yy} · ${fmtInt(r.votes)} ${votesWord(r.votes)}`;
    if (yy === 2020 && r.votes_unknown) note = "голоси відомі лише для переможців";
    if (catK === "afu-support" && yy === 2025) note = "фінансування поза голосуванням";
  }
  tip.innerHTML = `<div class="tt-head"><i class="leg-sw" style="background:${c.color}"></i>${esc(c.label)}</div>` + `<div class="tt-val">${valLine}</div>` + (note ? `<div class="tt-note">${esc(note)}</div>` : "");
  const pad = 12;
  let tx = event.clientX + pad, ty = event.clientY + pad;
  tip.classList.add("show");
  const r2 = tip.getBoundingClientRect();
  if (tx + r2.width > window.innerWidth - 8) tx = event.clientX - r2.width - pad;
  if (ty + r2.height > window.innerHeight - 8) ty = event.clientY - r2.height - pad;
  tip.style.left = tx + "px";
  tip.style.top = ty + "px";
}

function hideTip() {
  document.getElementById("tooltip").classList.remove("show");
}

function buildAxis() {
  const axis = document.getElementById("yearAxis");
  axis.innerHTML = "";
  for (const yy of YEARS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "year-btn";
    b.dataset.year = String(yy);
    b.textContent = String(yy);
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      if (state.year === yy && !state.cat) select(null, null); else select(yy, null);
    });
    b.addEventListener("keydown", e => {
      const i = YEARS.indexOf(yy);
      let j = null;
      if (e.key === "ArrowRight") j = Math.min(i + 1, YEARS.length - 1); else if (e.key === "ArrowLeft") j = Math.max(i - 1, 0); else if (e.key === "Home") j = 0; else if (e.key === "End") j = YEARS.length - 1;
      if (j != null) {
        e.preventDefault();
        const btn = axis.querySelectorAll(".year-btn")[j];
        btn.focus();
        select(YEARS[j], null);
      }
    });
    axis.appendChild(b);
  }
}

function buildLegend() {
  const leg = document.getElementById("legend");
  leg.innerHTML = "";
  for (const c of CATS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "leg-btn";
    b.dataset.cat = c.key;
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<i class="leg-sw" style="background:${c.color}"></i>${esc(c.label)}`;
    b.addEventListener("pointerenter", () => {
      d3.selectAll("path.layer").classed("is-dimmed", s => s.key !== c.key);
    });
    b.addEventListener("pointerleave", () => applySelection());
    b.addEventListener("focus", () => {
      d3.selectAll("path.layer").classed("is-dimmed", s => s.key !== c.key);
    });
    b.addEventListener("blur", () => applySelection());
    b.addEventListener("click", () => {
      if (state.cat === c.key && !state.year) select(null, null); else select(state.year, c.key);
    });
    leg.appendChild(b);
  }
}

function bindMode() {
  const bp = document.getElementById("modeProjects");
  const bv = document.getElementById("modeVotes");
  const set = m => () => setMode(m);
  bp.addEventListener("click", set("projects"));
  bv.addEventListener("click", set("votes"));
}

function setMode(m) {
  if (state.mode === m) return;
  state.mode = m;
  document.getElementById("modeProjects").setAttribute("aria-checked", String(m === "projects"));
  document.getElementById("modeVotes").setAttribute("aria-checked", String(m === "votes"));
  document.getElementById("capMode").textContent = m === "projects" ? "поданих проєктів" : "голосів за проєкти";
  layout(false);
  renderPanel();
}

function select(yy, catK) {
  state.year = yy;
  state.cat = catK;
  applySelection();
  renderPanel();
}

function renderPanel() {
  const panel = document.getElementById("panel");
  const {year, cat} = state;
  if (!year && !cat) panel.innerHTML = panelDecade(); else if (year && !cat) panel.innerHTML = panelYear(year); else if (!year && cat) panel.innerHTML = panelCat(cat); else panel.innerHTML = panelYearCat(year, cat);
  bindPanel();
}

function statBlock(num, lab) {
  return `<div class="stat"><span class="num">${num}</span><span class="lab">${lab}</span></div>`;
}

function panelDecade() {
  return `\n    <p class="panel-overline">10 конкурсів · 2016–2026</p>\n    <h2 class="panel-title">Десятиліття у проєктах</h2>\n    <div class="stat-pair">\n      ${statBlock(fmtInt(totals.projects), "проєктів подано")}\n      ${statBlock(fmtInt(totals.votes), "голосів у реєстрах")}\n    </div>\n    <p class="stat-note">Голоси 2020 відомі лише для переможців; у 2022 БУ не\n    проводився.</p>\n    <p class="panel-hint">Клікніть на стрічку, рік, назву категорії, щоб побачити різні деталі.</p>`;
}

function panelYear(yy) {
  const p = yearTotal(yy, "projects");
  const v = yearTotal(yy, "votes");
  const unknown = yearTotal(yy, "votes_unknown");
  const ms = MILESTONES[yy];
  const isEarly = yy <= 2018;
  let rows;
  if (isEarly) {
    rows = (sizeRows.get(yy) || []).map(r => `\n      <div class="size-row">\n        <span class="size-chip ${r.size === "great" ? "great" : ""}">${esc(r.size_uk)}</span>\n        <span>${fmtInt(r.projects)} ${projWord(r.projects)}</span>\n        <span class="size-val">${fmtInt(r.votes)} ${votesWord(r.votes)}</span>\n      </div>`).join("");
    rows = `<div class="panel-sec"><h3>Поділ за розміром</h3>\n      <p class="sec-cap">Тематичних категорій у ${yy} ще не було.</p>${rows}\n      ${topListHtml(yy, "uncategorized")}</div>`;
  } else {
    const yrRows = yearRows(yy).slice().sort((a, b) => state.mode === "projects" ? b.projects - a.projects : b.votes - a.votes);
    const maxV = Math.max(...yrRows.map(r => state.mode === "projects" ? r.projects : r.votes), 1);
    const items = yrRows.map(r => {
      const c = CAT_BY_KEY.get(r.category);
      const vv = state.mode === "projects" ? r.projects : r.votes;
      const zero = r.projects === 0;
      return `<li class="cat-item">\n        <button type="button" class="cat-btn" data-cat="${c.key}" data-year="${yy}">\n          <i class="leg-sw" style="background:${c.color}"></i>\n          <span class="cat-name ${zero ? "cat-zero" : ""}">${esc(c.label)}${zero ? " — подань не було" : ""}</span>\n          <span class="cat-bar"><i style="width:${Math.round(100 * vv / maxV)}%;background:${c.color}"></i></span>\n          <span class="cat-val">${fmtInt(vv)}</span>\n        </button>\n      </li>`;
    }).join("");
    rows = `<div class="panel-sec"><h3>Категорії року</h3>\n      <p class="sec-cap">Сортування за ${state.mode === "projects" ? "кількістю проєктів" : "голосами"};\n      клік — деталі категорії.</p>\n      <ul class="cat-list">${items}</ul></div>`;
  }
  return `\n    <p class="panel-overline">рік конкурсу · ${yy}</p>\n    <div class="stat-pair">\n      ${statBlock(fmtInt(p), "проєктів")}\n      ${statBlock(fmtInt(v), "голосів")}\n    </div>\n    ${unknown ? `<p class="stat-note">У ${yy} голоси записані лише для переможців\n      (${fmtInt(unknown)} ${projWord(unknown)} — без голосів у реєстрі).</p>` : ""}\n    ${ms ? `<div class="milestone"><span class="ms-tag">віха року</span>${esc(ms.text)}</div>` : ""}\n    ${rows}`;
}

function lifespanHtml(catK, selYear) {
  const c = CAT_BY_KEY.get(catK);
  const cells = YEARS.map(yy => {
    const r = getCell(yy, catK);
    const cls = r ? r.projects === 0 ? "life-cell zero" : "life-cell on" : "life-cell";
    const sel = yy === selYear ? " sel" : "";
    const t = r ? r.projects === 0 ? `${yy}: була в бюлетені, подань не було` : `${yy}: ${fmtInt(r.projects)} ${projWord(r.projects)}` : `${yy}: категорії не існувало`;
    return `<button type="button" class="${cls}${sel}" style="--cat:${c.color}"\n      data-cat="${catK}" data-year="${yy}" title="${esc(t)}" aria-label="${esc(t)}"></button>`;
  }).join("");
  const labels = YEARS.map(yy => `<span>${String(yy).slice(2)}</span>`).join("");
  return `<div class="lifespan">${cells}</div><div class="life-years">${labels}</div>`;
}

function topListHtml(yy, catK) {
  const items = (DB.top_projects[String(yy)] || {})[catK];
  if (!items || !items.length) return "";
  const c = CAT_BY_KEY.get(catK);
  const lis = items.map(p => {
    const votes = p.votes == null ? `<span>голоси не записані</span>` : `<span>${fmtInt(p.votes)}${NBSP}${votesWord(p.votes)}</span>`;
    const budget = p.budget_uah != null ? `<span>${fmtUah(p.budget_uah)}</span>` : "";
    return `<li style="--dot:${c.color}">\n      <div class="top-title">${esc(p.title)}</div>\n      <div class="top-meta">${votes}${budget}</div>\n    </li>`;
  }).join("");
  return `<div class="panel-sec"><h3>Топ-проєкти за голосами</h3>\n    <ul class="top-list">${lis}</ul></div>`;
}

function panelCat(catK) {
  const c = CAT_BY_KEY.get(catK);
  const ys = catYears(catK);
  const pSum = ys.reduce((s, yy) => s + getCell(yy, catK).projects, 0);
  const vSum = ys.reduce((s, yy) => s + getCell(yy, catK).votes, 0);
  const activeYs = ys.filter(yy => getCell(yy, catK).projects > 0);
  const range = activeYs.length ? `${activeYs[0]}–${activeYs[activeYs.length - 1]}` : "—";
  return `\n    <p class="panel-overline"><i class="leg-sw" style="background:${c.color}"></i>категорія</p>\n    <h2 class="panel-title">${esc(c.label)}</h2>\n    <div class="stat-pair">\n      ${statBlock(fmtInt(pSum), "проєктів за всі роки")}\n      ${statBlock(fmtInt(vSum), "голосів")}\n    </div>\n    <p class="stat-note">Роки з проєктами: ${range}.</p>\n    <div class="panel-sec"><h3>Життя категорії</h3>\n      <p class="sec-cap">Клік на клітинку року — деталі категорії в тому році.</p>\n      ${lifespanHtml(catK, null)}\n    </div>`;
}

function panelYearCat(yy, catK) {
  const c = CAT_BY_KEY.get(catK);
  const r = getCell(yy, catK);
  let body;
  if (!r) {
    body = `<p class="panel-hint">У ${yy} році цієї категорії ще не існувало.</p>`;
  } else if (catK === "uncategorized" && yy <= 2018) {
    const sizes = (sizeRows.get(yy) || []).map(sr => `\n      <div class="size-row">\n        <span class="size-chip ${sr.size === "great" ? "great" : ""}">${esc(sr.size_uk)}</span>\n        <span>${fmtInt(sr.projects)} ${projWord(sr.projects)}</span>\n        <span class="size-val">${fmtInt(sr.votes)} ${votesWord(sr.votes)}</span>\n      </div>`).join("");
    body = `\n      <div class="stat-pair">\n        ${statBlock(fmtInt(r.projects), "проєктів")}\n        ${statBlock(fmtInt(r.votes), "голосів")}\n      </div>\n      <p class="stat-note">Тематичних категорій у ${yy} ще не було — лише поділ\n      за розміром.</p>\n      <div class="panel-sec"><h3>Поділ за розміром</h3>${sizes}</div>\n      ${topListHtml(yy, catK)}`;
  } else {
    const zero = r.projects === 0;
    const notes = [];
    if (zero) notes.push("Категорія була в бюлетені, але подань не отримала.");
    if (yy === 2020 && r.votes_unknown) notes.push(`Голоси записані лише для переможців (${fmtInt(r.votes_unknown)} без голосів).`);
    if (catK === "afu-support" && yy === 2025) notes.push("Проєкти ЗСУ-2025 фінансувалися поза конкурсним голосуванням — 0 голосів у даних.");
    if (catK === "uncategorized" && yy === 2020) notes.push("8 проєктів 2020 не мають теми в сирому реєстрі — тему не приписуємо.");
    body = `\n      <div class="stat-pair">\n        ${statBlock(fmtInt(r.projects), "проєктів")}\n        ${statBlock(fmtInt(r.votes), "голосів")}\n        ${statBlock(fmtInt(r.winners), "переможців")}\n        ${statBlock(fmtUah(r.budget_uah), "сумарний бюджет")}\n      </div>\n      ${notes.map(n => `<p class="stat-note">${esc(n)}</p>`).join("")}\n      ${zero ? "" : topListHtml(yy, catK)}\n      <div class="panel-sec"><h3>Життя категорії</h3>${lifespanHtml(catK, yy)}</div>`;
  }
  return `\n    <button type="button" class="back-btn" data-back="${yy}">← до року ${yy}</button>\n    <p class="panel-overline"><i class="leg-sw" style="background:${c.color}"></i>${yy}</p>\n    <h2 class="panel-title">${esc(c.label)}</h2>\n    ${body}`;
}

function bindPanel() {
  const panel = document.getElementById("panel");
  panel.querySelectorAll(".cat-btn, .life-cell").forEach(b => {
    b.addEventListener("click", () => {
      select(Number(b.dataset.year), b.dataset.cat);
    });
  });
  panel.querySelectorAll(".back-btn").forEach(b => {
    b.addEventListener("click", () => select(Number(b.dataset.back), null));
  });
}
