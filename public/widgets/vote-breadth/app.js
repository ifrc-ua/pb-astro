"use strict";

const CONFIG = {
  ink: "#1A1A1A",
  canvas: "#FDFDFD",
  frameFill: "#F7F7F8",
  frameStroke: "#CACAD1",
  fillAll: "#654EA3",
  online: "#654EA3",
  cnap: "#0E7C8C",
  sexF: "#9C8BCC",
  sexM: "#4E3C84",
  n400: "#9FA0A9",
  n500: "#71737E",
  n700: "#3F4049",
  dur: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600
};

const NBSP = " ";

const fmtInt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

const fmtMean = x => x == null ? "—" : x.toFixed(2).replace(".", ",");

const fmtPct = frac => frac == null ? "—" : Math.round(frac * 100) + "%";

const fmtPct1 = x => x == null ? "—" : x.toFixed(1).replace(".", ",") + "%";

const tpl = (str, vars) => String(str).replace(/\{([^{}]+)\}/g, (m, k) => vars && k in vars ? vars[k] : m);

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

const plural = (n, forms) => {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
};

function applyStaticCopy() {
  document.title = COPY.pageTitle;
  const md = document.getElementById("metaDesc");
  if (md) md.setAttribute("content", COPY.metaDescription);
  document.querySelectorAll("[data-copy]").forEach(el => {
    const v = COPY[el.dataset.copy];
    if (v != null) el.innerHTML = v;
  });
  document.querySelectorAll("[data-aria]").forEach(el => {
    const v = COPY[el.dataset.aria];
    if (v != null) el.setAttribute("aria-label", v);
  });
  const lt = document.getElementById("loadingText");
  if (lt) lt.textContent = COPY.loading;
  const nl = document.getElementById("noteList");
  if (nl) {
    nl.innerHTML = "";
    (COPY.notes || []).forEach(t => {
      const li = document.createElement("li");
      li.innerHTML = t;
      nl.appendChild(li);
    });
  }
}

const state = {
  mode: "all",
  year: null
};

let DB = null;

let YEARS = [];

let CEIL = {};

let MAXCEIL = 13;

let Y = null;

let CH = null;

let SX = null;

let HB = null;

let LAST = null;

window.addEventListener("DOMContentLoaded", async () => {
  applyStaticCopy();
  try {
    const resp = await fetch("data/vote_breadth.json");
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    DB = await resp.json();
  } catch (e) {
    document.getElementById("loadingText").textContent = COPY.loadError;
    console.error(e);
    return;
  }
  YEARS = DB.meta.years.slice();
  LAST = YEARS[YEARS.length - 1];
  CEIL = {};
  YEARS.forEach(y => CEIL[y] = DB.meta.ceiling_by_year[String(y)]);
  MAXCEIL = Math.max(...Object.values(CEIL));
  Y = new Map(DB.by_year.map(r => [ r.year, r ]));
  CH = new Map(YEARS.map(y => [ y, {} ]));
  DB.by_year_channel.forEach(r => CH.get(r.year)[r.channel] = r);
  SX = new Map(YEARS.map(y => [ y, {} ]));
  DB.by_year_sex.forEach(r => SX.get(r.year)[r.sex] = r);
  HB = new Map(YEARS.map(y => [ y, [] ]));
  (DB.by_year_breadth || []).forEach(r => HB.get(r.year).push(r));
  document.getElementById("loading").hidden = true;
  buildAxis();
  bindModes();
  syncMode();
  layout(false);
  renderPanel();
  let t = null;
  new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => layout(false), 150);
  }).observe(document.querySelector(".scene"));
});

function geom() {
  const scene = document.querySelector(".scene");
  const W = Math.max(280, scene.clientWidth);
  const m = {
    l: 6,
    r: 6
  };
  const slotW = (W - m.l - m.r) / YEARS.length;
  const narrow = W < 560;
  const H = narrow ? 198 : 280;
  const padTop = 30;
  const padBottom = 30;
  const yUnit = H / MAXCEIL;
  const baseY = padTop + H;
  const cx = i => m.l + slotW * i + slotW / 2;
  const yOf = v => baseY - v * yUnit;
  const frameW = Math.min(slotW * .6, narrow ? 52 : 72);
  return {
    W,
    m,
    slotW,
    H,
    padTop,
    padBottom,
    yUnit,
    baseY,
    cx,
    yOf,
    frameW,
    narrow
  };
}

