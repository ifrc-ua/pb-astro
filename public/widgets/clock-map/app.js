"use strict";

const CONFIG = {
  DURATION_S: 90,
  SLOT_S: 1800,
  MIN_SLOT_W: .1,
  GAMMA: .55,
  FLASH_WALL_S: .6,
  TRACE_ALPHA: 48,
  TRACE_RADIUS: 1.6,
  FLASH_RADIUS: 3,
  FLASH_ALPHA: 200,
  GEN_CHUNK: 4e4
};

const CHANNELS = {
  Електронний: {
    key: "elec",
    color: [ 101, 78, 163 ]
  },
  Паперовий: {
    key: "paper",
    color: [ 14, 124, 140 ]
  }
};

const WEEKDAYS = [ "Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота" ];

const MONTHS_GEN = [ "січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня" ];

const SPAN_S = {
  "30m": 1800,
  "2h": 7200,
  "1d": 86400
};

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const el = {
  years: document.getElementById("years"),
  slider: document.getElementById("slider"),
  ticks: document.getElementById("ticks"),
  playBtn: document.getElementById("playBtn"),
  bigPlay: document.getElementById("bigPlay"),
  speeds: document.getElementById("speeds"),
  counterNum: document.getElementById("counterNum"),
  counterCap: document.getElementById("counterCap"),
  captionDate: document.getElementById("captionDate"),
  captionDay: document.getElementById("captionDay"),
  daynight: document.getElementById("daynight"),
  loading: document.getElementById("loading"),
  loadingText: document.getElementById("loadingText")
};

window.addEventListener("error", e => {
  if (el.loading && !el.loading.classList.contains("hidden")) {
    el.loadingText.textContent = "Помилка віджета: " + (e.message || "невідома");
  }
});

window.addEventListener("unhandledrejection", e => {
  if (el.loading && !el.loading.classList.contains("hidden")) {
    el.loadingText.textContent = "Помилка віджета: " + (e.reason && e.reason.message ? e.reason.message : String(e.reason));
  }
});

const state = {
  meta: null,
  eventsByYear: new Map,
  districts: null,
  yearCache: new Map,
  cur: null,
  wallT: 0,
  playing: false,
  speed: 1,
  scrubbing: false,
  wasPlayingBeforeScrub: false,
  lastFrame: 0,
  dirty: true
};

let map = null;

let overlay = null;

let filterExt = null;

function fmtInt(n) {
  const s = String(Math.round(n));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += " ";
    out += s[i];
  }
  return out;
}

function voteWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "голос";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "голоси";
  return "голосів";
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function parseISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function countLE(arr, v) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if (arr[mid] <= v) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function shoelace(ring) {
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function prepDistricts(geo) {
  const out = {};
  for (const f of geo.features) {
    const polys = f.geometry.type === "Polygon" ? [ f.geometry.coordinates ] : f.geometry.coordinates;
    const items = polys.map(rings => {
      const outer = rings[0];
      const holes = rings.slice(1);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of outer) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return {
        outer,
        holes,
        bbox: [ minX, minY, maxX, maxY ],
        area: Math.abs(shoelace(outer))
      };
    });
    const totalArea = items.reduce((s, it) => s + it.area, 0);
    out[f.properties.district] = {
      items,
      totalArea
    };
  }
  return out;
}

function randomPointIn(district) {
  const d = state.districts[district];
  let r = Math.random() * d.totalArea;
  let item = d.items[d.items.length - 1];
  for (const it of d.items) {
    r -= it.area;
    if (r <= 0) {
      item = it;
      break;
    }
  }
  const [minX, minY, maxX, maxY] = item.bbox;
  for (let i = 0; i < 120; i++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    if (pointInRing(x, y, item.outer) && !item.holes.some(h => pointInRing(x, y, h))) {
      return [ x, y ];
    }
  }
  return item.outer[0];
}

