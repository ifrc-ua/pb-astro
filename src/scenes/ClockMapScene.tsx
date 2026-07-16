// Сцена «Пульс голосування»: скрол-керована мапа-годинник голосів.
// Порт рендера віджета «Пульс голосування» (pb-kurs/clock-map/app.js):
// обчислення даних 1:1 (слоти часу, нелінійний час-варп, розкидання крапок
// у межах полігона громади), maplibre + deck.gl з npm. Скрол-кроки керують
// відтворенням часу; після кроків кнопка «Дослідити самостійно» вмикає
// повний годинник віджета (роки, перемотування, швидкість).
// Дані навмисно безпечні: час деталізовано лише для міста, голоси сіл —
// спільним пулом без розрізнення за окремим селом (агрегати від 5).
import { useCallback, useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { SceneShell } from "./SceneShell";
import { hasWebGL } from "../lib/webgl";
import { loadMapLibs, type MapLibs } from "../lib/map-libs";

const CONFIG = {
  DURATION_S: 90,
  SLOT_S: 1800,
  MIN_SLOT_W: 0.1,
  GAMMA: 0.55,
  FLASH_WALL_S: 0.6,
  TRACE_ALPHA: 48,
  TRACE_RADIUS: 1.6,
  FLASH_RADIUS: 3,
  FLASH_ALPHA: 200,
  GEN_CHUNK: 4e4,
};

// Канальні кольори — design-data.md §6.3 (онлайн фіолет, ЦНАП teal)
const CHANNELS: Record<string, { key: string; color: [number, number, number] }> = {
  Електронний: { key: "elec", color: [101, 78, 163] },
  Паперовий: { key: "paper", color: [14, 124, 140] },
};

const WEEKDAYS = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота"];
const MONTHS_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const SPAN_S: Record<string, number> = { "30m": 1800, "2h": 7200, "1d": 86400 };

// Темп сцени: крок 1 — хвиля перших трьох днів за ~8 с; кроки 2–4 — уся
// кампанія по колу за ~20 с (добовий ритм видно, не засинаючи)
const STEP1_SECONDS = 8;
const LOOP_SECONDS = 20;
const DIM_TRACE = 0.18; // прозорість сліду неакцентованого каналу
const FIRST_DAYS = 3;

// Тексти степ-карток — дослівно зі статті («Як голосують»,
// «Смартфон і жива черга»); остання картка — лише кнопка вільного режиму
const STEPS = [
  "На перші дні кампанії припадає основна хвиля, а на останні — крихти. <strong>Перші три дні кампанії дають до 40% голосів</strong>, останні три — лише 9–18%.",
  "Онлайн і офлайн-голоси живуть у різний час доби. <strong>Онлайн тече до пізньої ночі, з піком близько 21:00</strong>, і навіть о другій ночі хтось голосує.",
  "А голосування у ЦНАП живе за розкладом установи: <strong>прокидається близько 10:00, провисає в обід і завмирає після 18:00</strong>. Дві демократії, накладені на той самий конкурс.",
  '<button type="button" class="cm-explore">Дослідити самостійно</button>',
];

type Mode = "both" | "elec" | "paper";
const STEP_MODE: Mode[] = ["both", "elec", "paper", "both"];

const NBSP = " ";
const fmtInt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

function voteWord(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "голос";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "голоси";
  return "голосів";
}

const pad2 = (n: number) => (n < 10 ? "0" + n : String(n));

function parseISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function countLE(arr: Float32Array, v: number) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function shoelace(ring: number[][]) {
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

function pointInRing(x: number, y: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function prepDistricts(geo: any) {
  const out: Record<string, any> = {};
  for (const f of geo.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const items = polys.map((rings: number[][][]) => {
      const outer = rings[0];
      const holes = rings.slice(1);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of outer) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return { outer, holes, bbox: [minX, minY, maxX, maxY], area: Math.abs(shoelace(outer)) };
    });
    const totalArea = items.reduce((s: number, it: any) => s + it.area, 0);
    out[f.properties.district] = { items, totalArea };
  }
  return out;
}

// Кольори підложки за темою сторінки: світла = точні кольори віджета,
// темна — токени темної теми (tokens.css)
function themePaint() {
  const dark = document.documentElement.dataset.theme === "dark";
  return dark
    ? { bg: "#0F0F16", fill: "#1A1A26", line: "#2E2E3C" }
    : { bg: "#FDFDFD", fill: "#F7F7F8", line: "#CACAD1" };
}

interface SceneApi {
  setStep: (i: number) => void;
  dispose: () => void;
}

function buildClock(host: HTMLElement, sectionEl: HTMLElement, DB: any, geo: any, reduced: boolean, getStep: () => number, libs: MapLibs): SceneApi {
  const { maplibregl, MapboxOverlay, ScatterplotLayer, DataFilterExtension } = libs;
  const q = <T extends HTMLElement>(sel: string) => host.querySelector<T>(`[data-el="${sel}"]`)!;
  const el = {
    map: host.querySelector<HTMLElement>(".cm-map")!,
    counterNum: q("counterNum"),
    counterCap: q("counterCap"),
    captionDate: q("captionDate"),
    captionDay: q("captionDay"),
    daynight: q("daynight"),
    controls: q("controls"),
    years: q("years"),
    playBtn: q<HTMLButtonElement>("playBtn"),
    slider: q<HTMLInputElement>("slider"),
    ticks: q("ticks"),
    speeds: q("speeds"),
    loading: q("loading"),
    loadingText: q("loadingText"),
  };

  const state: any = {
    meta: DB.meta,
    villageTotals: DB.village_totals || [],
    eventsByYear: new Map<number, any[]>(),
    districts: prepDistricts(geo),
    yearCache: new Map<number, any>(),
    cur: null,
    wallT: 0,
    playing: false,
    speed: 1,
    scrubbing: false,
    wasPlayingBeforeScrub: false,
    lastFrame: 0,
    dirty: true,
    bounds: null,
    // стан сцени поверх стану віджета
    mode: "both" as Mode,
    stopAt: null as number | null,
    loop: false,
    freeMode: false,
  };
  for (const e of DB.data) {
    if (!state.eventsByYear.has(e.year)) state.eventsByYear.set(e.year, []);
    state.eventsByYear.get(e.year).push(e);
  }

  let map: any = null;
  let overlay: any = null;
  let filterExt: any = null;
  let rafId = 0;
  let disposed = false;

  function randomPointIn(district: string) {
    const d = state.districts[district];
    let r = Math.random() * d.totalArea;
    let item = d.items[d.items.length - 1];
    for (const it of d.items) {
      r -= it.area;
      if (r <= 0) { item = it; break; }
    }
    const [minX, minY, maxX, maxY] = item.bbox;
    for (let i = 0; i < 120; i++) {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      if (pointInRing(x, y, item.outer) && !item.holes.some((h: number[][]) => pointInRing(x, y, h))) {
        return [x, y];
      }
    }
    return item.outer[0];
  }

  async function ensureYear(year: number) {
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
      cumWall[i + 1] = cumWall[i] + (weights[i] / wSum) * CONFIG.DURATION_S;
    }
    const pool = state.meta.village_pool;
    const vt = state.villageTotals.filter((r: any) => r.year === year);
    const samplers: Record<string, any> = {};
    for (const chName in CHANNELS) {
      const names: string[] = [], cum: number[] = [];
      let acc = 0;
      for (const r of vt) {
        if (r.channel !== chName || !state.districts[r.district]) continue;
        acc += r.count;
        names.push(r.district);
        cum.push(acc);
      }
      samplers[chName] = { names, cum, total: acc };
    }
    const pickVillage = (chName: string) => {
      const s = samplers[chName];
      if (!s || !s.total) return null;
      const r = Math.random() * s.total;
      let lo = 0, hi = s.cum.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (s.cum[mid] <= r) lo = mid + 1; else hi = mid;
      }
      return s.names[lo < s.names.length ? lo : s.names.length - 1];
    };
    const raw: any = { x: [], y: [], t: [], color: [], ch: [] };
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
        raw.ch.push(ch.key === "elec" ? 0 : 1);
      }
      sinceYield += e.count;
      if (sinceYield >= CONFIG.GEN_CHUNK) {
        sinceYield = 0;
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    const n = raw.t.length;
    const idx = Array.from({ length: n }, (_, i) => i);
    idx.sort((a, z) => raw.t[a] - raw.t[z]);
    const pos = new Float32Array(n * 2);
    const t = new Float32Array(n);
    const chan = new Uint8Array(n);
    const rgbaTrace = new Uint8Array(n * 4);
    const rgbaFlash = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const j = idx[i];
      pos[i * 2] = raw.x[j];
      pos[i * 2 + 1] = raw.y[j];
      t[i] = raw.t[j];
      chan[i] = raw.ch[j];
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
      year, startUTC, days, campEnd, nSlots, cumWall,
      duration: CONFIG.DURATION_S, total, n, pos, t, chan, rgbaTrace, rgbaFlash,
      variants: new Map<string, Uint8Array>(),
    };
    state.yearCache.set(year, prepared);
    return prepared;
  }

  // Акцент каналу для кроків 2–3: слід неакцентованого каналу притлумлено,
  // спалахи лишаються тільки в акцентованого (щоб не тягли око)
  function channelRgba(y: any, which: "trace" | "flash", mode: Mode): Uint8Array {
    const base: Uint8Array = which === "trace" ? y.rgbaTrace : y.rgbaFlash;
    if (mode === "both") return base;
    const key = which + "|" + mode;
    if (y.variants.has(key)) return y.variants.get(key);
    const keep = mode === "elec" ? 0 : 1;
    const factor = which === "trace" ? DIM_TRACE : 0;
    const out = new Uint8Array(base);
    for (let i = 0; i < y.chan.length; i++) {
      if (y.chan[i] !== keep) out[i * 4 + 3] = Math.round(base[i * 4 + 3] * factor);
    }
    y.variants.set(key, out);
    return out;
  }

  function wallToCamp(y: any, wall: number) {
    if (wall <= 0) return 0;
    if (wall >= y.duration) return y.campEnd;
    const cw = y.cumWall;
    let lo = 0, hi = y.nSlots;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cw[mid] <= wall) lo = mid; else hi = mid;
    }
    const seg = cw[lo + 1] - cw[lo];
    const frac = seg > 0 ? (wall - cw[lo]) / seg : 0;
    return (lo + frac) * CONFIG.SLOT_S;
  }

  function campToWall(y: any, tc: number) {
    if (tc <= 0) return 0;
    if (tc >= y.campEnd) return y.duration;
    const i = Math.min(Math.floor(tc / CONFIG.SLOT_S), y.nSlots - 1);
    const frac = tc / CONFIG.SLOT_S - i;
    return y.cumWall[i] + frac * (y.cumWall[i + 1] - y.cumWall[i]);
  }

  function campSlope(y: any, wall: number) {
    const tc = wallToCamp(y, wall);
    const i = Math.min(Math.floor(tc / CONFIG.SLOT_S), y.nSlots - 1);
    const seg = y.cumWall[i + 1] - y.cumWall[i];
    return seg > 0 ? CONFIG.SLOT_S / seg : 0;
  }

  function buildLayers(tc: number, flashCamp: number) {
    const c = state.cur;
    if (!c || !c.n) return [];
    const base = (rgba: Uint8Array) => ({
      data: {
        length: c.n,
        attributes: {
          getPosition: { value: c.pos, size: 2 },
          getFilterValue: { value: c.t, size: 1 },
          getFillColor: { value: rgba, size: 4 },
        },
      },
      radiusUnits: "pixels" as const,
      stroked: false,
      extensions: [filterExt],
      parameters: { depthTest: false },
    });
    const layers: any[] = [
      new ScatterplotLayer({
        id: "votes-trace-" + state.mode,
        ...base(channelRgba(c, "trace", state.mode)),
        getRadius: CONFIG.TRACE_RADIUS,
        filterRange: [-1, tc],
      }),
    ];
    if (flashCamp > 0) {
      layers.push(
        new ScatterplotLayer({
          id: "votes-flash-" + state.mode,
          ...base(channelRgba(c, "flash", state.mode)),
          getRadius: CONFIG.FLASH_RADIUS,
          filterRange: [tc - flashCamp, tc],
          filterSoftRange: [tc - flashCamp * 0.4, tc],
        })
      );
    }
    return layers;
  }

  function frame(now: number) {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);
    const y = state.cur;
    if (!y) return;
    const dt = state.lastFrame ? Math.min((now - state.lastFrame) / 1e3, 0.1) : 0;
    state.lastFrame = now;
    if (state.playing && !state.scrubbing) {
      state.wallT += dt * state.speed;
      if (state.stopAt != null && state.wallT >= state.stopAt) {
        // крок 1: хвиля перших днів добігла своєї межі — тримаємо стоп-кадр
        state.wallT = state.stopAt;
        state.playing = false;
      } else if (state.wallT >= y.duration) {
        if (state.loop) {
          state.wallT = 0;
        } else {
          state.wallT = y.duration;
          setPlaying(false, true);
        }
      }
      state.dirty = true;
    }
    if (!state.dirty) return;
    state.dirty = false;
    const tc = wallToCamp(y, state.wallT);
    let flashCamp = 0;
    if (state.playing && !reduced) {
      flashCamp = CONFIG.FLASH_WALL_S * state.speed * campSlope(y, state.wallT);
    }
    overlay.setProps({ layers: buildLayers(tc, flashCamp) });
    const cnt = countLE(y.t, tc);
    el.counterNum.textContent = fmtInt(cnt);
    el.counterCap.textContent = voteWord(cnt) + " із " + fmtInt(y.total);
    const tcDisp = Math.min(tc, y.campEnd - 30);
    const ms = y.startUTC + tcDisp * 1e3;
    const d = new Date(ms);
    const dayN = Math.min(Math.floor(tcDisp / 86400) + 1, y.days);
    el.captionDate.textContent = WEEKDAYS[d.getUTCDay()] + ", " + d.getUTCDate() + " " + MONTHS_GEN[d.getUTCMonth()] + " · " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes());
    el.captionDay.textContent = "День " + dayN + " з " + y.days;
    const hour = (tcDisp % 86400) / 3600;
    el.daynight.classList.toggle("night", hour < 6 || hour >= 21);
    if (!state.scrubbing) {
      el.slider.value = String(Math.round((state.wallT / y.duration) * 1e4));
    }
    el.slider.style.setProperty("--progress", ((state.wallT / y.duration) * 100).toFixed(2) + "%");
    el.slider.setAttribute("aria-valuetext", el.captionDate.textContent + ", " + el.captionDay.textContent);
  }

  function setPlaying(playing: boolean, ended?: boolean) {
    state.playing = playing;
    el.playBtn.classList.toggle("playing", playing);
    el.playBtn.classList.toggle("ended", !playing && !!ended);
    el.playBtn.setAttribute("aria-label", playing ? "Пауза" : ended ? "Відтворити знову" : "Відтворити");
    state.dirty = true;
  }

  function buildTicks(y: any) {
    el.ticks.replaceChildren();
    for (let d = 1; d < y.days; d++) {
      const wall = campToWall(y, d * 86400);
      const tick = document.createElement("i");
      tick.className = "cm-tick";
      tick.style.left = ((wall / y.duration) * 100).toFixed(2) + "%";
      el.ticks.appendChild(tick);
    }
  }

  async function selectYear(year: number) {
    setPlaying(false);
    state.wallT = 0;
    el.slider.disabled = true;
    el.playBtn.disabled = true;
    for (const b of el.years.querySelectorAll<HTMLButtonElement>(".cm-year")) {
      const active = Number(b.dataset.year) === year;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    }
    if (!state.yearCache.has(year)) {
      el.loadingText.textContent = "Розставляємо крапки " + year + " року…";
      el.loading.hidden = false;
    }
    state.cur = await ensureYear(year);
    el.loading.hidden = true;
    buildTicks(state.cur);
    el.slider.disabled = false;
    el.playBtn.disabled = false;
    state.dirty = true;
  }

  // --- Режим кроків: скрол керує часом кампанії ---
  function startLoop() {
    const y = state.cur;
    state.stopAt = null;
    state.loop = true;
    state.speed = y.duration / LOOP_SECONDS;
    if (state.wallT >= y.duration) state.wallT = 0;
    setPlaying(true);
  }

  function applyStep(i: number) {
    if (!state.cur) return;
    if (state.freeMode) {
      if (i < STEPS.length - 1) exitFree();
      else return;
    }
    state.mode = STEP_MODE[i] ?? "both";
    if (reduced) {
      // reduced-motion: одразу фінальний стан кампанії, без анімації часу
      state.mode = "both";
      state.stopAt = null;
      state.loop = false;
      state.wallT = state.cur.duration;
      setPlaying(false);
      return;
    }
    if (i === 0) {
      const y = state.cur;
      state.wallT = 0;
      state.stopAt = campToWall(y, FIRST_DAYS * 86400);
      state.loop = false;
      state.speed = state.stopAt / STEP1_SECONDS;
      setPlaying(true);
    } else {
      startLoop();
    }
  }

  // --- Вільний режим: годинник віджета в руках читача ---
  function enterFree() {
    state.freeMode = true;
    state.stopAt = null;
    state.loop = false;
    state.speed = 1;
    state.mode = "both";
    sectionEl.classList.add("cm-free");
    el.controls.hidden = false;
    setPlaying(false);
  }

  function exitFree() {
    state.freeMode = false;
    sectionEl.classList.remove("cm-free");
    el.controls.hidden = true;
  }

  function bindUI() {
    el.playBtn.addEventListener("click", () => {
      const y = state.cur;
      if (!y) return;
      if (!state.playing && state.wallT >= y.duration) state.wallT = 0;
      setPlaying(!state.playing);
    });
    el.slider.addEventListener("input", () => {
      const y = state.cur;
      if (!y) return;
      state.wallT = (Number(el.slider.value) / 1e4) * y.duration;
      state.dirty = true;
    });
    el.slider.addEventListener("pointerdown", () => {
      state.scrubbing = true;
      state.wasPlayingBeforeScrub = state.playing;
      setPlaying(false);
    });
    window.addEventListener("pointerup", onPointerUp);
    el.speeds.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>(".cm-speed");
      if (!btn) return;
      state.speed = Number(btn.dataset.speed);
      for (const b of el.speeds.querySelectorAll<HTMLButtonElement>(".cm-speed")) {
        const active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", String(active));
      }
    });
    el.years.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>(".cm-year");
      if (!btn) return;
      const year = Number(btn.dataset.year);
      if (state.cur && state.cur.year === year) return;
      selectYear(year);
    });
    sectionEl.addEventListener("click", onSectionClick);
  }

  function onPointerUp() {
    if (!state.scrubbing) return;
    state.scrubbing = false;
    if (state.wasPlayingBeforeScrub && state.wallT < state.cur.duration) setPlaying(true);
  }

  function onSectionClick(ev: Event) {
    if ((ev.target as HTMLElement).closest(".cm-explore")) enterFree();
  }

  function fitPadding() {
    const w = el.map.clientWidth, h = el.map.clientHeight;
    if (window.matchMedia("(max-width: 599px)").matches) {
      // мобільний: степ-картки наїжджають знизу — лишаємо мапі верхні ~2/3
      return { top: 84, bottom: Math.round(h * 0.3), left: 12, right: 12 };
    }
    // десктоп: колонка степ-карток ліворуч (як .scene-viz), метадані згори
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const left = wide ? Math.round(window.innerWidth * 0.06) + 452 : Math.max(16, Math.min(36, w * 0.04));
    return { top: Math.max(96, Math.min(150, h * 0.18)), bottom: Math.max(24, Math.min(48, h * 0.08)), left, right: Math.max(16, Math.min(36, w * 0.04)) };
  }

  function fitAll(animate?: boolean) {
    if (!map || !state.bounds) return;
    map.fitBounds(state.bounds, { padding: fitPadding(), animate: !!animate, duration: 400 });
  }

  let ro: ResizeObserver | null = null;
  let themeMo: MutationObserver | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;

  function initMap() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of geo.features) {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const rings of polys) for (const [x, y] of rings[0]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const bounds: any = [[minX, minY], [maxX, maxY]];
    state.bounds = bounds;
    const paint = themePaint();
    map = new maplibregl.Map({
      container: el.map,
      style: {
        version: 8,
        sources: { communities: { type: "geojson", data: geo } },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": paint.bg } },
          { id: "communities-fill", type: "fill", source: "communities", paint: { "fill-color": paint.fill } },
          { id: "communities-line", type: "line", source: "communities", paint: { "line-color": paint.line, "line-width": 1.5 } },
        ],
      },
      bounds,
      fitBoundsOptions: { padding: fitPadding() },
      maxBounds: [[minX - 1.8, minY - 1.2], [maxX + 1.8, maxY + 1.2]],
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
        "CooperativeGesturesHandler.MobileHelpText": "Масштабуйте мапу двома пальцями",
      },
    });
    map.touchZoomRotate.disableRotation();
    filterExt = new DataFilterExtension({ filterSize: 1 });
    overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay);
    map.once("idle", () => {
      const deckEl = map.getContainer().querySelector('div[tabindex="0"]:not([aria-label])');
      if (deckEl) deckEl.setAttribute("aria-label", "Мапа громад: анімація голосів");
    });
    ro = new ResizeObserver(() => {
      map.resize();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => fitAll(false), 150);
    });
    ro.observe(el.map);
    // перемикач теми сторінки: перефарбувати підложку без перезбирання мапи
    themeMo = new MutationObserver(() => {
      if (!map) return;
      const p = themePaint();
      map.setPaintProperty("bg", "background-color", p.bg);
      map.setPaintProperty("communities-fill", "fill-color", p.fill);
      map.setPaintProperty("communities-line", "line-color", p.line);
    });
    themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return new Promise<void>((resolve) => map!.on("load", () => resolve()));
  }

  const api: SceneApi = {
    setStep: applyStep,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(resizeTimer);
      ro?.disconnect();
      themeMo?.disconnect();
      window.removeEventListener("pointerup", onPointerUp);
      sectionEl.removeEventListener("click", onSectionClick);
      try { map?.remove(); } catch {}
      map = null;
      overlay = null;
    },
  };

  (async () => {
    await initMap();
    if (disposed) return;
    const years = Object.keys(state.meta.years).map(Number).sort((a, b) => a - b);
    for (const year of years) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cm-year";
      b.dataset.year = String(year);
      b.textContent = String(year);
      b.setAttribute("aria-pressed", "false");
      el.years.appendChild(b);
    }
    bindUI();
    rafId = requestAnimationFrame(frame);
    await selectYear(years[years.length - 1]);
    if (disposed) return;
    applyStep(getStep());
    (window as any).__pbSceneC = {
      ready: true,
      yearTotal: (yy: number) =>
        (state.eventsByYear.get(yy) || []).reduce((s: number, e: any) => s + e.count, 0),
      st: () => ({
        step: getStep(),
        mode: state.mode,
        playing: state.playing,
        freeMode: state.freeMode,
        wallT: state.wallT,
        duration: state.cur?.duration,
        year: state.cur?.year,
        total: state.cur?.total,
        count: state.cur ? countLE(state.cur.t, wallToCamp(state.cur, state.wallT)) : 0,
      }),
    };
  })();

  return api;
}

