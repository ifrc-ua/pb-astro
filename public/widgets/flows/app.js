const STATE = {
  data: null,
  year: "all",
  level: "grouped"
};

let _rt;

const C = typeof window !== "undefined" && window.CONTENT || {};

function tpl(s, vars) {
  return String(s == null ? "" : s).replace(/\{(\w+)\}/g, (m, k) => k in vars ? vars[k] : m);
}

function applyStaticText() {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.textContent = val;
  };
  if (C.pageTitle) document.title = C.pageTitle;
  const meta = document.getElementById("metaDescription");
  if (meta && C.metaDescription) meta.setAttribute("content", C.metaDescription);
  set("srDesc", C.srDescription);
  set("overline", C.overline);
  set("title", C.title);
  const _sub = document.getElementById("contextLine");
  if (_sub && C.subtitle != null) _sub.innerHTML = C.subtitle;
  set("levelGrouped", C.levelGrouped);
  set("levelVillages", C.levelVillages);
  set("yearsLabel", C.yearsLabel);
  set("loadingText", C.loading);
  const aria = C.aria || {};
  const setAria = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.setAttribute("aria-label", val);
  };
  setAria("levelsBox", aria.levels);
  setAria("yearsBox", aria.years);
  setAria("scene", aria.scene);
  setAria("sankey", aria.sankey);
}

const LABELS = C.groupLabels || {
  city: "Місто",
  village: "Села"
};

const COLOR = {
  city: "#3E5266",
  village: "#5A7085"
};

const SELF_FILL = "#E0A73E";

const SELF_CASING = null;

async function boot() {
  try {
    applyStaticText();
    const res = await fetch("data/flows.json");
    STATE.data = await res.json();
    buildYearAxis();
    buildNotes();
    updateContext();
    render();
    document.getElementById("loading").hidden = true;
    const ro = new ResizeObserver(() => {
      clearTimeout(_rt);
      _rt = setTimeout(render, 120);
    });
    ro.observe(document.getElementById("sankeyWrap"));
  } catch (e) {
    document.getElementById("loading").innerHTML = `<span>${C.loadError || "Помилка завантаження даних."}</span>`;
    console.error(e);
    return;
  }
}

function buildNotes() {
  const m = STATE.data.meta;
  const vars = {
    denominators: m.note_denominators,
    coverage: m.note_coverage
  };
  const notes = C.notes && C.notes.length ? C.notes : [];
  document.getElementById("noteList").innerHTML = notes.map(n => `<li>${tpl(n, vars)}</li>`).join("");
}

function villageRanking(year) {
  const bvd = STATE.data.by_voter_district[year];
  return bvd.filter(r => r.type === "village").map(r => {
    const own = r.same;
    const city = r.to_city;
    const otherVillage = r.to_village - r.same;
    return {
      name: r.district,
      own,
      otherVillage,
      city,
      total: r.votes,
      ownPct: r.same_pct,
      people: r.people
    };
  }).sort((a, b) => b.ownPct - a.ownPct);
}

function graphGrouped(year) {
  const g = STATE.data.groups[year];
  const N = C.nodes || {};
  const nodes = [ {
    id: "v:city",
    side: "v",
    type: "city",
    label: N.voterCity || "Місто (виборці)"
  }, {
    id: "v:village",
    side: "v",
    type: "village",
    label: N.voterVillage || "Села (виборці)"
  }, {
    id: "p:city",
    side: "p",
    type: "city",
    label: N.projCity || "Міські проєкти"
  }, {
    id: "p:village",
    side: "p",
    type: "village",
    label: N.projVillage || "Сільські проєкти"
  } ];
  const links = [ {
    source: "v:city",
    target: "p:city",
    value: g.cc,
    srcType: "city",
    key: "cc",
    opacity: .45
  }, {
    source: "v:city",
    target: "p:village",
    value: g.cv,
    srcType: "city",
    key: "cv",
    opacity: .45
  }, {
    source: "v:village",
    target: "p:city",
    value: g.vc,
    srcType: "village",
    key: "vc",
    opacity: .45
  }, {
    source: "v:village",
    target: "p:village",
    value: g.vv,
    srcType: "village",
    key: "vv",
    opacity: .45
  } ].filter(l => l.value > 0);
  return {
    nodes,
    links
  };
}

function layoutVertical(graph, W, H) {
  const s = d3.sankey().nodeId(d => d.id).nodeWidth(14).nodePadding(14).nodeAlign(d3.sankeyJustify).extent([ [ 10, 22 ], [ H - 10, W - 28 ] ]);
  const res = s({
    nodes: graph.nodes.map(d => ({
      ...d
    })),
    links: graph.links.map(d => ({
      ...d
    }))
  });
  res.nodes.forEach(n => {
    [n.x0, n.y0] = [ n.y0, n.x0 ];
    [n.x1, n.y1] = [ n.y1, n.x1 ];
  });
  return res;
}

