"use strict";

const CONFIG = {
  sexF: "#9C8BCC",
  sexM: "#4E3C84",
  ink: "#1A1A1A",
  n300: "#CACAD1",
  n400: "#9FA0A9",
  n500: "#71737E",
  n50: "#F7F7F8",
  bandH: 170,
  bandHNarrow: 128,
  padTop: 10,
  padBottom: 8,
  dur: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600
};

const YEARS = [ 2016, 2017, 2018, 2019, 2020, 2021, 2023, 2024, 2025, 2026 ];

const CAT_COLOR = {
  "education-general": "#654EA3",
  "education-school": "#4A2D87",
  "education-preschool": "#7B66B8",
  "education-extracurricular": "#9E5FAB",
  "improvement-general": "#2D6BAB",
  "improvement-streets": "#1A4F82",
  heritage: "#A0571F",
  greenery: "#3D7C3F",
  "afu-support": "#3F4049",
  accessibility: "#0E7C8C",
  other: "#71737E"
};

const catLabel = key => COPY.categories && COPY.categories[key] || key;

const catColor = key => CAT_COLOR[key] || CONFIG.n500;

const NBSP = " ";

const fmtInt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

const fmtPct = (x, d = 1) => x.toFixed(d).replace(".", ",") + "%";

const fShare = r => 100 * r.F / (r.F + r.M);

const plural = (n, forms) => {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
};

const tpl = (str, vars) => String(str).replace(/\{([^{}]+)\}/g, (m, k) => vars && k in vars ? vars[k] : m);

function applyStaticCopy() {
  document.title = COPY.pageTitle;
  const md = document.getElementById("metaDesc");
  if (md) md.setAttribute("content", COPY.metaDescription);
  document.querySelectorAll("[data-copy]").forEach(el => {
    const v = COPY[el.dataset.copy];
    if (v != null) el.textContent = v;
  });
  document.querySelectorAll("[data-aria]").forEach(el => {
    const v = COPY[el.dataset.aria];
    if (v != null) el.setAttribute("aria-label", v);
  });
  const loadingText = document.getElementById("loadingText");
  if (loadingText) loadingText.textContent = COPY.loading;
  const noteList = document.getElementById("noteList");
  if (noteList) {
    noteList.innerHTML = "";
    (COPY.notes || []).forEach(t => {
      const li = document.createElement("li");
      li.textContent = t;
      noteList.appendChild(li);
    });
  }
}

const state = {
  mode: "votes",
  year: null,
  catSex: "F"
};

let DB = null;

let byYear = null;

window.addEventListener("DOMContentLoaded", async () => {
  applyStaticCopy();
  try {
    const resp = await fetch("data/gender.json");
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    DB = await resp.json();
  } catch (e) {
    document.getElementById("loadingText").textContent = COPY.loadError;
    console.error(e);
    return;
  }
  byYear = {
    authors: new Map(DB.authors.map(r => [ r.year, r ])),
    votes: new Map(DB.votes.map(r => [ r.year, r ])),
    people: new Map(DB.people.map(r => [ r.year, r ])),
    ppp: new Map(DB.ppp.map(r => [ r.year, r ]))
  };
  document.getElementById("loading").hidden = true;
  fillSubtitle();
  fillSceneCap();
  buildAxis();
  buildLoyalty();
  bindMode();
  renderPanel();
  layout(false);
  let t = null;
  new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => {
      layout(false);
    }, 150);
  }).observe(document.querySelector(".scene"));
});

function geom() {
  const scene = document.querySelector(".scene");
  const W = scene.clientWidth;
  const m = {
    l: 4,
    r: 4
  };
  const slotW = (W - m.l - m.r) / YEARS.length;
  const colW = Math.min(slotW * .68, 56);
  const H = W < 600 ? CONFIG.bandHNarrow : CONFIG.bandH;
  const cx = i => m.l + slotW * i + slotW / 2;
  return {
    W,
    m,
    slotW,
    colW,
    H,
    cx
  };
}

