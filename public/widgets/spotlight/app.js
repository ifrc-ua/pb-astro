"use strict";

const COLORS = {
  ramp: [ [ 246, 244, 251 ], [ 238, 234, 247 ], [ 156, 139, 204 ], [ 123, 102, 184 ], [ 78, 60, 132 ] ],
  yellow: [ 255, 236, 8 ],
  ink: [ 26, 26, 26 ],
  villageFill: [ 156, 139, 204, 44 ],
  villageLine: [ 123, 102, 184, 235 ]
};

const CITY = "Івано-Франківськ";

const CAT_UA = {
  "education-school": "школи",
  "education-preschool": "садочки",
  "education-general": "освіта",
  "education-extracurricular": "позашкілля",
  "improvement-streets": "вулиці",
  "improvement-general": "благоустрій",
  heritage: "спадщина",
  greenery: "зелень",
  accessibility: "доступність",
  "afu-support": "допомога ЗСУ",
  other: "інше"
};

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

const fmt = n => n.toLocaleString("uk-UA");

let spotlight = null;

let districtFeatures = new Map;

let byYear = new Map;

let map = null;

let overlay = null;

let selected = null;

let pulseRaf = 0;

let countRaf = 0;

const $ = id => document.getElementById(id);

async function loadData() {
  const [spot, geo] = await Promise.all([ fetch("data/spotlight.json", {
    cache: "no-cache"
  }).then(r => {
    if (!r.ok) throw new Error("spotlight.json: HTTP " + r.status);
    return r.json();
  }), fetch("data/communities.geojson", {
    cache: "no-cache"
  }).then(r => {
    if (!r.ok) throw new Error("communities.geojson: HTTP " + r.status);
    return r.json();
  }) ]);
  spotlight = spot;
  for (const f of geo.features) {
    districtFeatures.set(f.properties.district, {
      feature: f,
      bbox: featureBbox(f)
    });
  }
  for (const p of spot.projects) {
    if (!byYear.has(p.year)) byYear.set(p.year, []);
    byYear.get(p.year).push(p);
  }
  return geo;
}

function featureBbox(f) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const scan = coords => {
    for (const c of coords) {
      if (typeof c[0] === "number") {
        if (c[0] < minX) minX = c[0];
        if (c[0] > maxX) maxX = c[0];
        if (c[1] < minY) minY = c[1];
        if (c[1] > maxY) maxY = c[1];
      } else scan(c);
    }
  };
  scan(f.geometry.coordinates);
  return [ minX, minY, maxX, maxY ];
}

function initMap(geo) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const {bbox} of districtFeatures.values()) {
    if (bbox[0] < minX) minX = bbox[0];
    if (bbox[1] < minY) minY = bbox[1];
    if (bbox[2] > maxX) maxX = bbox[2];
    if (bbox[3] > maxY) maxY = bbox[3];
  }
  map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/dark",
    bounds: [ [ minX, minY ], [ maxX, maxY ] ],
    fitBoundsOptions: {
      padding: {
        top: 24,
        bottom: 40,
        left: 24,
        right: 24
      }
    },
    maxBounds: [ [ minX - .35, minY - .25 ], [ maxX + .35, maxY + .25 ] ],
    minZoom: 8.5,
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
    layers: [],
    getTooltip: deckTooltip,
    getCursor: ({isDragging, isHovering}) => isDragging ? "grabbing" : isHovering ? "default" : "grab"
  });
  map.addControl(overlay);
  map.once("idle", () => {
    const deckEl = map.getContainer().querySelector("div[tabindex='0']:not([aria-label])");
    if (deckEl) deckEl.setAttribute("aria-label", "Мапа: звідки голосували за проєкт");
  });
  let refitTimer = 0;
  new ResizeObserver(() => {
    map.resize();
    clearTimeout(refitTimer);
    refitTimer = setTimeout(() => {
      if (selected) flyToSupport(selected, true);
    }, 200);
  }).observe($("map"));
  return new Promise(resolve => {
    map.on("load", () => {
      map.addLayer({
        id: "veil",
        type: "background",
        paint: {
          "background-color": "#16161D",
          "background-opacity": .45
        }
      });
      map.addSource("communities", {
        type: "geojson",
        data: geo
      });
      map.addLayer({
        id: "communities-line",
        type: "line",
        source: "communities",
        paint: {
          "line-color": "#CACAD1",
          "line-width": 1
        }
      });
      resolve();
    });
  });
}

