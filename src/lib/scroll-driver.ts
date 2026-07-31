// Скрол-драйвер сцен (патерн scrollama на IntersectionObserver, без залежності).
// Крок i «спрацьовує», коли його елемент перетинає горизонтальну лінію
// на висоті offset вьюпорта (0.5 = середина екрана). Працює в обидва боки скролу.
export interface ScrollDriverOptions {
  steps: HTMLElement[];
  onStep: (index: number) => void;
  offset?: number;
}

export function createScrollDriver({ steps, onStep, offset = 0.5 }: ScrollDriverOptions): () => void {
  let active = -1;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const i = steps.indexOf(e.target as HTMLElement);
        if (i !== -1 && i !== active) {
          active = i;
          onStep(i);
        }
      }
    },
    // rootMargin стискає «зону перетину» до однієї лінії на висоті offset
    { rootMargin: `-${offset * 100}% 0px -${(1 - offset) * 100}% 0px`, threshold: 0 }
  );
  steps.forEach((s) => io.observe(s));
  return () => io.disconnect();
}
