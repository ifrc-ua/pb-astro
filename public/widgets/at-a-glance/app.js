(function() {
  "use strict";
  const DATA = [ {
    target: 1565,
    label: "проєктів подано",
    series: [ 80, 52, 139, 130, 303, 272, 129, 112, 149, 199 ],
    years: [ "2016", "2026" ]
  }, {
    target: 475,
    label: "проєктів-переможців",
    series: [ 12, 33, 37, 37, 43, 58, 38, 39, 80, 98 ],
    years: [ "2016", "2026" ]
  }, {
    target: 365,
    label: "реалізовано",
    note: "2026 ще триває",
    series: [ 11, 32, 36, 38, 45, 58, 38, 37, 70 ],
    years: [ "2016", "2025" ]
  }, {
    target: 781,
    unit: "тис.",
    label: "голосів подано",
    note: "приблизно · 2020 лише переможці",
    series: [ 2090, 8024, 25477, 43620, 21747, 124348, 71055, 130502, 127462, 226627 ],
    years: [ "2016", "2026" ],
    dim: 4
  }, {
    pct: 71,
    label: "голосів від жінок",
    note: "сумарно 66%→75%",
    series: [ 66, 68.2, 70.4, 72.4, 74.6 ],
    years: [ "2021", "2026" ]
  }, {
    pct: 81,
    label: "людей голосували онлайн",
    series: [ 53.8, 44.5, 73.8, 76.6, 79.2, 87, 85.5, 89.1, 91 ],
    years: [ "2017", "2026" ]
  } ];
  const NS = "http://www.w3.org/2000/svg";
  const NBSP = " ";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function fmtInt(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }
  function points(series, w, h, pad) {
    const lo = Math.min(...series), hi = Math.max(...series), rng = hi - lo || 1;
    const n = series.length;
    return series.map((v, i) => [ pad + (w - 2 * pad) * i / (n - 1), h - pad - (h - 2 * pad) * (v - lo) / rng ]);
  }
  function buildSpark(d) {
    const W = 92, H = 26, PAD = 3;
    const pts = points(d.series, W, H, PAD);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "spark");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Динаміка по роках ${d.years[0]}–${d.years[1]}: ` + d.series.join(", "));
    const poly = document.createElementNS(NS, "polyline");
    poly.setAttribute("points", pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "));
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    poly.style.setProperty("--len", len.toFixed(1));
    svg.appendChild(poly);
    pts.forEach((p, i) => {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", p[0].toFixed(1));
      c.setAttribute("cy", p[1].toFixed(1));
      c.setAttribute("r", "1.6");
      if (i === d.dim) c.setAttribute("class", "dim");
      svg.appendChild(c);
    });
    return svg;
  }
  function buildTile(d) {
    const tile = document.createElement("div");
    tile.className = "tile";
    const num = document.createElement("div");
    num.className = "num";
    if (d.pct != null) {
      num.innerHTML = `${d.pct}<small>%</small>`;
    } else if (d.unit) {
      num.innerHTML = `<span class="cnt" data-target="${d.target}">${fmtInt(d.target)}</span><small> ${d.unit}</small>`;
    } else {
      num.innerHTML = `<span class="cnt" data-target="${d.target}">${fmtInt(d.target)}</span>`;
    }
    tile.appendChild(num);
    const lab = document.createElement("div");
    lab.className = "lab";
    lab.textContent = d.label;
    tile.appendChild(lab);
    const spark = buildSpark(d);
    tile.appendChild(spark);
    const yrs = document.createElement("div");
    yrs.className = "yrs";
    yrs.innerHTML = `<span>${d.years[0]}</span><span>${d.years[1]}</span>`;
    tile.appendChild(yrs);
    if (d.note) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = d.note;
      tile.appendChild(note);
    }
    return {
      tile,
      spark
    };
  }
  function countUp(elm, target, delay) {
    if (reduce || target < 100) {
      elm.textContent = fmtInt(target);
      return;
    }
    const dur = 1e3;
    let start = null;
    elm.textContent = fmtInt(0);
    function step(ts) {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      elm.textContent = fmtInt(target * eased);
      if (t < 1) requestAnimationFrame(step); else elm.textContent = fmtInt(target);
    }
    setTimeout(() => requestAnimationFrame(step), delay);
  }
  function run() {
    const root = document.getElementById("tiles");
    if (!root) return;
    const sparks = [];
    DATA.forEach(d => {
      const {tile, spark} = buildTile(d);
      root.appendChild(tile);
      sparks.push(spark);
    });
    if (reduce) {
      sparks.forEach(s => s.classList.add("is-shown"));
      root.querySelectorAll(".cnt").forEach(e => countUp(e, Number(e.dataset.target), 0));
      return;
    }
    const trigger = () => {
      root.querySelectorAll(".cnt").forEach((e, i) => countUp(e, Number(e.dataset.target), i * 100));
      sparks.forEach((s, i) => setTimeout(() => s.classList.add("is-shown"), i * 100));
    };
    if (window.IntersectionObserver) {
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach(en => {
          if (en.isIntersecting) {
            trigger();
            obs.disconnect();
          }
        });
      }, {
        threshold: .4
      });
      io.observe(root);
    } else {
      trigger();
    }
  }
  run();
})();