function deckTooltip({object, layer}) {
  if (!object) return null;
  if (layer.id === "support-hex") {
    return {
      text: `${fmt(object[1])} голос${plural(object[1])} з цієї соти`
    };
  }
  if (layer.id === "support-district") {
    const p = object.properties;
    return p.isCity ? {
      text: `${p.district}: ${fmt(p.count)} голос${plural(p.count)} (без точної соти)`
    } : {
      text: `${p.district}: ${fmt(p.count)} голос${plural(p.count)} (усього по селу)`
    };
  }
  if (layer.id === "project-core" || layer.id === "project-halo") {
    if (!selected) return null;
    const t = esc(selected.title);
    return {
      html: selected.geocode_quality === "review" ? `${t}<br><span class="tip-dim">приблизне місце — точну адресу не встановлено</span>` : t
    };
  }
  return null;
}

function esc(s) {
  return String(s).replace(/[&<>]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  }[c]));
}

function plural(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "и";
  return "ів";
}

function buildLayers(p, haloRadius) {
  const d = spotlight.data[p.project_id];
  const maxC = d.hex.length ? d.hex[0][1] : 5;
  const colorFor = c => {
    const t = Math.sqrt((c - 5) / Math.max(maxC - 5, 1));
    const idx = Math.min(4, Math.floor(t * 5));
    return [ ...COLORS.ramp[idx], 185 ];
  };
  const districtData = d.district.filter(([name]) => districtFeatures.has(name)).map(([name, count]) => ({
    type: "Feature",
    geometry: districtFeatures.get(name).feature.geometry,
    properties: {
      district: name,
      count,
      isCity: name === CITY
    }
  }));
  const layers = [ new deck.GeoJsonLayer({
    id: "support-district",
    data: districtData,
    filled: true,
    getFillColor: f => f.properties.isCity ? [ 156, 139, 204, 4 ] : COLORS.villageFill,
    stroked: true,
    getLineColor: f => f.properties.isCity ? [ 123, 102, 184, 140 ] : COLORS.villageLine,
    lineWidthUnits: "pixels",
    getLineWidth: f => f.properties.isCity ? 1 : 1.25,
    pickable: true,
    parameters: {
      depthTest: false
    }
  }), new deck.H3HexagonLayer({
    id: "support-hex",
    data: d.hex,
    getHexagon: h => h[0],
    getFillColor: h => colorFor(h[1]),
    filled: true,
    stroked: true,
    getLineColor: [ 123, 102, 184, 90 ],
    lineWidthUnits: "pixels",
    getLineWidth: .5,
    extruded: false,
    pickable: true,
    parameters: {
      depthTest: false
    }
  }) ];
  if (!p.no_location) {
    layers.push(new deck.ScatterplotLayer({
      id: "project-halo",
      data: [ p ],
      getPosition: q => [ q.lng, q.lat ],
      radiusUnits: "pixels",
      getRadius: haloRadius,
      getFillColor: [ ...COLORS.yellow, 90 ],
      stroked: false,
      pickable: false,
      parameters: {
        depthTest: false
      }
    }), new deck.ScatterplotLayer({
      id: "project-core",
      data: [ p ],
      getPosition: q => [ q.lng, q.lat ],
      radiusUnits: "pixels",
      getRadius: 6,
      getFillColor: [ ...COLORS.yellow, 255 ],
      stroked: true,
      getLineColor: [ ...COLORS.ink, 255 ],
      lineWidthMinPixels: 1.5,
      pickable: true,
      parameters: {
        depthTest: false
      }
    }));
  }
  return layers;
}

function pulseHalo(p) {
  cancelAnimationFrame(pulseRaf);
  const BASE = 13;
  if (REDUCED || p.no_location) {
    overlay.setProps({
      layers: buildLayers(p, BASE)
    });
    return;
  }
  const DUR = 1100;
  let t0 = null;
  const step = now => {
    if (t0 === null) t0 = now;
    const t = Math.min(Math.max((now - t0) / DUR, 0), 1);
    const wave = Math.sin(t * Math.PI * 2.5) * (1 - t);
    overlay.setProps({
      layers: buildLayers(p, BASE * (1 + .45 * wave))
    });
    if (t < 1 && selected === p) pulseRaf = requestAnimationFrame(step);
  };
  pulseRaf = requestAnimationFrame(step);
}