const FALLBACK_ALT =
  "Мапа Івано-Франківської громади з усіма голосами кампанії 2026 року: " +
  "фіолетові крапки — голоси онлайн (BankID), бірюзові — офлайн у ЦНАП. " +
  "Кожна крапка — один голос у випадковому місці свого населеного пункту.";

export default function ClockMapScene() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const stepRef = useRef(0);
  const [webgl, setWebgl] = useState<boolean | null>(null);

  const onStep = useCallback((i: number) => {
    stepRef.current = i;
    apiRef.current?.setStep(i);
  }, []);

  useEffect(() => {
    setWebgl(hasWebGL());
  }, []);

  useEffect(() => {
    if (webgl === null || !hostRef.current) return;
    const sectionEl = hostRef.current.closest<HTMLElement>(".scene");
    if (webgl === false) {
      // без WebGL: статичний знімок; кнопка вільного режиму не має сенсу
      sectionEl?.classList.add("cm-nogl");
      return;
    }
    let disposed = false;
    (async () => {
      try {
        const [libs, clock, geo] = await Promise.all([
          loadMapLibs(),
          fetch("/data/clock_map.json", { cache: "no-cache" }).then((r) => {
            if (!r.ok) throw new Error("clock_map.json: " + r.status);
            return r.json();
          }),
          fetch("/data/communities.geojson", { cache: "no-cache" }).then((r) => {
            if (!r.ok) throw new Error("communities.geojson: " + r.status);
            return r.json();
          }),
        ]);
        if (disposed || !hostRef.current || !sectionEl) return;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        apiRef.current = buildClock(hostRef.current, sectionEl, clock, geo, reduced, () => stepRef.current, libs);
      } catch (e) {
        console.error("Сцена «Пульс голосування»: дані не завантажились", e);
      }
    })();
    return () => {
      disposed = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [webgl]);

  return (
    <SceneShell steps={STEPS} onStep={onStep}>
      <div className="scene-map cm-viz" ref={hostRef}>
        <p className="sr-only">
          Анімована мапа показує, як упродовж кампанії надходили голоси Бюджету участі:
          кожна крапка — один голос, місце випадкове в межах своєї громади. Фіолетові
          крапки — голоси онлайн (BankID), бірюзові — офлайн у ЦНАП. Час деталізовано
          для міста; голоси сіл показано спільним потоком, без розрізнення за окремим
          селом. Агрегати — від 5 голосів. Текстові картки поруч переказують ключові
          стани анімації.
        </p>
        {webgl === false ? (
          <div className="mv-fallback">
            <img src="/fallbacks/clock-map.png" alt={FALLBACK_ALT} loading="lazy" />
          </div>
        ) : (
          <>
            <div className="cm-map" aria-hidden="true"></div>
            <div className="mv-meta">
              <div className="mv-card mv-counter" aria-hidden="true">
                <div className="mv-count-num" data-el="counterNum">0</div>
                <div className="mv-count-cap" data-el="counterCap">голосів</div>
                <div className="mv-caption">
                  <span className="cm-daynight" data-el="daynight">
                    <svg className="ic-sun" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                    <svg className="ic-moon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></svg>
                  </span>
                  <span data-el="captionDate">—</span>
                </div>
                <div className="mv-caption"><span data-el="captionDay">—</span></div>
              </div>
              <div className="mv-card mv-legend" role="img" aria-label="Легенда: фіолетові крапки — голосування онлайн (BankID), бірюзові — офлайн (ЦНАП)">
                <span className="leg-item"><i className="leg-dot" style={{ background: "#654EA3" }} />Онлайн (BankID)</span>
                <span className="leg-item"><i className="leg-dot" style={{ background: "#0E7C8C" }} />Офлайн (ЦНАП)</span>
              </div>
            </div>
            <p className="mv-note" aria-hidden="true">
              Кожна крапка — один голос; місце випадкове в межах свого населеного пункту.
              Час деталізовано для міста; голоси сіл — спільним потоком. Агрегати — від 5 голосів.
            </p>
            <div className="cm-controls mv-card" data-el="controls" hidden>
              <div className="cm-years" data-el="years" role="group" aria-label="Рік кампанії"></div>
              <div className="cm-row">
                <button className="cm-play" data-el="playBtn" type="button" aria-label="Відтворити" disabled>
                  <svg className="ic-play" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
                  <svg className="ic-pause" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
                  <svg className="ic-replay" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 12a9 9 0 1 1 2.6 6.4M3 12V7m0 5h5" /></svg>
                </button>
                <div className="cm-timeline">
                  <div className="cm-ticks" data-el="ticks" aria-hidden="true"></div>
                  <input type="range" data-el="slider" min="0" max="10000" defaultValue="0" step="1" aria-label="Перемотування часу кампанії" disabled />
                </div>
                <div className="cm-speeds" data-el="speeds" role="group" aria-label="Швидкість відтворення">
                  <button type="button" data-speed="1" className="cm-speed active" aria-pressed="true">×1</button>
                  <button type="button" data-speed="2" className="cm-speed" aria-pressed="false">×2</button>
                  <button type="button" data-speed="3" className="cm-speed" aria-pressed="false">×3</button>
                  <button type="button" data-speed="4" className="cm-speed" aria-pressed="false">×4</button>
                </div>
              </div>
            </div>
            <div className="cm-loading mv-card" data-el="loading" hidden>
              <span data-el="loadingText">Завантаження даних…</span>
            </div>
          </>
        )}
      </div>
    </SceneShell>
  );
}
