"use strict";

const CONFIG = {
  ink: "#1A1A1A",
  canvas: "#FDFDFD",
  n50: "#F7F7F8",
  n300: "#CACAD1",
  n400: "#9FA0A9",
  n500: "#71737E",
  n700: "#3F4049",
  p500: "#654EA3",
  sexF: "#9C8BCC",
  sexM: "#4E3C84",
  chartH: 320,
  chartHNarrow: 230,
  padTop: 46,
  padBottom: 26,
  dur: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700
};

const COHORT_COLOR = {
  2021: "#4E3C84",
  2023: "#654EA3",
  2024: "#7B66B8",
  2025: "#9C8BCC",
  2026: "#EEEAF7"
};

const COHORT_STROKE = {
  2025: "rgba(26,26,26,0.18)",
  2026: "rgba(26,26,26,0.25)"
};

const YEARS = [ 2021, 2023, 2024, 2025, 2026 ];

const SLOTS = [ 2021, 2023, 2024, 2025, 2026 ];

const NBSP = " ";

const fmtInt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

const fmtPct = (x, d = 1) => x.toFixed(d).replace(".", ",") + "%";

const plural = (n, forms) => {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
};

const CAMP = [ "кампанія", "кампанії", "кампаній" ];

const PEOPLE = [ "людина", "людини", "людей" ];

const NUM_GEN = {
  2: "двох",
  3: "трьох",
  4: "чотирьох",
  5: "п'яти"
};

const NUM_NOM = {
  2: "дві",
  3: "три",
  4: "чотири",
  5: "п'ять"
};

const state = {
  sel: null,
  hover: null,
  rung: 5
};

let DB = null;

let yearTotal = null;

let MAXTOTAL = 0;

let countUpDone = false;

function countUp(el, target, delay = 0) {
  if (CONFIG.dur === 0 || target < 100) {
    el.textContent = fmtInt(target);
    return;
  }
  const T = 1e3;
  let start = null;
  const step = ts => {
    if (start === null) start = ts;
    const k = Math.min((ts - start - delay) / T, 1);
    if (k < 0) {
      requestAnimationFrame(step);
      return;
    }
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmtInt(Math.round(target * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const resp = await fetch("data/cohorts.json");
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    DB = await resp.json();
  } catch (e) {
    document.getElementById("loading").innerHTML = "Не вдалося завантажити дані віджета. Спробуйте оновити сторінку.";
    console.error(e);
    return;
  }
  yearTotal = new Map(YEARS.map(y => [ y, DB.composition.filter(r => r.year === y).reduce((s, r) => s + r.people, 0) ]));
  MAXTOTAL = Math.max(...yearTotal.values());
  document.getElementById("loading").hidden = true;
  buildLegend();
  buildLadder();
  drawRiver(true);
  renderPanel();
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      hideTip();
      if (state.sel !== null) selectCohort(null);
    }
  });
  let t = null;
  new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => {
      hideTip();
      drawRiver(false);
      renderPanel();
    }, 150);
  }).observe(document.querySelector(".scene"));
});

function buildLegend() {
  const lg = document.getElementById("legend");
  lg.innerHTML = `<span class="cap">колір шару — рік першої участі</span>` + YEARS.map(c => `<span class="legend-item"><i class="sw" style="background:${COHORT_COLOR[c]}"></i>${c}</span>`).join("");
}

function geom() {
  const scene = document.querySelector(".scene");
  const W = scene.clientWidth;
  const m = {
    l: 4,
    r: 4
  };
  const weights = SLOTS.map(() => 1);
  const unit = (W - m.l - m.r) / weights.reduce((a, b) => a + b, 0);
  const x0 = [];
  let acc = m.l;
  weights.forEach(w => {
    x0.push(acc);
    acc += w * unit;
  });
  const cx = slotIdx => x0[slotIdx] + weights[slotIdx] * unit / 2;
  const H = W < 600 ? CONFIG.chartHNarrow : CONFIG.chartH;
  const colW = Math.min(unit * .72, 104);
  return {
    W,
    m,
    unit,
    H,
    cx,
    colW
  };
}