function layout(animate) {
  const g = geom();
  const svg = d3.select("#scene");
  const totalH = g.padTop + g.H + g.padBottom;
  svg.attr("width", g.W).attr("height", totalH).attr("viewBox", `0 0 ${g.W} ${totalH}`);
  svg.selectAll("*").remove();
  hideTip();
  const dur = animate ? CONFIG.dur : 0;
  const axis = document.getElementById("yearAxis");
  axis.style.paddingLeft = g.m.l + "px";
  axis.querySelectorAll(".year-btn").forEach((b, i) => b.style.width = g.slotW + "px");
  if (state.mode === "dist") {
    drawDist(svg, g, animate);
    return;
  }
  const showMeanAll = g.slotW >= 50;
  YEARS.forEach((y, i) => {
    const row = Y.get(y);
    const ceil = CEIL[y];
    const gsel = svg.append("g").attr("class", "yr").attr("data-year", y);
    const dim = state.year !== null && state.year !== y;
    gsel.attr("opacity", dim ? .45 : 1);
    gsel.append("rect").attr("x", g.cx(i) - g.frameW / 2).attr("y", g.yOf(ceil)).attr("width", g.frameW).attr("height", ceil * g.yUnit).attr("rx", 5).attr("fill", CONFIG.frameFill).attr("stroke", state.year === y ? CONFIG.ink : CONFIG.frameStroke).attr("stroke-width", state.year === y ? 1.6 : 1);
    gsel.append("text").attr("x", g.cx(i)).attr("y", g.yOf(ceil) - 8).attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 600).attr("fill", CONFIG.n500).style("font-variant-numeric", "tabular-nums").text(ceil);
    if (state.mode === "all") {
      drawBar(gsel, g, i, row.mean, row.median, CONFIG.fillAll, dur, g.frameW * .82, showMeanAll || state.year === y || i === 0 || i === YEARS.length - 1);
      gsel.append("text").attr("x", g.cx(i)).attr("y", g.baseY + 19).attr("text-anchor", "middle").attr("font-size", g.narrow ? 11 : 12).attr("font-weight", 700).attr("fill", CONFIG.n700).style("font-variant-numeric", "tabular-nums").text(fmtPct(row.utilization));
    } else {
      const pair = state.mode === "channel" ? [ [ "online", CH.get(y).online, CONFIG.online ], [ "cnap", CH.get(y).cnap, CONFIG.cnap ] ] : [ [ "F", SX.get(y).F, CONFIG.sexF ], [ "M", SX.get(y).M, CONFIG.sexM ] ];
      const gap = g.narrow ? 4 : 6;
      const subW = (g.frameW - gap) / 2;
      const showLbl = !g.narrow && (g.slotW >= 80 || state.year === y);
      pair.forEach(([code, r, color], k) => {
        const cxSub = g.cx(i) - g.frameW / 2 + subW / 2 + k * (subW + gap);
        drawSubBar(gsel, g, cxSub, subW, r, color, dur, showLbl);
      });
    }
  });
}

function drawBar(gsel, g, i, mean, median, color, dur, barW, showLbl) {
  const x = g.cx(i) - barW / 2;
  const rect = gsel.append("rect").attr("x", x).attr("width", barW).attr("rx", 3).attr("fill", color).attr("y", g.baseY).attr("height", 0);
  rect.transition().duration(dur).ease(d3.easeCubicOut).attr("y", g.yOf(mean)).attr("height", mean * g.yUnit);
  if (median != null && median > 0) {
    gsel.append("line").attr("x1", x + 2).attr("x2", x + barW - 2).attr("y1", g.yOf(median)).attr("y2", g.yOf(median)).attr("stroke", CONFIG.canvas).attr("stroke-width", 1.5).attr("stroke-dasharray", "2 2").attr("opacity", .85);
  }
  if (showLbl) {
    gsel.append("text").attr("x", g.cx(i)).attr("y", g.yOf(mean) - 6).attr("text-anchor", "middle").attr("font-size", g.narrow ? 12 : 13).attr("font-weight", 700).attr("fill", CONFIG.ink).style("font-variant-numeric", "tabular-nums").text(fmtMean(mean));
  }
}