function sankeyLinkVertical() {
  return d3.linkVertical().source(d => [ d.source.x0 + (d.source.x1 - d.source.x0) / 2, d.source.y1 ]).target(d => [ d.target.x0 + (d.target.x1 - d.target.x0) / 2, d.target.y0 ]);
}

function layout(graph, W, H) {
  const sankey = d3.sankey().nodeId(d => d.id).nodeWidth(14).nodePadding(18).nodeAlign(d3.sankeyJustify).extent([ [ 4, 10 ], [ W - 4, H - 10 ] ]);
  return sankey({
    nodes: graph.nodes.map(d => ({
      ...d
    })),
    links: graph.links.map(d => ({
      ...d
    }))
  });
}

function render() {
  if (STATE.level === "villages") {
    renderVillageRanking(STATE.year);
    return;
  }
  const wrap = document.getElementById("sankeyWrap");
  const rank = document.getElementById("villageRanking");
  if (rank) rank.hidden = true;
  const svgEl = document.getElementById("sankey");
  svgEl.style.display = "";
  const cw = wrap.clientWidth || 900;
  const graph = graphGrouped(STATE.year);
  const narrow = cw < 520;
  const vCount = graph.nodes.filter(n => n.side === "v").length;
  const vertical = narrow;
  const W = cw;
  const H = vertical ? Math.max(420, vCount * 26 + 120) : Math.max(260, Math.min(440, W * .5));
  const g = vertical ? layoutVertical(graph, W, H) : layout(graph, W, H);
  const linkPath = vertical ? sankeyLinkVertical() : d3.sankeyLinkHorizontal();
  wrap.style.overflowX = W > cw ? "auto" : "";
  const svg = d3.select("#sankey").attr("viewBox", `0 0 ${W} ${H}`).attr("height", H).style("width", W > cw ? W + "px" : "100%").style("min-width", W > cw ? W + "px" : null).style("overflow", "visible");
  svg.selectAll("*").remove();
  const linkG = svg.append("g").attr("fill", "none");
  linkG.append("g").selectAll("path").data(g.links).join("path").attr("d", linkPath).attr("stroke", d => COLOR[d.srcType]).attr("stroke-opacity", d => d.opacity).attr("stroke-width", d => Math.max(1, d.width)).attr("class", "ribbon");
  const node = svg.append("g").selectAll("g").data(g.nodes).join("g");
  node.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => d.x1 - d.x0).attr("height", d => Math.max(1, d.y1 - d.y0)).attr("fill", d => COLOR[d.type]).attr("rx", 2);
  node.append("text").attr("text-anchor", d => vertical ? "middle" : d.side === "v" ? "start" : "end").attr("x", d => vertical ? (d.x0 + d.x1) / 2 : d.side === "v" ? d.x1 + 6 : d.x0 - 6).attr("y", d => vertical ? d.side === "v" ? d.y0 - 6 : d.y1 + 14 : (d.y0 + d.y1) / 2).attr("dy", d => vertical ? null : "0.35em").attr("class", "node-label").attr("font-weight", 700).text(d => d.label);
  const tip = document.getElementById("tooltip");
  const fmt = n => n.toLocaleString("uk");
  const yg = STATE.data.groups[STATE.year];
  const ygPeople = STATE.data.groups_people && STATE.data.groups_people[STATE.year] || {};
  function ribbonText(d) {
    const from = d.source.name || LABELS[d.source.type];
    const to = d.target.name || LABELS[d.target.type];
    const srcTotal = d.srcType === "city" ? yg.cc + yg.cv : yg.vc + yg.vv;
    const pct = srcTotal ? Math.round(d.value / srcTotal * 100) : 0;
    return tpl(C.ribbonTip || "{votes} голосів ({pct}%): {from} → {to}", {
      votes: fmt(d.value),
      pct,
      from,
      to
    });
  }
  function ribbonVotersText(d) {
    const people = ygPeople[d.key] || 0;
    return tpl(C.ribbonTipVoters || "{people} унікальних виборців", {
      people: fmt(people)
    });
  }
  const ribbonHtml = d => `${ribbonText(d)}<br>${ribbonVotersText(d)}`;
  const ribbonLabel = d => `${ribbonText(d)}. ${ribbonVotersText(d)}`;
  const wrapEl = document.getElementById("sankeyWrap");
  svg.selectAll(".ribbon").attr("tabindex", 0).attr("role", "img").attr("aria-label", ribbonLabel).on("mousemove", (ev, d) => {
    tip.hidden = false;
    tip.innerHTML = ribbonHtml(d);
    const r = wrapEl.getBoundingClientRect();
    tip.style.left = ev.clientX - r.left + 8 + "px";
    tip.style.top = ev.clientY - r.top + 8 + "px";
  }).on("mouseleave", () => {
    tip.hidden = true;
  }).on("focus", function(ev, d) {
    tip.hidden = false;
    tip.innerHTML = ribbonHtml(d);
    const b = this.getBoundingClientRect(), r = wrapEl.getBoundingClientRect();
    tip.style.left = b.left - r.left + "px";
    tip.style.top = b.top - r.top + "px";
  }).on("blur", () => {
    tip.hidden = true;
  });
}