function drawRiver(animate) {
  const g = geom();
  const H = g.H;
  const totalH = CONFIG.padTop + H + CONFIG.padBottom;
  const baseline = CONFIG.padTop + H;
  const hOf = n => n / MAXTOTAL * H;
  const svg = d3.select("#river").attr("width", g.W).attr("height", totalH).attr("viewBox", `0 0 ${g.W} ${totalH}`);
  const segs = [];
  YEARS.forEach(y => {
    let cum = 0;
    YEARS.filter(c => c <= y).forEach(c => {
      const row = DB.composition.find(r => r.year === y && r.cohort === c);
      if (!row) return;
      segs.push({
        year: y,
        cohort: c,
        people: row.people,
        slot: SLOTS.indexOf(y),
        y0: cum,
        y1: cum + row.people,
        pctYear: 100 * row.people / yearTotal.get(y)
      });
      cum += row.people;
    });
  });
  const t = svg.transition().duration(animate ? CONFIG.dur : 0).ease(d3.easeCubicOut);
  let base = svg.selectAll("line.base").data([ 1 ]);
  base = base.enter().append("line").attr("class", "base").merge(base);
  base.attr("x1", g.m.l).attr("x2", g.W - g.m.r).attr("y1", baseline + .5).attr("y2", baseline + .5).attr("stroke", CONFIG.n300).attr("stroke-width", 1);
  const segSel = svg.selectAll("rect.seg").data(segs, d => d.year + "-" + d.cohort);
  const segEnter = segSel.enter().append("rect").attr("class", "seg").attr("tabindex", 0).attr("role", "button").attr("y", baseline).attr("height", 0).on("pointerenter", (e, d) => {
    state.hover = d.cohort;
    paint();
    showTip(e, d);
  }).on("pointermove", (e, d) => showTip(e, d)).on("pointerleave", () => {
    state.hover = null;
    paint();
    hideTip();
  }).on("focus", (e, d) => {
    state.hover = d.cohort;
    paint();
    showTipAt(d);
  }).on("blur", () => {
    state.hover = null;
    paint();
    hideTip();
  }).on("click", (e, d) => selectCohort(state.sel === d.cohort ? null : d.cohort)).on("keydown", (e, d) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectCohort(state.sel === d.cohort ? null : d.cohort);
    }
  });
  const segAll = segEnter.merge(segSel);
  segAll.attr("x", d => g.cx(d.slot) - g.colW / 2).attr("width", g.colW).attr("fill", d => COHORT_COLOR[d.cohort]).attr("aria-label", d => segAria(d)).attr("aria-pressed", d => String(state.sel === d.cohort));
  segAll.transition(t).delay(d => animate ? SLOTS.indexOf(d.year) * 60 : 0).attr("y", d => baseline - hOf(d.y1)).attr("height", d => Math.max(hOf(d.people) - 0, 0));
  const labels = YEARS.map(y => {
    const total = yearTotal.get(y);
    const nv = DB.loyalty.new_vs_repeat.find(r => r.year === y);
    return {
      y,
      slot: SLOTS.indexOf(y),
      total,
      newPct: nv.new_pct
    };
  });
  const lab = svg.selectAll("g.ylab").data(labels, d => d.y);
  const labEnter = lab.enter().append("g").attr("class", "ylab");
  labEnter.append("text").attr("class", "l-year");
  labEnter.append("text").attr("class", "l-total");
  labEnter.append("text").attr("class", "l-new");
  const labAll = labEnter.merge(lab);
  labAll.select("text.l-year").attr("x", d => g.cx(d.slot)).attr("y", baseline + 17).attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 600).attr("fill", CONFIG.n700).style("font-variant-numeric", "tabular-nums").text(d => d.y);
  labAll.select("text.l-total").attr("text-anchor", "middle").attr("font-size", g.W < 600 ? 11 : 13).attr("font-weight", 700).attr("fill", CONFIG.ink).style("font-variant-numeric", "tabular-nums").text(d => fmtInt(d.total)).transition(t).attr("x", d => g.cx(d.slot)).attr("y", d => baseline - hOf(d.total) - 21);
  labAll.select("text.l-new").attr("text-anchor", "middle").attr("font-size", g.W < 600 ? 9.5 : 10.5).attr("fill", CONFIG.n500).text(d => d.y === 2021 ? "старт обліку" : `нові ${fmtPct(d.newPct, 0)}`).transition(t).attr("x", d => g.cx(d.slot)).attr("y", d => baseline - hOf(d.total) - 8);
  paint();
}

function segAria(d) {
  return `Когорта ${d.cohort} у ${d.year} році: ${fmtInt(d.people)} ` + `${plural(d.people, PEOPLE)}, ${fmtPct(d.pctYear)} складу року. ` + `Enter — доля когорти ${d.cohort}.`;
}

