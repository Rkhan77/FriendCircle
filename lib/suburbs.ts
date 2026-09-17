import boundaries from "../data/perth_suburbs.json";

type Ring = number[][];
type Polygon = Ring[];
type Geometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: Polygon | Polygon[];
};
export type Suburb = { code: string; name: string; geometry: Geometry };
const suburbs: Suburb[] = boundaries.features.map((feature) => ({
  code: feature.properties.sal_code_2021,
  name: feature.properties.sal_name_2021,
  geometry: feature.geometry as Geometry,
}));
function insideRing(lng: number, lat: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
function insidePolygon(lng: number, lat: number, rings: Polygon) {
  return (
    insideRing(lng, lat, rings[0]) &&
    !rings.slice(1).some((ring) => insideRing(lng, lat, ring))
  );
}
export function suburbAt(lat: number, lng: number): Suburb | undefined {
  return suburbs.find((suburb) =>
    suburb.geometry.type === "Polygon"
      ? insidePolygon(lng, lat, suburb.geometry.coordinates as Polygon)
      : (suburb.geometry.coordinates as Polygon[]).some((polygon) =>
          insidePolygon(lng, lat, polygon),
        ),
  );
}
export function sameSuburb(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const first = suburbAt(a.lat, a.lng);
  return !!first && first.code === suburbAt(b.lat, b.lng)?.code;
}