function drawSubBar(gsel, g, cxSub, subW, r, color, dur, showLbl) {
  if (!r || r.mean == null) {
    gsel.append("text").attr("x", cxSub).attr("y", g.baseY - 4).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", CONFIG.n400).text("<5");
    return;
  }
  const rect = gsel.append("rect").attr("x", cxSub - subW / 2).attr("width", subW).attr("rx", 3).attr("fill", color).attr("y", g.baseY).attr("height", 0);
  rect.transition().duration(dur).ease(d3.easeCubicOut).attr("y", g.yOf(r.mean)).attr("height", r.mean * g.yUnit);
  if (showLbl) {
    gsel.append("text").attr("x", cxSub).attr("y", g.yOf(r.mean) - 5).attr("text-anchor", "middle").attr("font-size", g.narrow ? 10 : 11).attr("font-weight", 700).attr("fill", CONFIG.ink).style("font-variant-numeric", "tabular-nums").text(fmtMean(r.mean));
  }
}

function drawDist(svg, g, animate) {
  const y = state.year || LAST;
  const ceil = CEIL[y];
  const rows = (HB.get(y) || []).filter(r => !r.suppressed);
  const yr = Y.get(y);
  const dur = animate ? CONFIG.dur : 0;
  const padTop = 26;
  const padBottom = g.narrow ? 30 : 34;
  const H = g.H;
  const totalH = padTop + H + padBottom;
  svg.attr("height", totalH).attr("viewBox", `0 0 ${g.W} ${totalH}`);
  const m = {
    l: 6,
    r: 6
  };
  const slot = (g.W - m.l - m.r) / ceil;
  const barW = Math.min(slot * .72, 56);
  const baseY = padTop + H;
  const maxP = Math.max(...rows.map(r => r.people), 1);
  const yP = p => baseY - p / maxP * H;
  const xC = b => m.l + slot * (b - 1) + slot / 2;
  rows.forEach(r => {
    const cx = xC(r.breadth);
    const isCeil = r.breadth === ceil;
    const rect = svg.append("rect").attr("class", "dbar").attr("x", cx - barW / 2).attr("width", barW).attr("rx", 3).attr("fill", CONFIG.fillAll).attr("y", baseY).attr("height", 0);
    rect.transition().duration(dur).ease(d3.easeCubicOut).attr("y", yP(r.people)).attr("height", baseY - yP(r.people));
    const html = tipHtml(r);
    rect.on("pointerenter", e => showTip(e, html)).on("pointermove", e => showTip(e, html)).on("pointerleave", hideTip).on("pointerdown", e => showTip(e, html, e.pointerType !== "mouse"));
    svg.append("text").attr("x", cx).attr("y", yP(r.people) - 5).attr("text-anchor", "middle").attr("font-size", g.narrow ? 9 : 11).attr("font-weight", 700).attr("fill", CONFIG.ink).style("font-variant-numeric", "tabular-nums").text(Math.round(r.pct) + "%");
    svg.append("text").attr("x", cx).attr("y", baseY + 15).attr("text-anchor", "middle").attr("font-size", g.narrow ? 10 : 12).attr("font-weight", isCeil ? 700 : 600).attr("fill", isCeil ? CONFIG.fillAll : CONFIG.n700).style("font-variant-numeric", "tabular-nums").text(r.breadth);
  });
  const mx = m.l + slot * (yr.mean - .5);
  svg.append("line").attr("x1", mx).attr("x2", mx).attr("y1", padTop - 2).attr("y2", baseY).attr("stroke", CONFIG.ink).attr("stroke-width", 1.3).attr("stroke-dasharray", "3 3").attr("opacity", .7);
  svg.append("text").attr("x", mx).attr("y", padTop - 7).attr("text-anchor", mx > g.W - 70 ? "end" : "middle").attr("font-size", 10.5).attr("font-weight", 700).attr("fill", CONFIG.ink).style("font-variant-numeric", "tabular-nums").text(tpl(COPY.distMeanLabel, {
    x: fmtMean(yr.mean)
  }));
  svg.append("text").attr("x", g.W - m.r).attr("y", baseY + (g.narrow ? 27 : 31)).attr("text-anchor", "end").attr("font-size", 10).attr("fill", CONFIG.n400).text(COPY.distAxisUnit);
}

