const nbsp = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function mountCountUps(root: ParentNode = document): void {
  const els = root.querySelectorAll<HTMLElement>("[data-countup]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target as HTMLElement;
      const target = Number(el.dataset.countup);
      if (reduced || target < 100) { el.textContent = nbsp(target); continue; }
      const dur = target > 10000 ? 1200 : 900;
      const stagger = Number(el.dataset.stagger) || 0;
      const start = () => {
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          el.textContent = nbsp(target * ease(p));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };
      if (stagger) setTimeout(start, stagger); else start();
    }
  }, { threshold: 0.4 });
  els.forEach((el) => io.observe(el));
}
