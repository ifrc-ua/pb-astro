(function() {
  "use strict";
  const DATA = [ {
    y: 2016,
    m: .5
  }, {
    y: 2017,
    m: 1.5
  }, {
    y: 2018,
    m: 2.5
  }, {
    y: 2019,
    m: 5
  }, {
    y: 2020,
    m: 15
  }, {
    y: 2021,
    m: 18
  }, {
    y: 2022,
    m: null
  }, {
    y: 2023,
    m: 25.5
  }, {
    y: 2024,
    m: 30
  }, {
    y: 2025,
    m: 50
  }, {
    y: 2026,
    m: 55
  } ];
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.getElementById("chart");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function fmt(m) {
    return (Number.isInteger(m) ? String(m) : m.toFixed(1)).replace(".", ",");
  }
  function el(name, attrs) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function draw() {
    const W = svg.clientWidth || 680;
    const isNarrow = W < 480;
    const H = isNarrow ? 360 : 420;
    const padTop = 28, padBottom = 44, padL = 8, padR = 8;
    const plotH = H - padTop - padBottom;
    const maxV = Math.max(...DATA.map(d => d.m || 0));
    const n = DATA.length;
    const slot = (W - padL - padR) / n;
    const barW = Math.min(isNarrow ? 16 : 34, slot * .56);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(H));
    svg.innerHTML = "";
    const baseY = padTop + plotH;
    svg.appendChild(el("line", {
      x1: padL,
      y1: baseY,
      x2: W - padR,
      y2: baseY,
      stroke: "#CACAD1",
      "stroke-width": 1
    }));
    DATA.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2;
      if (!isNarrow || i % 2 === 0) {
        const yearLbl = el("text", {
          x: cx,
          y: baseY + 18,
          "text-anchor": "middle",
          class: "x-lbl"
        });
        yearLbl.textContent = String(d.y);
        svg.appendChild(yearLbl);
      }
      if (d.m == null) {
        const pl = isNarrow ? el("text", {
          x: cx,
          y: baseY - 10,
          "text-anchor": "start",
          "dominant-baseline": "central",
          class: "empty-lbl",
          transform: `rotate(-90 ${cx} ${baseY - 10})`
        }) : el("text", {
          x: cx,
          y: baseY - 14,
          "text-anchor": "middle",
          class: "empty-lbl"
        });
        pl.textContent = "Не було";
        svg.appendChild(pl);
        return;
      }
      const h = Math.max(2, d.m / maxV * plotH);
      const peak = d.y === 2026;
      const bar = el("rect", {
        x: cx - barW / 2,
        y: baseY - h,
        width: barW,
        height: h,
        rx: 3,
        class: peak ? "bar bar-peak" : "bar"
      });
      if (!reduce) {
        bar.setAttribute("y", baseY);
        bar.setAttribute("height", "0");
        bar.dataset.y = String(baseY - h);
        bar.dataset.h = String(h);
      }
      svg.appendChild(bar);
      const vlbl = el("text", {
        x: cx,
        y: baseY - h - 7,
        "text-anchor": "middle",
        class: "v-lbl" + (peak ? " v-peak" : "")
      });
      vlbl.textContent = fmt(d.m);
      svg.appendChild(vlbl);
    });
    if (!reduce) animateBars();
  }
  function animateBars() {
    svg.classList.add("is-animating");
    requestAnimationFrame(() => {
      svg.classList.add("is-shown");
      svg.querySelectorAll(".bar").forEach(b => {
        if (!b.dataset.h) return;
        b.style.transition = "y 800ms cubic-bezier(0.22,1,0.36,1), height 800ms cubic-bezier(0.22,1,0.36,1)";
        b.setAttribute("y", b.dataset.y);
        b.setAttribute("height", b.dataset.h);
      });
    });
  }
  if (window.ResizeObserver) {
    let rt = 0;
    new ResizeObserver(() => {
      if (rt) clearTimeout(rt);
      rt = setTimeout(draw, 120);
    }).observe(svg.parentElement);
  }
  draw();
})();
