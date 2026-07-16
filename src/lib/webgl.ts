// WebGL-детект для мапних сцен (deck.gl + MapLibre). failIfMajorPerformanceCaveat
// відсіює софтверні рендерери (SwiftShader тощо), де deck.gl «живий», але
// точки не малюються або все повзе — таким пристроям краще статичний фолбек.
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const opts = { failIfMajorPerformanceCaveat: true } as WebGLContextAttributes;
    return !!(c.getContext("webgl2", opts) ?? c.getContext("webgl", opts));
  } catch {
    return false;
  }
}