function layout(animate) {
  const g = geom();
  const axis = document.getElementById("yearAxis");
  axis.style.paddingLeft = g.m.l + "px";
  axis.querySelectorAll(".year-btn").forEach(b => {
    b.style.width = g.slotW + "px";
  });
  drawBand(d3.select("#topBand"), {
    g,
    dir: "up",
    series: YEARS.map(y => byYear.authors.get(y) || null),
    padTop: CONFIG.padTop,
    padBottom: 2,
    animate
  });
  drawBand(d3.select("#bottomBand"), {
    g,
    dir: "down",
    series: YEARS.map(y => byYear[state.mode].get(y) || null),
    padTop: 2,
    padBottom: CONFIG.padBottom,
    animate,
    emptyCaption: true
  });
}

function drawBand(svg, o) {
  const {g} = o;
  const H = g.H;
  const totalH = o.padTop + H + o.padBottom;
  svg.attr("width", g.W).attr("height", totalH).attr("viewBox", `0 0 ${g.W} ${totalH}`);
  const yF = sh => o.padTop + H - sh * H;
  const hF = sh => sh * H;
  const yM = () => o.padTop;
  const hM = sh => (1 - sh) * H;
  const yBound = sh => o.padTop + hM(sh);
  const yGuide = o.padTop + H / 2;
  const data = o.series.map((r, i) => r ? {
    ...r,
    i,
    sh: r.F / (r.F + r.M)
  } : null).filter(Boolean);
  const t = svg.transition().duration(o.animate ? CONFIG.dur : 0).ease(d3.easeCubicOut);
  let empty = svg.selectAll("g.empty").data(o.emptyCaption ? [ 1 ] : []);
  empty.exit().remove();
  const emptyEnter = empty.enter().append("g").attr("class", "empty");
  emptyEnter.append("rect");
  emptyEnter.append("text");
  empty = emptyEnter.merge(empty);
  if (o.emptyCaption) {
    const x0 = g.cx(0) - g.colW / 2, x1 = g.cx(4) + g.colW / 2;
    empty.select("rect").attr("x", x0).attr("y", o.padTop + 3).attr("width", x1 - x0).attr("height", H - 6).attr("rx", 8).attr("fill", CONFIG.n50).attr("stroke", CONFIG.n300).attr("stroke-dasharray", "4 4");
    const cap = empty.select("text").attr("x", (x0 + x1) / 2).attr("y", o.padTop + H * .3).attr("text-anchor", "middle").attr("fill", CONFIG.n500).attr("font-size", 11);
    cap.selectAll("tspan").remove();
    const lines = g.slotW < 46 ? [ COPY.emptyBandLine1, COPY.emptyBandLine2 ] : [ COPY.emptyBandLine1 + " " + COPY.emptyBandLine2 ];
    lines.forEach((s, k) => {
      cap.append("tspan").attr("x", (x0 + x1) / 2).attr("dy", k === 0 ? lines.length > 1 ? -3 : 4 : 14).text(s);
    });
  }
  const cols = svg.selectAll("g.col").data(data, d => d.year);
  cols.exit().remove();
  const colsEnter = cols.enter().append("g").attr("class", "col");
  colsEnter.append("rect").attr("class", "rM").attr("fill", CONFIG.sexM).attr("y", d => yM(d.sh)).attr("height", d => hM(d.sh));
  colsEnter.append("rect").attr("class", "rF").attr("fill", CONFIG.sexF).attr("y", d => yF(d.sh)).attr("height", d => hF(d.sh));
  colsEnter.append("text").attr("class", "pct").attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 700).attr("fill", CONFIG.ink).style("font-variant-numeric", "tabular-nums");
  const colsAll = colsEnter.merge(cols);
  colsAll.selectAll("rect").attr("x", d => g.cx(d.i) - g.colW / 2).attr("width", g.colW);
  colsAll.attr("opacity", d => state.year === null || state.year === d.year ? 1 : .55);
  colsAll.select("rect.rF").attr("stroke", d => state.year === d.year ? CONFIG.ink : "none").attr("stroke-width", 1).transition(t).attr("y", d => yF(d.sh)).attr("height", d => hF(d.sh));
  colsAll.select("rect.rM").attr("stroke", d => state.year === d.year ? CONFIG.ink : "none").attr("stroke-width", 1).transition(t).attr("y", d => yM(d.sh)).attr("height", d => hM(d.sh));
  const showAll = g.slotW >= 46;
  const pctText = d => g.slotW >= 56 ? fmtPct(100 * d.sh) : fmtPct(100 * d.sh, 0);
  colsAll.select("text.pct").attr("x", d => g.cx(d.i)).text(pctText).attr("opacity", (d, i, nodes) => {
    const first = d === data[0], last = d === data[data.length - 1];
    return showAll || first || last || state.year === d.year ? 1 : 0;
  }).transition(t).attr("y", d => yBound(d.sh) + d.sh * H / 2 + 4);
  let guides = svg.selectAll("g.guides").data([ 1 ]);
  const guidesEnter = guides.enter().append("g").attr("class", "guides");
  guidesEnter.append("line").attr("class", "g50");
  guidesEnter.append("text").attr("class", "t50");
  guides = guidesEnter.merge(guides);
  guides.select("line.g50").attr("x1", g.m.l + 28).attr("x2", g.W - g.m.r).attr("y1", yGuide).attr("y2", yGuide).attr("stroke", CONFIG.n400).attr("stroke-dasharray", "3 4").attr("stroke-width", 1);
  guides.select("text.t50").attr("x", g.m.l).attr("y", yGuide + 3.5).attr("text-anchor", "start").attr("font-size", 10).attr("fill", CONFIG.n400).attr("paint-order", "stroke").attr("stroke", "#FDFDFD").attr("stroke-width", 3.5).style("font-variant-numeric", "tabular-nums").text(COPY.guide50);
}

