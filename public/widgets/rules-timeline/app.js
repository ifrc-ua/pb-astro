(function() {
  "use strict";
  const $ = id => document.getElementById(id);
  const widget = $("widget"), scroller = $("scroller"), rail = $("rail"), stage = $("stage"), fsBtn = $("fsBtn"), live = $("live"), scrollHint = $("scrollHint");
  function plural(n) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return "голос на виборця";
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return "голоси на виборця";
    return "голосів на виборця";
  }
  YEARS.forEach((d, i) => {
    const sec = document.createElement("section");
    sec.className = "year-sec" + (d.pause ? " pause" : "");
    sec.dataset.i = i;
    sec.innerHTML = '<div class="tag">' + d.tag + "</div>" + "<h3>" + d.title + "</h3>" + d.body.map(p => '<p class="ptxt">' + p + "</p>").join("");
    scroller.appendChild(sec);
    const r = document.createElement("button");
    r.type = "button";
    r.className = "r";
    r.dataset.i = i;
    r.innerHTML = '<span class="pip" aria-hidden="true"></span>' + d.y;
    r.setAttribute("aria-label", "Перейти до " + d.y + " року");
    r.addEventListener("click", () => goTo(i));
    rail.appendChild(r);
  });
  const yr = $("yr"), sub = $("sub"), vn = $("vn"), vl = $("vl"), bn = $("bn"), metrics = $("metrics"), pausebox = $("pausebox"), lanes = $("lanes"), laneNote = $("laneNote");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let cur = -1;
  function render(i) {
    if (i === cur) return;
    cur = i;
    const d = YEARS[i];
    yr.textContent = d.y;
    sub.textContent = d.sub;
    if (d.pause) {
      metrics.hidden = true;
      pausebox.hidden = false;
      lanes.innerHTML = "";
      laneNote.hidden = true;
      live.textContent = d.y + " рік. Кампанії не було.";
    } else {
      metrics.hidden = false;
      pausebox.hidden = true;
      vn.textContent = d.v;
      vl.textContent = plural(d.v);
      bn.textContent = d.bud;
      lanes.innerHTML = "";
      for (let k = 0; k < d.v; k++) {
        const el = document.createElement("div");
        el.className = "lane";
        el.style.background = LANE_COLORS[k % LANE_COLORS.length];
        lanes.appendChild(el);
        if (reduce) {
          el.classList.add("show");
        } else {
          window.setTimeout(() => el.classList.add("show"), 30 + k * 22);
        }
      }
      const note = LANE_NOTE[d.v];
      if (note) {
        laneNote.textContent = note;
        laneNote.hidden = false;
      } else {
        laneNote.hidden = true;
      }
      live.textContent = d.y + " рік. " + d.v + " " + plural(d.v) + ". " + d.bud + " виділено.";
    }
    Array.prototype.forEach.call(rail.children, (r, k) => {
      r.classList.toggle("on", k === i);
      r.setAttribute("aria-current", k === i ? "true" : "false");
    });
  }
  let navLock = 0;
  function makeScrollDriver(onIndex) {
    let raf = 0;
    scroller.addEventListener("scroll", () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        if (scrollHint) scrollHint.style.opacity = scroller.scrollTop > 20 ? "0" : "1";
        if (navLock) return;
        const i = Math.round(scroller.scrollTop / scroller.clientHeight);
        onIndex(Math.max(0, Math.min(YEARS.length - 1, i)));
      });
    }, {
      passive: true
    });
  }
  function goTo(i) {
    navLock += 1;
    scroller.scrollTo({
      top: i * scroller.clientHeight,
      behavior: reduce ? "auto" : "smooth"
    });
    render(i);
    window.setTimeout(() => {
      navLock = Math.max(0, navLock - 1);
    }, reduce ? 0 : 700);
  }
  const fsTxt = fsBtn.querySelector(".fs-txt");
  function enterFs() {
    widget.classList.add("is-fs");
    stage.hidden = false;
    fsTxt.textContent = "Згорнути";
    fsBtn.setAttribute("aria-label", "Згорнути");
    if (widget.requestFullscreen) widget.requestFullscreen().catch(() => {});
    requestAnimationFrame(() => {
      scroller.scrollTop = 0;
      render(0);
      scroller.focus();
    });
  }
  function exitFs() {
    widget.classList.remove("is-fs");
    stage.hidden = true;
    fsTxt.textContent = "На весь екран";
    fsBtn.setAttribute("aria-label", "Відкрити на весь екран");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    render(YEARS.length - 1);
  }
  fsBtn.addEventListener("click", () => widget.classList.contains("is-fs") ? exitFs() : enterFs());
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && widget.classList.contains("is-fs")) exitFs();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && widget.classList.contains("is-fs")) exitFs();
  });
  scroller.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "PageDown") {
      e.preventDefault();
      goTo(Math.min(YEARS.length - 1, cur + 1));
    } else if (e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault();
      goTo(Math.max(0, cur - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      goTo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      goTo(YEARS.length - 1);
    } else if (e.key === "Escape" && widget.classList.contains("is-fs")) exitFs();
  });
  if (window.ResizeObserver) {
    let rt = 0;
    const ro = new ResizeObserver(() => {
      if (rt) window.clearTimeout(rt);
      rt = window.setTimeout(() => {
        if (widget.classList.contains("is-fs") && cur >= 0) {
          scroller.scrollTop = cur * scroller.clientHeight;
        }
      }, 120);
    });
    ro.observe(widget);
  }
  makeScrollDriver(render);
  render(YEARS.length - 1);
})();