function flyToSupport(p, instant = false) {
  const d = spotlight.data[p.project_id];
  if (!d) return;
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const grow = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  if (!p.no_location) grow(p.lng, p.lat);
  for (const [cell] of d.hex) {
    const [lat, lng] = h3.cellToLatLng(cell);
    grow(lng, lat);
  }
  for (const [name] of d.district) {
    const df = districtFeatures.get(name);
    if (df) {
      grow(df.bbox[0], df.bbox[1]);
      grow(df.bbox[2], df.bbox[3]);
    }
  }
  const wide = innerWidth > 679;
  map.fitBounds([ [ minX, minY ], [ maxX, maxY ] ], {
    padding: {
      top: wide ? 30 : 24,
      bottom: wide ? 56 : 24,
      left: wide ? 70 : 24,
      right: wide ? 200 : 24
    },
    maxZoom: 13.5,
    duration: REDUCED || instant ? 0 : 850,
    essential: true
  });
}

function showCounter(p) {
  cancelAnimationFrame(countRaf);
  $("counter").hidden = false;
  $("counterTitle").textContent = p.title;
  const pct = Math.round(100 * p.votes_on_map / p.votes_total);
  $("counterSub").innerHTML = p.no_location ? `проєкт без конкретної адреси · на мапі <b>${pct}%</b> голосів` : `на мапі <b>${pct}%</b> · решта — без точної локації`;
  const numEl = $("counterNum");
  if (REDUCED) {
    numEl.textContent = fmt(p.votes_total);
    return;
  }
  const DUR = 650;
  let t0 = null;
  const step = now => {
    if (t0 === null) t0 = now;
    const t = Math.min(Math.max((now - t0) / DUR, 0), 1);
    const eased = 1 - Math.pow(1 - t, 3);
    numEl.textContent = fmt(Math.round(p.votes_total * eased));
    if (t < 1) countRaf = requestAnimationFrame(step);
  };
  countRaf = requestAnimationFrame(step);
}

function showChannel(p) {
  $("channel").hidden = false;
  const bar = $("chBar");
  const labels = $("chLabels");
  if (p.channel_suppressed) {
    bar.innerHTML = '<span class="ch-seg ch-online" style="flex:1"></span>';
    bar.setAttribute("aria-label", "Майже всі голоси подано онлайн; офлайн-голосів менше п’яти — приховано");
    labels.innerHTML = '<span class="ch-lab"><i class="ch-sw ch-sw-online"></i>майже всі онлайн</span>' + '<span class="ch-note">офлайн-голосів < 5 — приховано</span>';
    return;
  }
  const total = p.votes_total;
  const elec = p.votes_electronic;
  const paper = p.votes_paper;
  const onPct = Math.round(100 * elec / total);
  const cnPct = Math.round(100 * paper / total);
  const cnW = 100 * paper / total;
  bar.innerHTML = '<span class="ch-seg ch-online" style="flex:1"></span>' + (paper > 0 ? `<span class="ch-seg ch-cnap" style="width:${cnW}%"></span>` : "");
  bar.setAttribute("aria-label", `Онлайн ${fmt(elec)} голос${plural(elec)} (${onPct}%), через ЦНАП ${fmt(paper)} (${cnPct}%)`);
  labels.innerHTML = `<span class="ch-lab"><i class="ch-sw ch-sw-online"></i>онлайн <b>${fmt(elec)}</b> (${onPct}%)</span>` + `<span class="ch-lab"><i class="ch-sw ch-sw-cnap"></i>ЦНАП <b>${fmt(paper)}</b> (${cnPct}%)</span>`;
}