async function ensureYear(year) {
  if (state.yearCache.has(year)) return state.yearCache.get(year);
  const yMeta = state.meta.years[String(year)];
  const events = state.eventsByYear.get(year) || [];
  const startUTC = parseISODate(yMeta.start);
  const days = yMeta.days;
  const campEnd = days * 86400;
  const nSlots = days * 48;
  const slotCounts = new Float64Array(nSlots);
  let total = 0;
  for (const e of events) {
    const t0 = (parseISODate(e.bucket.slice(0, 10)) - startUTC) / 1e3 + Number(e.bucket.slice(11, 13)) * 3600 + Number(e.bucket.slice(14, 16)) * 60;
    const span = SPAN_S[e.bucket_span] || 1800;
    const s0 = Math.max(0, Math.min(nSlots - 1, Math.floor(t0 / CONFIG.SLOT_S)));
    const sN = Math.max(1, Math.min(nSlots - s0, Math.round(span / CONFIG.SLOT_S)));
    const per = e.count / sN;
    for (let i = 0; i < sN; i++) slotCounts[s0 + i] += per;
    total += e.count;
  }
  let cmax = 0;
  for (let i = 0; i < nSlots; i++) if (slotCounts[i] > cmax) cmax = slotCounts[i];
  const weights = new Float64Array(nSlots);
  let wSum = 0;
  for (let i = 0; i < nSlots; i++) {
    const w = CONFIG.MIN_SLOT_W + (1 - CONFIG.MIN_SLOT_W) * (cmax > 0 ? Math.pow(slotCounts[i] / cmax, CONFIG.GAMMA) : 0);
    weights[i] = w;
    wSum += w;
  }
  const cumWall = new Float64Array(nSlots + 1);
  for (let i = 0; i < nSlots; i++) {
    cumWall[i + 1] = cumWall[i] + weights[i] / wSum * CONFIG.DURATION_S;
  }
  const pool = state.meta.village_pool;
  const vt = (state.villageTotals || []).filter(r => r.year === year);
  const samplers = {};
  for (const chName in CHANNELS) {
    const names = [], cum = [];
    let acc = 0;
    for (const r of vt) {
      if (r.channel !== chName || !state.districts[r.district]) continue;
      acc += r.count;
      names.push(r.district);
      cum.push(acc);
    }
    samplers[chName] = {
      names,
      cum,
      total: acc
    };
  }
  const pickVillage = chName => {
    const s = samplers[chName];
    if (!s || !s.total) return null;
    const r = Math.random() * s.total;
    let lo = 0, hi = s.cum.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (s.cum[mid] <= r) lo = mid + 1; else hi = mid;
    }
    return s.names[lo < s.names.length ? lo : s.names.length - 1];
  };
  const raw = {
    x: [],
    y: [],
    t: [],
    color: []
  };
  let sinceYield = 0;
  for (const e of events) {
    const ch = CHANNELS[e.channel];
    if (!ch) continue;
    const isPool = e.district === pool;
    if (!isPool && !state.districts[e.district]) continue;
    const t0 = (parseISODate(e.bucket.slice(0, 10)) - startUTC) / 1e3 + Number(e.bucket.slice(11, 13)) * 3600 + Number(e.bucket.slice(14, 16)) * 60;
    const span = SPAN_S[e.bucket_span] || 1800;
    const tMax = Math.min(t0 + span, campEnd);
    for (let k = 0; k < e.count; k++) {
      const dist = isPool ? pickVillage(e.channel) : e.district;
      if (!dist) continue;
      const p = randomPointIn(dist);
      raw.x.push(p[0]);
      raw.y.push(p[1]);
      raw.t.push(t0 + Math.random() * (tMax - t0));
      raw.color.push(ch.color);
    }
    sinceYield += e.count;
    if (sinceYield >= CONFIG.GEN_CHUNK) {
      sinceYield = 0;
      await new Promise(r => setTimeout(r, 0));
    }
  }
  const n = raw.t.length;
  const idx = Array.from({
    length: n
  }, (_, i) => i);
  idx.sort((a, z) => raw.t[a] - raw.t[z]);
  const pos = new Float32Array(n * 2);
  const t = new Float32Array(n);
  const rgbaTrace = new Uint8Array(n * 4);
  const rgbaFlash = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const j = idx[i];
    pos[i * 2] = raw.x[j];
    pos[i * 2 + 1] = raw.y[j];
    t[i] = raw.t[j];
    const c = raw.color[j];
    const o = i * 4;
    rgbaTrace[o] = c[0];
    rgbaTrace[o + 1] = c[1];
    rgbaTrace[o + 2] = c[2];
    rgbaTrace[o + 3] = CONFIG.TRACE_ALPHA;
    rgbaFlash[o] = c[0];
    rgbaFlash[o + 1] = c[1];
    rgbaFlash[o + 2] = c[2];
    rgbaFlash[o + 3] = CONFIG.FLASH_ALPHA;
  }
  const prepared = {
    year,
    startUTC,
    days,
    campEnd,
    nSlots,
    cumWall,
    duration: CONFIG.DURATION_S,
    total,
    n,
    pos,
    t,
    rgbaTrace,
    rgbaFlash
  };
  state.yearCache.set(year, prepared);
  return prepared;
}