function buildAxis() {
  const axis = document.getElementById("yearAxis");
  axis.innerHTML = "";
  YEARS.forEach(y => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "year-btn";
    b.textContent = y;
    b.dataset.year = y;
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-label", yearAria(y));
    b.addEventListener("click", () => selectYear(state.year === y ? null : y));
    axis.appendChild(b);
  });
  axis.addEventListener("keydown", e => {
    const btns = [ ...axis.querySelectorAll(".year-btn") ];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === "ArrowRight") j = Math.min(i + 1, btns.length - 1); else if (e.key === "ArrowLeft") j = Math.max(i - 1, 0); else if (e.key === "Home") j = 0; else if (e.key === "End") j = btns.length - 1;
    if (j !== null) {
      e.preventDefault();
      btns[j].focus();
    }
  });
}

function yearAria(y) {
  const a = byYear.authors.get(y);
  const v = byYear.votes.get(y);
  const vPart = v ? tpl(COPY.yearAriaVotes, {
    вЧастка: fmtPct(fShare(v))
  }) : "";
  return tpl(COPY.yearAria, {
    рік: y,
    аЧастка: fmtPct(fShare(a)),
    вЧастина: vPart
  });
}

function selectYear(y) {
  state.year = y;
  document.querySelectorAll(".year-btn").forEach(b => {
    b.setAttribute("aria-pressed", String(Number(b.dataset.year) === y));
  });
  layout(false);
  renderPanel();
}

function bindMode() {
  const bv = document.getElementById("modeVotes");
  const bp = document.getElementById("modePeople");
  const set = mode => {
    state.mode = mode;
    bv.setAttribute("aria-checked", String(mode === "votes"));
    bp.setAttribute("aria-checked", String(mode === "people"));
    layout(true);
    renderPanel();
  };
  bv.addEventListener("click", () => set("votes"));
  bp.addEventListener("click", () => set("people"));
}

function fillSubtitle() {
  const win = DB.winners || {
    F: 0,
    total: 0
  };
  const pct = win.total ? fmtPct(100 * win.F / win.total) : "";
  document.getElementById("subtitle").textContent = tpl(COPY.subtitle, {
    перемоглоЖ: fmtInt(win.F),
    часткаW: pct
  });
}

function fillSceneCap() {
  const last = DB.ppp[DB.ppp.length - 1];
  document.getElementById("sceneCap").innerHTML = tpl(COPY.sceneCap, {
    рік: last.year,
    жП: String(last.sexF_mean).replace(".", ","),
    чП: String(last.sexM_mean).replace(".", ",")
  });
}