function showSex(p) {
  const bar = $("sexBar");
  const labels = $("sexLabels");
  if (p.sex_suppressed) {
    bar.innerHTML = '<span class="ch-seg ch-female" style="flex:1"></span>';
    bar.setAttribute("aria-label", "Розподіл за статтю приховано: менша частка — менше п’яти голосів");
    labels.innerHTML = '<span class="ch-note">розподіл за статтю приховано (< 5)</span>';
    return;
  }
  const total = p.votes_total;
  const f = p.votes_female;
  const m = p.votes_male;
  const fPct = Math.round(100 * f / total);
  const mPct = Math.round(100 * m / total);
  const mW = 100 * m / total;
  bar.innerHTML = '<span class="ch-seg ch-female" style="flex:1"></span>' + (m > 0 ? `<span class="ch-seg ch-male" style="width:${mW}%"></span>` : "");
  bar.setAttribute("aria-label", `Жінки ${fmt(f)} (${fPct}%), чоловіки ${fmt(m)} (${mPct}%)`);
  labels.innerHTML = `<span class="ch-lab"><i class="ch-sw ch-sw-female"></i>жінки <b>${fmt(f)}</b> (${fPct}%)</span>` + `<span class="ch-lab"><i class="ch-sw ch-sw-male"></i>чоловіки <b>${fmt(m)}</b> (${mPct}%)</span>`;
}

function selectProject(p) {
  selected = p;
  for (const el of document.querySelectorAll(".pitem")) {
    const on = el.dataset.pid === p.project_id;
    el.classList.toggle("active", on);
    el.setAttribute("aria-pressed", String(on));
  }
  showCounter(p);
  showChannel(p);
  showSex(p);
  pulseHalo(p);
  flyToSupport(p);
}

function renderList(year) {
  const list = $("plist");
  list.innerHTML = "";
  const items = byYear.get(year);
  $("railCap").textContent = `Переможці ${year} · ${items.length}, за голосами`;
  for (const [i, p] of items.entries()) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "pitem";
    btn.dataset.pid = p.project_id;
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = `<span class="pitem-rank">${i + 1}</span>` + `<span class="pitem-body">` + `<span class="pitem-title"></span>` + `<span class="pitem-meta"><b>${fmt(p.votes_total)}</b><span class="pitem-cat"></span></span>` + `</span>`;
    btn.querySelector(".pitem-title").textContent = p.title;
    btn.title = p.title;
    btn.querySelector(".pitem-cat").textContent = p.no_location ? ` голос${plural(p.votes_total)} · ${CAT_UA[p.category] || p.category} · без адреси` : ` голос${plural(p.votes_total)} · ${CAT_UA[p.category] || p.category}`;
    btn.addEventListener("click", () => selectProject(p));
    li.appendChild(btn);
    list.appendChild(li);
  }
}

function renderYears() {
  const years = [ ...byYear.keys() ].sort();
  const nav = $("years");
  for (const y of years) {
    const b = document.createElement("button");
    b.className = "year-btn";
    b.textContent = y;
    b.addEventListener("click", () => {
      for (const el of nav.children) el.classList.toggle("active", el === b);
      renderList(y);
      selectProject(byYear.get(y)[0]);
      $("plist").scrollTo({
        top: 0,
        left: 0
      });
    });
    nav.appendChild(b);
  }
  return years;
}

const WEBGL_MSG = "Цей віджет показує інтерактивну мапу й потребує підтримки 3D-графіки (WebGL), яка зараз недоступна у вашому браузері. Відкрийте сторінку на телефоні чи іншому пристрої або увімкніть апаратне прискорення в налаштуваннях браузера.";

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch (e) {
    return false;
  }
}

function showNoWebGL() {
  const l = $("loading");
  const sp = l && l.querySelector(".spinner");
  if (sp) sp.remove();
  const t = $("loadingText");
  t.textContent = WEBGL_MSG;
  t.style.maxWidth = "34ch";
  t.style.lineHeight = "1.55";
}

window.__pb = {
  map: () => map,
  selected: () => selected,
  data: () => spotlight
};

(async function main() {
  if (!hasWebGL()) {
    showNoWebGL();
    return;
  }
  try {
    const geo = await loadData();
    await initMap(geo);
    const years = renderYears();
    const last = years[years.length - 1];
    [ ...$("years").children ].find(b => +b.textContent === last).classList.add("active");
    renderList(last);
    $("loading").classList.add("hidden");
    selectProject(byYear.get(last)[0]);
  } catch (err) {
    $("loadingText").textContent = "Не вдалося завантажити дані: " + err.message;
    console.error(err);
  }
})();