function wallToCamp(y, wall) {
  if (wall <= 0) return 0;
  if (wall >= y.duration) return y.campEnd;
  const cw = y.cumWall;
  let lo = 0, hi = y.nSlots;
  while (lo < hi - 1) {
    const mid = lo + hi >> 1;
    if (cw[mid] <= wall) lo = mid; else hi = mid;
  }
  const seg = cw[lo + 1] - cw[lo];
  const frac = seg > 0 ? (wall - cw[lo]) / seg : 0;
  return (lo + frac) * CONFIG.SLOT_S;
}

function campToWall(y, tc) {
  if (tc <= 0) return 0;
  if (tc >= y.campEnd) return y.duration;
  const i = Math.min(Math.floor(tc / CONFIG.SLOT_S), y.nSlots - 1);
  const frac = tc / CONFIG.SLOT_S - i;
  return y.cumWall[i] + frac * (y.cumWall[i + 1] - y.cumWall[i]);
}

function campSlope(y, wall) {
  const tc = wallToCamp(y, wall);
  const i = Math.min(Math.floor(tc / CONFIG.SLOT_S), y.nSlots - 1);
  const seg = y.cumWall[i + 1] - y.cumWall[i];
  return seg > 0 ? CONFIG.SLOT_S / seg : 0;
}

function buildLayers(tc, flashCamp) {
  const c = state.cur;
  if (!c || !c.n) return [];
  const base = rgba => ({
    data: {
      length: c.n,
      attributes: {
        getPosition: {
          value: c.pos,
          size: 2
        },
        getFilterValue: {
          value: c.t,
          size: 1
        },
        getFillColor: {
          value: rgba,
          size: 4
        }
      }
    },
    radiusUnits: "pixels",
    stroked: false,
    extensions: [ filterExt ],
    parameters: {
      depthTest: false
    }
  });
  const layers = [ new deck.ScatterplotLayer({
    id: "votes-trace",
    ...base(c.rgbaTrace),
    getRadius: CONFIG.TRACE_RADIUS,
    filterRange: [ -1, tc ]
  }) ];
  if (flashCamp > 0) {
    layers.push(new deck.ScatterplotLayer({
      id: "votes-flash",
      ...base(c.rgbaFlash),
      getRadius: CONFIG.FLASH_RADIUS,
      filterRange: [ tc - flashCamp, tc ],
      filterSoftRange: [ tc - flashCamp * .4, tc ]
    }));
  }
  return layers;
}

function frame(now) {
  requestAnimationFrame(frame);
  const y = state.cur;
  if (!y) return;
  const dt = state.lastFrame ? Math.min((now - state.lastFrame) / 1e3, .1) : 0;
  state.lastFrame = now;
  if (state.playing && !state.scrubbing) {
    state.wallT += dt * state.speed;
    if (state.wallT >= y.duration) {
      state.wallT = y.duration;
      setPlaying(false, true);
    }
    state.dirty = true;
  }
  if (!state.dirty) return;
  state.dirty = false;
  const tc = wallToCamp(y, state.wallT);
  let flashCamp = 0;
  if (state.playing && !REDUCED_MOTION) {
    flashCamp = CONFIG.FLASH_WALL_S * state.speed * campSlope(y, state.wallT);
  }
  overlay.setProps({
    layers: buildLayers(tc, flashCamp)
  });
  const cnt = countLE(y.t, tc);
  el.counterNum.textContent = fmtInt(cnt);
  el.counterCap.textContent = voteWord(cnt) + " із " + fmtInt(y.total);
  const tcDisp = Math.min(tc, y.campEnd - 30);
  const ms = y.startUTC + tcDisp * 1e3;
  const d = new Date(ms);
  const dayN = Math.min(Math.floor(tcDisp / 86400) + 1, y.days);
  el.captionDate.textContent = WEEKDAYS[d.getUTCDay()] + ", " + d.getUTCDate() + " " + MONTHS_GEN[d.getUTCMonth()] + " · " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes());
  el.captionDay.textContent = "День " + dayN + " з " + y.days;
  const hour = tcDisp % 86400 / 3600;
  el.daynight.classList.toggle("night", hour < 6 || hour >= 21);
  if (!state.scrubbing) {
    const v = Math.round(state.wallT / y.duration * 1e4);
    el.slider.value = String(v);
  }
  el.slider.style.setProperty("--progress", (state.wallT / y.duration * 100).toFixed(2) + "%");
  el.slider.setAttribute("aria-valuetext", el.captionDate.textContent + ", " + el.captionDay.textContent);
}