const LEG = C.legend || {};

const SEG = [ {
  key: "own",
  color: SELF_FILL,
  casing: SELF_CASING,
  label: LEG.own || "за свої проєкти"
}, {
  key: "otherVillage",
  color: COLOR.village,
  label: LEG.otherVillage || "за проєкти інших сіл"
}, {
  key: "city",
  color: COLOR.city,
  label: LEG.city || "за міські проєкти"
} ];

function renderVillageRanking(year) {
  const wrap = document.getElementById("sankeyWrap");
  wrap.style.overflowX = "";
  document.getElementById("sankey").style.display = "none";
  let host = document.getElementById("villageRanking");
  if (!host) {
    host = document.createElement("div");
    host.id = "villageRanking";
    host.className = "ranking";
    host.setAttribute("role", "list");
    host.setAttribute("aria-label", C.aria && C.aria.ranking || "Рейтинг сіл за часткою голосів за власні проєкти");
    const legend = document.createElement("div");
    legend.className = "rank-legend";
    legend.setAttribute("aria-hidden", "true");
    legend.innerHTML = SEG.map(s => `<span class="rank-leg-item"><span class="rank-swatch" style="background:${s.color};${s.casing ? "border-color:" + s.casing : ""}"></span>${s.label}</span>`).join("");
    const head = document.createElement("div");
    head.className = "rank-head";
    head.setAttribute("aria-hidden", "true");
    head.innerHTML = `<span class="rank-head-name"></span>` + `<span class="rank-head-bar">${C.rankColShare || ""}</span>` + `<span class="rank-head-pct"></span>` + `<span class="rank-head-proj">${C.rankColProjects || "проєктів"}</span>`;
    const rows = document.createElement("div");
    rows.className = "rank-rows";
    host.appendChild(legend);
    host.appendChild(head);
    host.appendChild(rows);
    wrap.appendChild(host);
  }
  host.hidden = false;
  const rowsBox = host.querySelector(".rank-rows");
  rowsBox.innerHTML = "";
  const fmt = n => n.toLocaleString("uk");
  const tip = document.getElementById("tooltip");
  const data = villageRanking(year);
  const projByDist = STATE.data.projects_by_district && STATE.data.projects_by_district[year] || {};
  data.forEach(d => {
    const nProj = projByDist[d.name] || 0;
    const aria = tpl(C.rankRowAria || "{name}: за своє {ownPct}% ({own} голосів), за інші села {otherPct}% ({other}), " + "за місто {cityPct}% ({city}). Усього {total} голосів.", {
      name: d.name,
      ownPct: Math.round(d.own / d.total * 100),
      own: fmt(d.own),
      otherPct: Math.round(d.otherVillage / d.total * 100),
      other: fmt(d.otherVillage),
      cityPct: Math.round(d.city / d.total * 100),
      city: fmt(d.city),
      total: fmt(d.total),
      projects: nProj,
      people: fmt(d.people || 0)
    });
    const row = document.createElement("div");
    row.className = "rank-row";
    row.setAttribute("role", "listitem");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-label", aria);
    const name = document.createElement("span");
    name.className = "rank-name";
    name.textContent = d.name;
    const barWrap = document.createElement("div");
    barWrap.className = "rank-barwrap";
    const bar = document.createElement("div");
    bar.className = "rank-bar";
    SEG.forEach(s => {
      const v = d[s.key];
      if (v <= 0) return;
      const seg = document.createElement("span");
      seg.className = "rank-seg rank-seg-" + s.key;
      seg.style.width = v / d.total * 100 + "%";
      seg.style.background = s.color;
      const segPct = Math.round(v / d.total * 100);
      const segTip1 = tpl(C.segmentTip || "{name}: {votes} голосів {label} ({pct}%)", {
        name: d.name,
        votes: fmt(v),
        label: s.label,
        pct: segPct
      });
      const segTip2 = tpl(C.segmentTipVoters || "{people} виборців у селі", {
        people: fmt(d.people || 0)
      });
      const segTipHtml = `${segTip1}<br>${segTip2}`;
      seg.addEventListener("mousemove", ev => showTip(tip, wrap, ev, segTipHtml, true));
      seg.addEventListener("mouseleave", () => {
        tip.hidden = true;
      });
      bar.appendChild(seg);
    });
    barWrap.appendChild(bar);
    const pct = document.createElement("span");
    pct.className = "rank-pct";
    pct.textContent = Math.round(d.ownPct) + "%";
    const proj = document.createElement("span");
    proj.className = "rank-proj";
    proj.textContent = nProj;
    row.appendChild(name);
    row.appendChild(barWrap);
    row.appendChild(pct);
    row.appendChild(proj);
    row.addEventListener("focus", () => {
      tip.hidden = false;
      tip.textContent = aria;
      const b = row.getBoundingClientRect(), r = wrap.getBoundingClientRect();
      tip.style.left = b.left - r.left + 8 + "px";
      tip.style.top = b.bottom - r.top + 4 + "px";
    });
    row.addEventListener("blur", () => {
      tip.hidden = true;
    });
    rowsBox.appendChild(row);
  });
}