function tipHtml(r) {
  return `<span class="tip-main">${tpl(COPY.distTipMain, {
    люди: fmtInt(r.people)
  })}</span>` + `<br><span class="tip-sub">${tpl(COPY.distTipSub, {
    breadth: r.breadth,
    словоПроєкт: plural(r.breadth, COPY.projForms),
    pct: fmtPct1(r.pct)
  })}</span>`;
}

function showTip(e, html, autohide) {
  const tip = document.getElementById("distTip");
  if (!tip) return;
  tip.innerHTML = html;
  tip.hidden = false;
  const below = e.clientY < 84;
  tip.style.left = e.clientX + "px";
  tip.style.top = e.clientY + "px";
  tip.style.transform = below ? "translate(-50%, 18px)" : "translate(-50%, calc(-100% - 14px))";
  clearTimeout(showTip._t);
  if (autohide) showTip._t = setTimeout(hideTip, 2600);
}

function hideTip() {
  const tip = document.getElementById("distTip");
  if (tip) tip.hidden = true;
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
    b.addEventListener("click", () => selectYear(state.mode !== "dist" && state.year === y ? null : y));
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
  if (state.mode === "dist") return tpl(COPY.yearAriaDist, {
    рік: y
  });
  const row = Y.get(y);
  let det;
  if (state.mode === "channel") {
    const c = CH.get(y);
    det = tpl(COPY.yearAriaChannel, {
      цнап: fmtMean(c.cnap && c.cnap.mean),
      онлайн: fmtMean(c.online && c.online.mean)
    });
  } else if (state.mode === "sex") {
    const s = SX.get(y);
    det = tpl(COPY.yearAriaSex, {
      ж: fmtMean(s.F && s.F.mean),
      ч: fmtMean(s.M && s.M.mean)
    });
  } else {
    det = tpl(COPY.yearAriaAll, {
      середнє: fmtMean(row.mean),
      стеля: CEIL[y],
      утиліз: fmtPct(row.utilization)
    });
  }
  return tpl(COPY.yearAria, {
    рік: y,
    деталі: det
  });
}

function refreshAxisAria() {
  document.querySelectorAll(".year-btn").forEach(b => b.setAttribute("aria-label", yearAria(Number(b.dataset.year))));
}

function selectYear(y) {
  state.year = y;
  document.querySelectorAll(".year-btn").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.year) === y)));
  setSceneHead();
  layout(state.mode === "dist");
  renderPanel();
}

function bindModes() {
  document.querySelectorAll(".mode-btn[data-mode]").forEach(b => {
    b.addEventListener("click", () => {
      if (state.mode === b.dataset.mode) return;
      state.mode = b.dataset.mode;
      if (state.mode === "dist" && state.year === null) state.year = LAST;
      document.querySelectorAll(".year-btn").forEach(yb => yb.setAttribute("aria-pressed", String(Number(yb.dataset.year) === state.year)));
      syncMode();
      layout(true);
      renderPanel();
    });
  });
}

function setSceneHead() {
  const nameEl = document.getElementById("sceneName");
  const subEl = document.getElementById("sceneSub");
  if (state.mode === "dist") {
    nameEl.textContent = COPY.sceneNameDist;
    subEl.textContent = tpl(COPY.sceneSubDist, {
      рік: state.year || LAST
    });
  } else {
    nameEl.textContent = COPY.sceneNameDefault;
    subEl.textContent = {
      all: COPY.sceneSubAll,
      channel: COPY.sceneSubChannel,
      sex: COPY.sceneSubSex
    }[state.mode];
  }
}