function setPlaying(playing, ended) {
  state.playing = playing;
  el.playBtn.classList.toggle("playing", playing);
  el.playBtn.classList.toggle("ended", !playing && !!ended);
  el.playBtn.setAttribute("aria-label", playing ? "Пауза" : ended ? "Відтворити знову" : "Відтворити");
  el.bigPlay.classList.toggle("hidden", playing);
  state.dirty = true;
}

function togglePlay() {
  const y = state.cur;
  if (!y) return;
  if (!state.playing && state.wallT >= y.duration) state.wallT = 0;
  setPlaying(!state.playing);
}

function buildTicks(y) {
  el.ticks.replaceChildren();
  for (let d = 1; d < y.days; d++) {
    const wall = campToWall(y, d * 86400);
    const tick = document.createElement("i");
    tick.className = "tick";
    tick.style.left = (wall / y.duration * 100).toFixed(2) + "%";
    el.ticks.appendChild(tick);
  }
}

async function selectYear(year) {
  setPlaying(false);
  state.wallT = 0;
  el.slider.disabled = true;
  el.playBtn.disabled = true;
  el.bigPlay.classList.add("hidden");
  for (const b of el.years.querySelectorAll(".year-btn")) {
    const active = Number(b.dataset.year) === year;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  }
  if (!state.yearCache.has(year)) {
    el.loadingText.textContent = "Розставляємо крапки " + year + " року…";
    el.loading.classList.remove("hidden");
  }
  state.cur = await ensureYear(year);
  el.loading.classList.add("hidden");
  buildTicks(state.cur);
  el.slider.disabled = false;
  el.playBtn.disabled = false;
  el.bigPlay.classList.remove("hidden");
  state.dirty = true;
}

function bindUI() {
  el.playBtn.addEventListener("click", togglePlay);
  el.bigPlay.addEventListener("click", togglePlay);
  el.slider.addEventListener("input", () => {
    const y = state.cur;
    if (!y) return;
    state.wallT = Number(el.slider.value) / 1e4 * y.duration;
    state.dirty = true;
  });
  el.slider.addEventListener("pointerdown", () => {
    state.scrubbing = true;
    state.wasPlayingBeforeScrub = state.playing;
    setPlaying(false);
  });
  window.addEventListener("pointerup", () => {
    if (!state.scrubbing) return;
    state.scrubbing = false;
    if (state.wasPlayingBeforeScrub && state.wallT < state.cur.duration) setPlaying(true);
  });
  el.speeds.addEventListener("click", ev => {
    const btn = ev.target.closest(".speed");
    if (!btn) return;
    state.speed = Number(btn.dataset.speed);
    for (const b of el.speeds.querySelectorAll(".speed")) {
      const active = b === btn;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    }
  });
  el.years.addEventListener("click", ev => {
    const btn = ev.target.closest(".year-btn");
    if (!btn) return;
    const year = Number(btn.dataset.year);
    if (state.cur && state.cur.year === year) return;
    selectYear(year);
  });
  window.addEventListener("keydown", ev => {
    if (ev.code !== "Space") return;
    const t = ev.target;
    if (t && (t.tagName === "BUTTON" || t.tagName === "INPUT")) return;
    ev.preventDefault();
    togglePlay();
  });
}

function fitPadding() {
  const mapEl = document.getElementById("map");
  const w = mapEl.clientWidth, h = mapEl.clientHeight;
  if (window.matchMedia("(max-width: 599px)").matches) {
    return {
      top: 16,
      bottom: 16,
      left: 12,
      right: 12
    };
  }
  const meta = document.querySelector(".map-meta");
  const metaH = meta ? meta.offsetHeight + 24 : 96;
  const top = Math.min(metaH, Math.max(12, h * .22));
  const bottom = Math.max(12, Math.min(24, h * .06));
  const side = Math.max(16, Math.min(36, w * .04));
  return {
    top,
    bottom,
    left: side,
    right: side
  };
}