function showTip(tip, wrap, ev, text, html) {
  tip.hidden = false;
  if (html) tip.innerHTML = text; else tip.textContent = text;
  const r = wrap.getBoundingClientRect();
  tip.style.left = ev.clientX - r.left + 8 + "px";
  tip.style.top = ev.clientY - r.top + 8 + "px";
}

function setLevel(level) {
  STATE.level = level;
  document.getElementById("levelGrouped").setAttribute("aria-checked", String(level === "grouped"));
  document.getElementById("levelVillages").setAttribute("aria-checked", String(level === "villages"));
  updateContext();
  render();
}

document.getElementById("levelGrouped").addEventListener("click", () => setLevel("grouped"));

document.getElementById("levelVillages").addEventListener("click", () => setLevel("villages"));

function buildYearAxis() {
  const axis = document.getElementById("yearAxis");
  const years = [ ...STATE.data.meta.years.map(String), "all" ];
  axis.innerHTML = "";
  years.forEach(y => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "year-btn";
    b.textContent = y === "all" ? C.yearAll || "Усі" : y;
    b.setAttribute("aria-pressed", String(y === STATE.year));
    b.addEventListener("click", () => setYear(y));
    axis.appendChild(b);
  });
}

function setYear(y) {
  STATE.year = y;
  const years = [ ...STATE.data.meta.years.map(String), "all" ];
  document.getElementById("yearAxis").querySelectorAll(".year-btn").forEach((b, i) => {
    b.setAttribute("aria-pressed", String(years[i] === y));
  });
  updateContext();
  render();
}

function updateContext() {
  const bvd = STATE.data.by_voter_district[STATE.year];
  const g = STATE.data.groups[STATE.year];
  const villages = bvd.filter(r => r.type === "village");
  const vVotes = villages.reduce((s, r) => s + r.votes, 0);
  const vSame = villages.reduce((s, r) => s + r.same, 0);
  const vPct = vVotes ? Math.round(vSame / vVotes * 100) : 0;
  const cityTotal = g.cc + g.cv;
  const cityPct = cityTotal ? Math.round(g.cv / cityTotal * 100) : 0;
  const cityLocalPct = cityTotal ? Math.round(g.cc / cityTotal * 100) : 0;
  const villTotal = g.vc + g.vv;
  const villToVillPct = villTotal ? Math.round(g.vv / villTotal * 100) : 0;
  const villToCityPct = 100 - villToVillPct;
  const cap = document.getElementById("sceneCap");
  if (STATE.level === "villages") {
    cap.innerHTML = tpl(C.villagesCaption || "Села віддають загалом <strong>{pct}%</strong> голосів проєктам свого села. " + "Рейтинг — за часткою «за своє»: зверху ті, де є власні проєкти й мобілізація, " + "знизу — ті, що голосують переважно за міські.", {
      pct: vPct
    });
  } else {
    cap.innerHTML = tpl(C.groupedCaption || "Села віддали <strong>{villToVillPct}%</strong> голосів сільським проєктам, {villToCityPct}% — міським; " + "місто <strong>{cityLocalPct}%</strong> голосувало за міські, <strong>{cityPct}%</strong> ({cityToVillage}) — за сільські.", {
      villToVillPct,
      villToCityPct,
      cityLocalPct,
      cityPct,
      cityToVillage: g.cv.toLocaleString("uk")
    });
  }
}

document.addEventListener("DOMContentLoaded", boot);