function syncMode() {
  document.querySelectorAll(".mode-btn[data-mode]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.mode === state.mode)));
  setSceneHead();
  document.getElementById("sceneCap").textContent = {
    all: COPY.sceneCapAll,
    channel: COPY.sceneCapChannel,
    sex: COPY.sceneCapSex,
    dist: COPY.sceneCapDist
  }[state.mode];
  const L = document.getElementById("legend");
  const items = state.mode === "channel" ? [ [ "online", COPY.legendOnline ], [ "cnap", COPY.legendCnap ] ] : state.mode === "sex" ? [ [ "f", COPY.legendF ], [ "m", COPY.legendM ] ] : state.mode === "dist" ? [ [ "fill", COPY.legendDistPeople ], [ "meanline", COPY.legendDistMean ] ] : [ [ "frame", COPY.legendCeiling ], [ "fill", COPY.legendFill ] ];
  L.innerHTML = items.map(([cls, lab]) => `<span class="legend-item"><i class="sw sw-${cls}"></i><span>${escapeHtml(lab)}</span></span>`).join("");
  refreshAxisAria();
}

function renderPanel() {
  const p = document.getElementById("panel");
  if (state.mode === "dist") {
    p.innerHTML = panelDist(state.year || LAST);
    return;
  }
  p.innerHTML = state.year === null ? panelDefault() : panelYear(state.year);
}

function panelDist(y) {
  const yr = Y.get(y);
  const rows = (HB.get(y) || []).filter(r => !r.suppressed);
  const one = rows.find(r => r.breadth === 1);
  const top = rows.find(r => r.breadth === yr.ceiling);
  return `\n    <p class="panel-overline">${tpl(COPY.panelDistOverline, {
    рік: y
  })}</p>\n    <div class="stat-lead">\n      <span class="num">${one ? fmtPct1(one.pct) : "—"}</span>\n      <span class="lab">${COPY.panelDistLeadLab}</span>\n    </div>\n    <p class="panel-body">${tpl(COPY.panelDistBody, {
    рік: y,
    медіана: yr.median,
    середнє: fmtMean(yr.mean),
    стеля: yr.ceiling,
    стеляОсіб: top ? fmtInt(top.people) : "—",
    стеляЧастка: top ? fmtPct1(top.pct) : "—"
  })}</p>\n    <div class="kpi-grid" style="margin-top:14px">\n      <div class="kpi"><span class="num">${fmtMean(yr.mean)}</span>\n        <span class="lab">${COPY.labMean}</span></div>\n      <div class="kpi"><span class="num">${yr.median}</span>\n        <span class="lab">${COPY.labMedian}</span></div>\n      <div class="kpi"><span class="num">${yr.ceiling}</span>\n        <span class="lab">${COPY.labCeiling}</span></div>\n      <div class="kpi"><span class="num">${fmtPct(yr.utilization)}</span>\n        <span class="lab">${COPY.labUtil}</span></div>\n    </div>\n    <p class="panel-note">${fmtInt(yr.n_people)} ${COPY.labPeople.toLowerCase()}</p>`;
}

function panelDefault() {
  const last = Y.get(LAST);
  if (state.mode === "channel") {
    const c = CH.get(LAST);
    const dc = DB.meta.district_callout;
    return `\n      <p class="panel-overline">${tpl(COPY.panelChOverline, {
      рікОст: LAST
    })}</p>\n      <div class="stat-lead">\n        <span class="num">${fmtMean(c.cnap.mean)}</span>\n        <span class="lab">${COPY.panelChLeadLab}</span>\n      </div>\n      <p class="panel-body">${tpl(COPY.panelChBody, {
      рікОст: LAST,
      цнапОст: fmtMean(c.cnap.mean),
      онлайнОст: fmtMean(c.online.mean)
    })}</p>\n      <p class="panel-annot">${tpl(COPY.panelChAnnot, {
      радча: fmtMean(dc.max.mean),
      місто: fmtMean(dc.city.mean)
    })}</p>\n      <p class="panel-hint">${COPY.panelHint}</p>`;
  }
  if (state.mode === "sex") {
    const s = SX.get(LAST);
    return `\n      <p class="panel-overline">${tpl(COPY.panelSexOverline, {
      рікОст: LAST
    })}</p>\n      <div class="stat-lead">\n        <span class="num">${fmtMean(s.F.mean)}</span>\n        <span class="lab">${COPY.panelSexLeadLab}</span>\n      </div>\n      <p class="panel-body">${tpl(COPY.panelSexBody, {
      рікОст: LAST,
      жОст: fmtMean(s.F.mean),
      чОст: fmtMean(s.M.mean)
    })}</p>\n      <p class="panel-hint">${COPY.panelHint}</p>`;
  }
  const first = Y.get(YEARS[0]);
  return `\n    <p class="panel-overline">${COPY.panelAllOverline}</p>\n    <div class="stat-lead">\n      <span class="num">${fmtPct(last.utilization)}</span>\n      <span class="lab">${tpl(COPY.panelAllLeadLab, {
    рікОст: LAST
  })}</span>\n    </div>\n    <p class="panel-body">${tpl(COPY.panelAllBody, {
    рікОст: LAST,
    стеляОст: last.ceiling,
    середнєОст: fmtMean(last.mean),
    стеляПерш: first.ceiling,
    утилПерш: fmtPct(first.utilization),
    утилОст: fmtPct(last.utilization)
  })}</p>\n    <p class="panel-note">${COPY.panelAllNote}</p>\n    <p class="panel-hint">${COPY.panelHint}</p>`;
}

function panelYear(y) {
  const row = Y.get(y);
  let html = `\n    <p class="panel-overline">${COPY.panelYearOverline} · ${y}</p>\n    <div class="kpi-grid">\n      <div class="kpi"><span class="num">${fmtMean(row.mean)}</span>\n        <span class="lab">${COPY.labMean}</span></div>\n      <div class="kpi"><span class="num">${fmtPct(row.utilization)}</span>\n        <span class="lab">${COPY.labUtil}</span></div>\n      <div class="kpi"><span class="num">${row.ceiling}</span>\n        <span class="lab">${COPY.labCeiling}</span></div>\n      <div class="kpi"><span class="num">${row.median}</span>\n        <span class="lab">${COPY.labMedian}</span></div>\n    </div>\n    <p class="panel-note">${fmtInt(row.n_people)} ${COPY.labPeople.toLowerCase()}</p>`;
  if (state.mode === "channel") {
    const c = CH.get(y);
    html += cmpSection(COPY.secChannel, y, row.ceiling, [ [ COPY.rowOnline, c.online, "online" ], [ COPY.rowCnap, c.cnap, "cnap" ] ], () => {
      if (!c.online || !c.cnap || c.online.mean == null || c.cnap.mean == null) return "";
      const d = (c.cnap.mean - c.online.mean).toFixed(2).replace(".", ",");
      return tpl(COPY.gapChannel, {
        розрив: d,
        цнап: fmtMean(c.cnap.mean),
        онлайн: fmtMean(c.online.mean)
      });
    });
  } else if (state.mode === "sex") {
    const s = SX.get(y);
    html += cmpSection(COPY.secSex, y, row.ceiling, [ [ COPY.rowF, s.F, "f" ], [ COPY.rowM, s.M, "m" ] ], () => {
      if (!s.F || !s.M || s.F.mean == null || s.M.mean == null) return "";
      const d = (s.F.mean - s.M.mean).toFixed(2).replace(".", ",");
      return tpl(COPY.gapSex, {
        розрив: d,
        ж: fmtMean(s.F.mean),
        ч: fmtMean(s.M.mean)
      });
    });
  } else {
    html += `<div class="panel-sec"><p class="panel-body">${tpl(COPY.yearAllNote, {
      стеля: row.ceiling,
      рік: y,
      утиліз: fmtPct(row.utilization)
    })}</p></div>`;
  }
  return html;
}

function cmpSection(title, y, ceiling, rows, gapFn) {
  const bars = rows.map(([name, r, cls]) => {
    if (!r || r.mean == null) {
      return `<div class="cmp-row">\n        <div class="cmp-top"><i class="cmp-chip cmp-${cls}"></i>\n          <span class="cmp-name">${escapeHtml(name)}</span>\n          <span class="cmp-val cmp-supp">${COPY.suppressedCell}</span></div>\n        <div class="cmp-track"></div></div>`;
    }
    const w = Math.max(2, Math.min(100, r.mean / ceiling * 100));
    return `<div class="cmp-row">\n      <div class="cmp-top"><i class="cmp-chip cmp-${cls}"></i>\n        <span class="cmp-name">${escapeHtml(name)}</span>\n        <span class="cmp-val">${fmtMean(r.mean)} ${COPY.unitProjects}</span></div>\n      <div class="cmp-track"><div class="cmp-fill cmp-${cls}" style="width:${w.toFixed(1)}%"></div></div>\n    </div>`;
  }).join("");
  const gap = gapFn();
  return `<div class="panel-sec">\n    <h3>${escapeHtml(title)}</h3>\n    ${bars}\n    <p class="cmp-scale-note">шкала від 0 до стелі року (${ceiling})</p>\n    ${gap ? `<p class="cmp-gap">${gap}</p>` : ""}\n  </div>`;
}