function fitAll(animate) {
  if (!map || !state.bounds) return;
  map.fitBounds(state.bounds, {
    padding: fitPadding(),
    animate: !!animate,
    duration: 400
  });
}

function initMap(geo) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of geo.features) {
    const polys = f.geometry.type === "Polygon" ? [ f.geometry.coordinates ] : f.geometry.coordinates;
    for (const rings of polys) for (const [x, y] of rings[0]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const bounds = [ [ minX, minY ], [ maxX, maxY ] ];
  state.bounds = bounds;
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        communities: {
          type: "geojson",
          data: geo
        }
      },
      layers: [ {
        id: "bg",
        type: "background",
        paint: {
          "background-color": "#FDFDFD"
        }
      }, {
        id: "communities-fill",
        type: "fill",
        source: "communities",
        paint: {
          "fill-color": "#F7F7F8"
        }
      }, {
        id: "communities-line",
        type: "line",
        source: "communities",
        paint: {
          "line-color": "#CACAD1",
          "line-width": 1.5
        }
      } ]
    },
    bounds,
    fitBoundsOptions: {
      padding: fitPadding()
    },
    maxBounds: [ [ minX - 1.8, minY - 1.2 ], [ maxX + 1.8, maxY + 1.2 ] ],
    minZoom: 6.5,
    maxZoom: 13,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: false,
    cooperativeGestures: true,
    locale: {
      "CooperativeGesturesHandler.WindowsHelpText": "Утримуйте Ctrl і прокручуйте, щоб масштабувати мапу",
      "CooperativeGesturesHandler.MacHelpText": "Утримуйте ⌘ і прокручуйте, щоб масштабувати мапу",
      "CooperativeGesturesHandler.MobileHelpText": "Масштабуйте мапу двома пальцями"
    }
  });
  map.touchZoomRotate.disableRotation();
  filterExt = new deck.DataFilterExtension({
    filterSize: 1
  });
  overlay = new deck.MapboxOverlay({
    interleaved: false,
    layers: []
  });
  map.addControl(overlay);
  map.once("idle", () => {
    const deckEl = map.getContainer().querySelector('div[tabindex="0"]:not([aria-label])');
    if (deckEl) deckEl.setAttribute("aria-label", "Мапа громад: анімація голосів");
  });
  let resizeTimer = null;
  new ResizeObserver(() => {
    map.resize();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => fitAll(false), 150);
  }).observe(document.getElementById("map"));
  return new Promise(resolve => map.on("load", resolve));
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

async function main() {
  if (!hasWebGL()) {
    const sp = el.loading && el.loading.querySelector(".spinner");
    if (sp) sp.remove();
    el.loadingText.textContent = WEBGL_MSG;
    el.loadingText.style.maxWidth = "34ch";
    el.loadingText.style.lineHeight = "1.55";
    return;
  }
  try {
    const [clock, geo] = await Promise.all([ fetch("data/clock_map.json").then(r => {
      if (!r.ok) throw new Error("clock_map.json: " + r.status);
      return r.json();
    }), fetch("data/communities.geojson").then(r => {
      if (!r.ok) throw new Error("communities.geojson: " + r.status);
      return r.json();
    }) ]);
    state.meta = clock.meta;
    state.villageTotals = clock.village_totals || [];
    for (const e of clock.data) {
      if (!state.eventsByYear.has(e.year)) state.eventsByYear.set(e.year, []);
      state.eventsByYear.get(e.year).push(e);
    }
    state.districts = prepDistricts(geo);
    el.loadingText.textContent = "Готуємо мапу…";
    const years = Object.keys(state.meta.years).map(Number).sort((a, b) => a - b);
    for (const year of years) {
      const b = document.createElement("button");
      b.className = "year-btn";
      b.dataset.year = String(year);
      b.textContent = String(year);
      b.setAttribute("aria-pressed", "false");
      el.years.appendChild(b);
    }
    await initMap(geo);
    bindUI();
    window.__pb = {
      map: () => map,
      fitAll,
      state
    };
    requestAnimationFrame(frame);
    await selectYear(years[years.length - 1]);
  } catch (err) {
    el.loadingText.textContent = "Не вдалося завантажити дані віджета. " + err.message;
    const sp = el.loading.querySelector(".spinner");
    if (sp) sp.remove();
    console.error(err);
  }
}

main();