function paint() {
  const hl = state.hover ?? state.sel;
  d3.selectAll("rect.seg").attr("opacity", d => hl === null || d.cohort === hl ? 1 : .4).attr("stroke", d => state.sel === d.cohort ? CONFIG.ink : COHORT_STROKE[d.cohort] || CONFIG.canvas).attr("stroke-width", d => state.sel === d.cohort ? 1.5 : 1).attr("aria-pressed", d => String(state.sel === d.cohort));
}

function tipHtml(d) {
  return `<span class="t-head">Когорта ${d.cohort}</span><br>` + `у ${d.year}: <span class="t-num">${fmtInt(d.people)}</span> ` + `${plural(d.people, PEOPLE)} · ${fmtPct(d.pctYear)} складу року`;
}

function showTip(e, d) {
  const tip = document.getElementById("tip");
  const wrap = document.querySelector(".chart-wrap");
  tip.innerHTML = tipHtml(d);
  tip.hidden = false;
  const r = wrap.getBoundingClientRect();
  let x = e.clientX - r.left + 14;
  let y = e.clientY - r.top - 10;
  x = Math.min(x, r.width - tip.offsetWidth - 4);
  y = Math.max(4, Math.min(y, r.height - tip.offsetHeight - 4));
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}

function showTipAt(d) {
  const g = geom();
  const tip = document.getElementById("tip");
  tip.innerHTML = tipHtml(d);
  tip.hidden = false;
  const hOf = n => n / MAXTOTAL * g.H;
  const yMid = CONFIG.padTop + g.H - hOf((d.y0 + d.y1) / 2);
  let x = g.cx(d.slot) + g.colW / 2 + 10;
  if (x + 200 > g.W) x = g.cx(d.slot) - g.colW / 2 - 210;
  tip.style.left = Math.max(4, x) + "px";
  tip.style.top = Math.max(4, yMid - 20) + "px";
}

function hideTip() {
  document.getElementById("tip").hidden = true;
}

function selectCohort(c) {
  state.sel = c;
  paint();
  renderPanel();
}

function renderPanel() {
  const p = document.getElementById("panel");
  if (state.sel === null) {
    const ret = DB.loyalty.retention_yoy.at(-1);
    const core = DB.loyalty.campaigns_per_person["5"];
    p.innerHTML = `\n      <p class="panel-overline">2021–2026 · п'ять кампаній</p>\n      <h2 class="panel-title">Ядро: <span id="cuCore">${fmtInt(core)}</span> людей</h2>\n      <p class="panel-lead">стільки голосували в усіх п'яти кампаніях —\n      Бюджет участі стає «клубом постійних»</p>\n      <div class="stat-pair">\n        <div class="stat"><span class="num" id="cuTotal">${fmtInt(DB.meta.people_total)}</span>\n          <span class="lab">людей голосували загалом</span></div>\n        <div class="stat"><span class="num">${fmtPct(ret.retention_pct)}</span>\n          <span class="lab">учасників 2025 повернулись у 2026</span></div>\n      </div>\n      <p class="panel-hint">Оберіть шар на графіку — тут з'явиться доля\n      когорти: скільки людей поверталися щороку і хто вони.</p>`;
    if (!countUpDone) {
      countUpDone = true;
      countUp(document.getElementById("cuCore"), core);
      countUp(document.getElementById("cuTotal"), DB.meta.people_total, 120);
    }
    return;
  }
  const c = state.sel;
  const coh = DB.cohorts[String(c)];
  const avail = YEARS.filter(y => y >= c).length;
  const last = coh.survival[String(YEARS.at(-1))];
  const lastPct = 100 * last / coh.size;
  const full = coh.campaigns_dist[String(avail)] || 0;
  const sexTot = coh.sex.F + coh.sex.M;
  const fPct = 100 * coh.sex.F / sexTot;
  let html = `\n    <p class="panel-overline">когорта · рік першої участі · ${c}</p>\n    <h2 class="panel-title">${fmtInt(coh.size)}</h2>\n    <p class="panel-lead">проголосувало вперше</p>`;
  if (avail > 1) {
    html += `\n    <div class="panel-sec">\n      <h3>Скільки з них голосували далі</h3>\n      <div id="survChart"></div>\n    </div>`;
  } else {
    html += `\n    <div class="panel-sec">\n      <p class="sec-cap">Когорта щойно прийшла — її доля попереду.</p>\n    </div>`;
  }
  if (c === 2021) {
    html += `\n    <p class="fact">Через п'ять років і війну когорта-2021 жива на\n    <strong>${fmtPct(lastPct)}</strong>: ${fmtInt(last)} людей знову\n    голосували у 2026.</p>`;
  } else if (avail > 1) {
    html += `\n    <p class="panel-lead" style="margin:12px 0 0">У 2026 голосували\n    ${fmtInt(last)} — ${fmtPct(lastPct)} когорти.</p>`;
  }
  if (avail > 1) {
    const coreLab = c === 2021 ? "не пропустили жодної з п'яти кампаній" : `не пропустили жодної з ${NUM_GEN[avail] || avail} доступних ${plural(avail, CAMP)}`;
    html += `\n    <div class="panel-sec">\n      <div class="stat-pair">\n        <div class="stat"><span class="num">${fmtInt(full)}</span>\n          <span class="lab">${coreLab}</span></div>\n        <div class="stat"><span class="num">${fmtPct(100 * full / coh.size)}</span>\n          <span class="lab">когорти</span></div>\n      </div>\n    </div>`;
  }
  html += `\n    <div class="panel-sec">\n      <h3>Склад когорти</h3>\n      <div class="sex-bar" aria-hidden="true">\n        <div class="f" style="flex:${fPct.toFixed(2)}"></div>\n        <div class="m" style="flex:${(100 - fPct).toFixed(2)}"></div>\n      </div>\n      <p class="sex-note"><span class="dot-f"></span>жінки ${fmtPct(fPct)}\n      (${fmtInt(coh.sex.F)}) · <span class="dot-m"></span>чоловіки\n      ${fmtPct(100 - fPct)} (${fmtInt(coh.sex.M)})</p>\n    </div>`;
  if (c === 2021) {
    html += `\n    <p class="panel-note">«Когорта-2021» — усі учасники першої кампанії:\n    масивів голосувань до 2021 року немає, тож це не «рік найбільшого\n    припливу», а старт обліку.</p>`;
  }
  html += `\n    <button type="button" class="panel-reset" id="panelReset">←\n    до загальної картини</button>`;
  p.innerHTML = html;
  document.getElementById("panelReset").addEventListener("click", () => selectCohort(null));
  if (avail > 1) drawSurv(c, coh);
}

