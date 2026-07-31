// Динамічне завантаження мапних бібліотек лише в браузері: maplibre і deck.gl
// (через luma.gl) чіпають браузерні глобали на імпорті й валять пререндер
// Astro в Node. Компоненти сцен викликають loadMapLibs() усередині useEffect.
let cached: MapLibs | null = null;

export interface MapLibs {
  maplibregl: any;
  MapboxOverlay: any;
  ScatterplotLayer: any;
  H3HexagonLayer: any;
  DataFilterExtension: any;
}

export async function loadMapLibs(): Promise<MapLibs> {
  if (cached) return cached;
  const [ml, mapbox, layers, geoLayers, extensions] = await Promise.all([
    import("maplibre-gl"),
    import("@deck.gl/mapbox"),
    import("@deck.gl/layers"),
    import("@deck.gl/geo-layers"),
    import("@deck.gl/extensions"),
  ]);
  cached = {
    maplibregl: ml.default,
    MapboxOverlay: mapbox.MapboxOverlay,
    ScatterplotLayer: layers.ScatterplotLayer,
    H3HexagonLayer: geoLayers.H3HexagonLayer,
    DataFilterExtension: extensions.DataFilterExtension,
  };
  return cached;
}