function buildLoyalty() {
  const core = DB.loyalty.find(r => r.nyears === 5);
  if (core) {
    document.getElementById("loyaltyCap").innerHTML = tpl(COPY.loyaltyCap, {
      ядро: fmtPct(fShare(core))
    });
  }
  const strip = document.getElementById("loyaltyStrip");
  strip.innerHTML = "";
  DB.loyalty.forEach(r => {
    const pct = fShare(r);
    const cell = document.createElement("div");
    cell.className = "loy-cell" + (r.nyears === 5 ? " is-core" : "");
    const lab = r.nyears === 1 ? COPY.loyOneCampaign : r.nyears === 5 ? COPY.loyAll : r.nyears + " " + plural(r.nyears, COPY.campaignForms);
    cell.innerHTML = `<div class="loy-bar"><div class="m" style="flex:${(100 - pct).toFixed(2)}"></div>` + `<div class="f" style="flex:${pct.toFixed(2)}"><span class="loy-pct">${fmtPct(pct)}</span></div>` + `</div>` + `<div class="loy-lab">${lab}</div>`;
    strip.appendChild(cell);
  });
}

function renderPanel() {
  const p = document.getElementById("panel");
  if (state.year === null) {
    const aT = DB.authors.reduce((s, r) => ({
      F: s.F + r.F,
      M: s.M + r.M
    }), {
      F: 0,
      M: 0
    });
    const vT = DB.votes.reduce((s, r) => ({
      F: s.F + r.F,
      M: s.M + r.M
    }), {
      F: 0,
      M: 0
    });
    p.innerHTML = `\n      <p class="panel-overline">${COPY.panelDefaultOverline}</p>\n      <div class="stat stat-lead">\n        <span class="num">${tpl(COPY.panelDefaultLeadNum, {
      часткаЖ: fmtPct(fShare(aT))
    })}</span>\n        <span class="lab">${COPY.panelDefaultLeadLab}</span>\n      </div>\n      <div class="stat-pair">\n        <div class="stat"><span class="num">${fmtInt(aT.F)}</span>\n          <span class="lab">${COPY.labAuthorsF}</span></div>\n        <div class="stat"><span class="num">${fmtInt(aT.M)}</span>\n          <span class="lab">${COPY.labAuthorsM}</span></div>\n      </div>\n      <div class="panel-sec">\n        <div class="stat-pair">\n          <div class="stat"><span class="num">${fmtPct(fShare(vT))}</span>\n            <span class="lab">${COPY.labVotesFShareAll}</span></div>\n        </div>\n        <p class="stat-note">${tpl(COPY.panelDefaultVotesNote, {
      голосівЖ: fmtInt(vT.F),
      голосівЧ: fmtInt(vT.M)
    })}</p>\n      </div>\n      <p class="panel-hint" style="margin-top:16px">${COPY.panelDefaultHint}</p>`;
    return;
  }
  const y = state.year;
  const a = byYear.authors.get(y);
  const v = byYear.votes.get(y);
  const pe = byYear.people.get(y);
  const ppp = byYear.ppp.get(y);
  const ex = DB.author_examples && DB.author_examples[String(y)] || [];
  const cats = DB.categories_by_year.filter(r => r.year === y).map(r => ({
    ...r,
    pct: fShare(r)
  })).sort((q, w) => w.pct - q.pct);
  let html = `\n    <p class="panel-overline">${COPY.panelYearOverline}</p>\n    <h2 class="panel-title">${y}</h2>\n    <div class="panel-sec" style="border-top:none;margin-top:0;padding-top:0">\n      <h3>${COPY.secAuthors}</h3>\n      <div class="stat-pair">\n        <div class="stat"><span class="num">${a.F}</span>\n          <span class="lab">${plural(a.F, COPY.authorFormsF)}</span></div>\n        <div class="stat"><span class="num">${a.M}</span>\n          <span class="lab">${plural(a.M, COPY.authorFormsM)}</span></div>\n        <div class="stat"><span class="num">${fmtPct(fShare(a))}</span>\n          <span class="lab">${COPY.labProjFromWomen}</span></div>\n      </div>\n    </div>`;
  if (ex.length) {
    html += `\n    <div class="panel-sec">\n      <h3>${COPY.secAuthorExamples}</h3>\n      <p class="sec-cap">${tpl(COPY.authorExamplesCap, {
      рік: y
    })}</p>\n      <ul class="ex-list">${ex.map(e => `<li>${escapeHtml(e.title)}</li>`).join("")}</ul>\n    </div>`;
  }
  if (v) {
    const cur = state.mode === "votes" ? v : pe;
    const labF = state.mode === "votes" ? COPY.labVotesF : plural(cur.F, COPY.womenVotedForms);
    const labM = state.mode === "votes" ? COPY.labVotesM : plural(cur.M, COPY.menVotedForms);
    const labShare = state.mode === "votes" ? COPY.labVotesFShare : COPY.labPeopleFShare;
    html += `\n    <div class="panel-sec">\n      <h3>${COPY.secVoters}</h3>\n      <div class="stat-pair">\n        <div class="stat"><span class="num">${fmtInt(cur.F)}</span>\n          <span class="lab">${labF}</span></div>\n        <div class="stat"><span class="num">${fmtInt(cur.M)}</span>\n          <span class="lab">${labM}</span></div>\n        <div class="stat"><span class="num">${fmtPct(fShare(cur))}</span>\n          <span class="lab">${labShare}</span></div>\n      </div>\n      <p class="stat-note">${tpl(COPY.pppNote, {
      жП: String(ppp.sexF_mean).replace(".", ","),
      чП: String(ppp.sexM_mean).replace(".", ",")
    })}</p>\n    </div>`;
  } else {
    html += `\n    <div class="panel-sec">\n      <h3>${COPY.secVoters}</h3>\n      <p class="sec-cap">${y <= 2020 ? COPY.votersFromYear : ""}</p>\n    </div>`;
  }
  if (cats.length) {
    const isM = state.catSex === "M";
    const sexColor = isM ? CONFIG.sexM : CONFIG.sexF;
    const list = cats.map(c => ({
      ...c,
      val: isM ? 100 - c.pct : c.pct
    })).sort((p, q) => q.val - p.val);
    const posOf = val => isM ? val / 50 * 100 : (val - 50) / 50 * 100;
    const scaleL = isM ? "0%" : "50%";
    const scaleR = isM ? "50%" : "100%";
    const cap = isM ? COPY.catNoteM : COPY.catNoteF;
    html += `\n    <div class="panel-sec">\n      <div class="cat-head">\n        <h3>${isM ? COPY.catHeadM : COPY.catHeadF}</h3>\n        <span class="mode catsex" role="radiogroup" aria-label="${COPY.ariaCatSex}">\n          <button type="button" class="mode-btn" data-csex="F" role="radio" aria-checked="${!isM}">${COPY.catSexBtnF}</button>\n          <button type="button" class="mode-btn" data-csex="M" role="radio" aria-checked="${isM}">${COPY.catSexBtnM}</button>\n        </span>\n      </div>\n      <p class="sec-cap">${tpl(isM ? COPY.catCapM : COPY.catCapF, {
      рік: y
    })}</p>\n      <div class="cat-scale" aria-hidden="true"><span>${scaleL}</span><span>${scaleR}</span></div>\n      ${list.map(c => {
      const pos = posOf(c.val);
      return `<div class="cat-row">\n          <div class="cat-top">\n            <i class="cat-chip" style="background:${catColor(c.category)}"></i>\n            <span class="cat-name">${catLabel(c.category)}</span>\n            <span class="cat-val">${fmtPct(c.val)}</span>\n          </div>\n          <div class="cat-track" title="${tpl(COPY.catTooltip, {
        голосівЖ: fmtInt(c.F),
        голосівЧ: fmtInt(c.M)
      })}">\n            <div class="cat-fill" style="width:${pos.toFixed(1)}%;background:${sexColor}"></div>\n            <div class="cat-dot" style="left:${pos.toFixed(1)}%;background:${sexColor}"></div>\n          </div>\n        </div>`;
    }).join("")}\n      <p class="stat-note">${cap}</p>\n    </div>`;
  } else if (y <= 2018) {
    html += `\n    <div class="panel-sec">\n      <p class="sec-cap">${COPY.noCategoriesPre2019}</p>\n    </div>`;
  }
  p.innerHTML = html;
  p.querySelectorAll(".catsex .mode-btn").forEach(b => {
    b.addEventListener("click", () => {
      if (state.catSex === b.dataset.csex) return;
      state.catSex = b.dataset.csex;
      renderPanel();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}
