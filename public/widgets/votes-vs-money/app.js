(function() {
  "use strict";
  const DATA = [ {
    cat: "Освіта",
    short: "Освіта",
    v: 57.8,
    m: 19.6,
    color: "#654EA3",
    v25: 69036,
    v26: 135657,
    m25: 9256554,
    m26: 11627375
  }, {
    cat: "Двори й благоустрій",
    short: "Двори",
    v: 10.1,
    m: 8,
    color: "#2D6BAB",
    v25: 17887,
    v26: 17880,
    m25: 4030867,
    m26: 4450341
  }, {
    cat: "Вулиці",
    short: "Вулиці",
    v: 10.1,
    m: 25.7,
    color: "#1A4F82",
    v25: 18658,
    v26: 17009,
    m25: 13324706,
    m26: 13993250
  }, {
    cat: "Допомога ЗСУ",
    short: "ЗСУ",
    v: 8.9,
    m: 39.5,
    color: "#3F4049",
    v25: 3597,
    v26: 27946,
    m25: 19771758,
    m26: 22227094
  }, {
    cat: "Спадщина, зелень, доступність",
    short: "Спадщина+",
    v: 7.1,
    m: 5.5,
    color: "#A0571F",
    v25: 6766,
    v26: 18396,
    m25: 1491500,
    m26: 4398687
  }, {
    cat: "Інше",
    short: "Інше",
    v: 6,
    m: 1.7,
    color: "#71737E",
    v25: 11518,
    v26: 9739,
    m25: 1384310,
    m26: 43e4
  } ];
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.getElementById("chart");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = x => (Number.isInteger(x) ? String(x) : x.toFixed(1)).replace(".", ",") + "%";
  const grp = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  function el(name, attrs, text) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  const wrap = svg.parentElement;
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  wrap.appendChild(tip);
  let groups = [];
  function tipHTML(d) {
    const sv = d.v25 + d.v26, sm = d.m25 + d.m26;
    return `<div class="tip-h"><span class="tip-dot" style="background:${d.color}"></span>${d.cat}</div>` + `<table class="tip-t"><tr><th></th><th>Голоси</th><th>Гроші, грн</th></tr>` + `<tr><td>2025</td><td>${grp(d.v25)}</td><td>${grp(d.m25)}</td></tr>` + `<tr><td>2026</td><td>${grp(d.v26)}</td><td>${grp(d.m26)}</td></tr>` + `<tr class="tip-s"><td>Разом</td><td>${grp(sv)}</td><td>${grp(sm)}</td></tr></table>`;
  }
  function showTip(i, clientX, clientY) {
    tip.innerHTML = tipHTML(DATA[i]);
    tip.hidden = false;
    const wr = wrap.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = clientX - wr.left + 14, y = clientY - wr.top + 14;
    if (x + tw > wr.width) x = clientX - wr.left - tw - 14;
    if (x < 0) x = 4;
    if (y + th > wr.height) y = clientY - wr.top - th - 14;
    if (y < 0) y = 4;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
    svg.classList.add("is-hover");
    groups.forEach((g, gi) => g.els.forEach(e => e.classList.toggle("is-hot", gi === i)));
  }
  function hideTip() {
    tip.hidden = true;
    svg.classList.remove("is-hover");
    groups.forEach(g => g.els.forEach(e => e.classList.remove("is-hot")));
  }
  const idFromEvent = e => {
    const a = e.target && e.target.getAttribute && e.target.getAttribute("data-i");
    return a == null ? null : +a;
  };
  svg.addEventListener("pointermove", e => {
    const i = idFromEvent(e);
    if (i == null) hideTip(); else showTip(i, e.clientX, e.clientY);
  });
  svg.addEventListener("pointerdown", e => {
    const i = idFromEvent(e);
    if (i != null) showTip(i, e.clientX, e.clientY);
  });
  svg.addEventListener("pointerleave", hideTip);
  document.addEventListener("pointerdown", e => {
    if (!svg.contains(e.target)) hideTip();
  });
  function draw() {
    const W = svg.clientWidth || 680;
    const narrow = W < 480;
    const H = narrow ? 560 : 520;
    const padTop = 58, padBottom = 14;
    const plotH = H - padTop - padBottom;
    const colW = narrow ? 40 : 58;
    const leftTextW = narrow ? 92 : 150;
    const rightTextW = narrow ? 54 : 80;
    const xL0 = leftTextW, xL1 = xL0 + colW;
    const xR1 = W - rightTextW, xR0 = xR1 - colW;
    const midX = (xL1 + xR0) / 2;
    const MIN_INSIDE = 17;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(H));
    svg.innerHTML = "";
    const hY = 22;
    [ [ "ГОЛОСИ", "увага виборців", (xL0 + xL1) / 2 ], [ "ГРОШІ", "кошторис переможців", (xR0 + xR1) / 2 ] ].forEach(([t, s, cx]) => {
      svg.appendChild(el("text", {
        x: cx,
        y: hY,
        "text-anchor": "middle",
        class: "col-head"
      }, t));
      svg.appendChild(el("text", {
        x: cx,
        y: hY + 17,
        "text-anchor": "middle",
        class: "col-sub"
      }, s));
    });
    let cv = 0, cm = 0;
    const segs = DATA.map(d => {
      const lTop = padTop + cv / 100 * plotH, lH = d.v / 100 * plotH;
      const rTop = padTop + cm / 100 * plotH, rH = d.m / 100 * plotH;
      cv += d.v;
      cm += d.m;
      return {
        d,
        lTop,
        lH,
        rTop,
        rH
      };
    });
    groups = DATA.map(() => ({
      els: []
    }));
    segs.forEach(({d, lTop, lH, rTop, rH}, i) => {
      const path = `M ${xL1} ${lTop} ` + `C ${midX} ${lTop}, ${midX} ${rTop}, ${xR0} ${rTop} ` + `L ${xR0} ${rTop + rH} ` + `C ${midX} ${rTop + rH}, ${midX} ${lTop + lH}, ${xL1} ${lTop + lH} Z`;
      const rib = el("path", {
        d: path,
        class: "ribbon",
        fill: d.color,
        "fill-opacity": .26,
        "data-i": i
      });
      svg.appendChild(rib);
      groups[i].els.push(rib);
    });
    segs.forEach(({d, lTop, lH, rTop, rH}, i) => {
      const lRect = el("rect", {
        x: xL0,
        y: lTop,
        width: colW,
        height: lH,
        class: "seg",
        fill: d.color,
        "data-i": i
      });
      const rRect = el("rect", {
        x: xR0,
        y: rTop,
        width: colW,
        height: rH,
        class: "seg",
        fill: d.color,
        "data-i": i
      });
      svg.appendChild(lRect);
      svg.appendChild(rRect);
      groups[i].els.push(lRect, rRect);
      const label = d.short;
      const leftThin = lH < MIN_INSIDE;
      const nameTxt = leftThin ? `${label} · ${fmt(d.v)}` : label;
      svg.appendChild(el("text", {
        x: xL0 - 8,
        y: lTop + lH / 2 + 4,
        "text-anchor": "end",
        class: "cat-lbl"
      }, nameTxt));
      if (!leftThin) {
        svg.appendChild(el("text", {
          x: xL0 + colW / 2,
          y: lTop + lH / 2 + 4,
          "text-anchor": "middle",
          class: "in-pct"
        }, fmt(d.v)));
      }
      if (rH >= MIN_INSIDE) {
        svg.appendChild(el("text", {
          x: xR0 + colW / 2,
          y: rTop + rH / 2 + 4,
          "text-anchor": "middle",
          class: "in-pct"
        }, fmt(d.m)));
      } else {
        svg.appendChild(el("text", {
          x: xR1 + 8,
          y: rTop + rH / 2 + 4,
          "text-anchor": "start",
          class: "out-pct"
        }, fmt(d.m)));
      }
    });
    if (!reduce) reveal();
  }
  function reveal() {
    svg.classList.add("is-anim");
    requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.add("is-shown")));
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