function drawSurv(c, coh) {
  const box = document.getElementById("survChart");
  const W = box.clientWidth || 280;
  const H = 150;
  const m = {
    l: 10,
    r: 34,
    t: 20,
    b: 22
  };
  const pts = YEARS.filter(y => y >= c).map(y => ({
    y,
    n: coh.survival[String(y)]
  }));
  const x = d3.scaleLinear().domain([ c, 2026 ]).range([ m.l, W - m.r ]);
  const yS = d3.scaleLinear().domain([ 0, coh.size ]).range([ H - m.b, m.t ]);
  const svg = d3.select(box).html("").append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`).attr("aria-hidden", "true");
  const path = svg.append("path").datum(pts).attr("fill", "none").attr("stroke", CONFIG.p500).attr("stroke-width", 2).attr("d", d3.line().x(d => x(d.y)).y(d => yS(d.n)));
  if (CONFIG.dur) {
    const L = path.node().getTotalLength();
    path.attr("stroke-dasharray", L).attr("stroke-dashoffset", L).transition().duration(800).ease(d3.easeCubicOut).attr("stroke-dashoffset", 0).on("end", () => path.attr("stroke-dasharray", null));
  }
  const dot = svg.selectAll("g.dot").data(pts).enter().append("g");
  if (CONFIG.dur) {
    dot.attr("opacity", 0).transition().delay((d, i) => 150 + i * 150).duration(300).attr("opacity", 1);
  }
  dot.append("circle").attr("cx", d => x(d.y)).attr("cy", d => yS(d.n)).attr("r", 4).attr("fill", CONFIG.p500).attr("stroke", CONFIG.canvas).attr("stroke-width", 1.5);
  dot.append("text").attr("x", d => x(d.y)).attr("y", d => yS(d.n) - 9).attr("text-anchor", (d, i) => i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle").attr("font-size", 10).attr("fill", CONFIG.n700).style("font-variant-numeric", "tabular-nums").text(d => fmtInt(d.n));
  dot.append("text").attr("x", d => x(d.y)).attr("y", H - m.b + 14).attr("text-anchor", (d, i) => i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle").attr("font-size", 10).attr("fill", CONFIG.n500).style("font-variant-numeric", "tabular-nums").text(d => d.y);
  const lastP = pts.at(-1);
  svg.append("text").attr("x", W - m.r + 6).attr("y", yS(lastP.n) + 3).attr("font-size", 11).attr("font-weight", 700).attr("fill", CONFIG.ink).style("font-variant-numeric", "tabular-nums").text(fmtPct(100 * lastP.n / coh.size, 0));
}

function buildLadder() {
  const strip = document.getElementById("ladderStrip");
  strip.innerHTML = "";
  const cpp = DB.loyalty.campaigns_per_person;
  const maxN = Math.max(...Object.values(cpp));
  const maxH = 130;
  DB.loyalty.sex_by_loyalty.forEach(r => {
    const total = cpp[String(r.nyears)];
    const fPct = 100 * r.F / (r.F + r.M);
    const h = Math.max(Math.round(total / maxN * maxH), 30);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rung";
    b.dataset.n = r.nyears;
    b.setAttribute("aria-pressed", String(r.nyears === state.rung));
    b.setAttribute("aria-label", `${r.nyears} ${plural(r.nyears, CAMP)}: ${fmtInt(total)} ` + `${plural(total, PEOPLE)}, жінок ${fmtPct(fPct)}. Показати склад.`);
    b.innerHTML = `<div class="r-num">${fmtInt(total)}</div>` + `<div class="r-bar" style="height:${CONFIG.dur ? 0 : h}px" data-h="${h}" aria-hidden="true">` + `<div class="f" style="flex:${fPct.toFixed(2)}"></div>` + `<div class="m" style="flex:${(100 - fPct).toFixed(2)}"></div></div>` + `<div class="r-pct">${fmtPct(fPct, 0)} Ж</div>` + `<div class="r-lab">${r.nyears === 1 ? "1 кампанія" : r.nyears === 5 ? "всі 5" : r.nyears + " " + plural(r.nyears, CAMP)}</div>`;
    b.addEventListener("click", () => selectRung(r.nyears));
    strip.appendChild(b);
  });
  if (CONFIG.dur) {
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      strip.querySelectorAll(".r-bar").forEach((bar, i) => {
        bar.style.transitionDelay = i * 50 + "ms";
        bar.style.height = bar.dataset.h + "px";
      });
    }, {
      threshold: .4
    });
    io.observe(strip);
  }
  strip.addEventListener("keydown", e => {
    const btns = [ ...strip.querySelectorAll(".rung") ];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === "ArrowRight") j = Math.min(i + 1, btns.length - 1); else if (e.key === "ArrowLeft") j = Math.max(i - 1, 0); else if (e.key === "Home") j = 0; else if (e.key === "End") j = btns.length - 1;
    if (j !== null) {
      e.preventDefault();
      btns[j].focus();
    }
  });
  renderLadderDetail();
}

function selectRung(n) {
  state.rung = n;
  document.querySelectorAll(".rung").forEach(b => {
    b.setAttribute("aria-pressed", String(Number(b.dataset.n) === n));
  });
  renderLadderDetail();
}

function renderLadderDetail() {
  const el = document.getElementById("ladderDetail");
  const n = state.rung;
  const r = DB.loyalty.sex_by_loyalty.find(q => q.nyears === n);
  const total = DB.loyalty.campaigns_per_person[String(n)];
  const fPct = 100 * r.F / (r.F + r.M);
  const share = 100 * total / DB.meta.people_total;
  if (n === 5) {
    el.innerHTML = `<strong>Всі п'ять кампаній:</strong> ${fmtInt(total)}\n      ${plural(total, PEOPLE)} (${fmtPct(share)} усіх учасників) — «ядро»\n      бюджету участі. Жінок <strong>${fmtPct(fPct)}</strong>\n      (${fmtInt(r.F)} Ж · ${fmtInt(r.M)} Ч) — майже четверо з п'яти.`;
  } else {
    el.innerHTML = `<strong>${n === 1 ? "Лише одна кампанія" : `Рівно ${NUM_NOM[n] || n} ${plural(n, CAMP)}`}:</strong> ${fmtInt(total)}\n      ${plural(total, PEOPLE)} (${fmtPct(share)} усіх учасників).\n      Жінок <strong>${fmtPct(fPct)}</strong>\n      (${fmtInt(r.F)} Ж · ${fmtInt(r.M)} Ч).`;
  }
}
