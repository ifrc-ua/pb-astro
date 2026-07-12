// Спільна оболонка sticky-сцен: візуалізація фіксується на 100dvh,
// степ-картки наїжджають зверху і через scroll-driver перемикають її стани.
// Сцени (children) реалізують onStep(i). Розмітка карток — довірені рядки
// зі статті (власний контент, не користувацький ввід).
import { useEffect, useRef, type ReactNode } from "react";
import { createScrollDriver } from "../lib/scroll-driver";

export function SceneShell({
  steps,
  onStep,
  children,
}: {
  steps: string[];
  onStep: (i: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const els = Array.from(ref.current?.querySelectorAll<HTMLElement>(".scene-step") ?? []);
    const setActive = (i: number) => {
      els.forEach((el, j) => el.classList.toggle("is-active", j === i));
      onStep(i);
    };
    setActive(0);
    return createScrollDriver({ steps: els, onStep: setActive });
  }, []);

  return (
    <section className="scene" ref={ref}>
      <div className="scene-sticky">{children}</div>
      <div className="scene-steps">
        {steps.map((html, i) => (
          <div className="scene-step" key={i}>
            <div className="scene-card" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ))}
      </div>
    </section>
  );
}
