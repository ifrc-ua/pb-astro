// Спільна оболонка sticky-сцен: візуалізація фіксується на 100dvh,
// степ-картки наїжджають зверху і через scroll-driver перемикають її стани.
// Сцени (children) реалізують onStep(i). Розмітка карток — довірені рядки
// (власний контент, не користувацький ввід), тож dangerouslySetInnerHTML тут
// безпечний.
//
// Регістр текстів карток. Картка НЕ мусить повторювати абзац статті — це різні
// жанри. Проза веде сюжет, картка веде око по графіку: коротше, вказівніше, про
// те, що змінюється саме на цьому кроці. Так пишуть крокові підписи в графічних
// відділах NYT, ProPublica, Reuters Graphics; дубль абзацу змушує читача читати
// те саме двічі, а вказівку при цьому не дає. Збіг із прозою припустимий, коли
// формулювання й справді найкраще, але він не є вимогою — і жодна перевірка
// його не стежить (check-numbers.mjs звіряє лише числа MDX проти канону).
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
