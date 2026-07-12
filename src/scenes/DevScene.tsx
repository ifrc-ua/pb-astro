// Фейкова сцена для перевірки скрол-драйвера і SceneShell (сторінка _dev-scene).
// Візуалізація — великий номер кроку + зміна відтінку фону.
import { useState } from "react";
import { SceneShell } from "./SceneShell";

const STEPS = [
  "Крок <strong>1</strong> — старт сцени.",
  "Крок <strong>2</strong> — середина.",
  "Крок <strong>3</strong> — далі.",
  "Крок <strong>4</strong> — фінальний стан.",
];

const HUES = ["#F6F4FB", "#EEEAF7", "#E4DDF2", "#D9CFEC"];

export default function DevScene() {
  const [step, setStep] = useState(0);
  return (
    <SceneShell steps={STEPS} onStep={setStep}>
      <div
        data-dev-step={step}
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: HUES[step],
          transition: "background 250ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <span className="stat-number" style={{ fontSize: "30vmin", color: "#654EA3" }}>
          {step + 1}
        </span>
      </div>
    </SceneShell>
  );
}
