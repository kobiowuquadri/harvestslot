export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle (straight-line) distance. Never presented as a road route. */
export function haversineKm(a: Point, b: Point): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Rounds a coordinate to 2 decimal places (~1.1 km) for public/approximate display. */
export function approximate(point: Point): Point {
  return { lat: Math.round(point.lat * 100) / 100, lng: Math.round(point.lng * 100) / 100 };
}

/** A conservative road-distance estimate from straight-line distance, labelled as such wherever shown. */
export function estimateRoadKm(straightLineKm: number, factor: number): number {
  return round1(straightLineKm * factor);
}

export function distanceLabel(straightLineKm: number, roadKm: number, method: 'STRAIGHT_LINE_ESTIMATE' | 'ROUTING_PROVIDER'): string {
  return method === 'ROUTING_PROVIDER'
    ? `${roadKm} km by road (routing provider)`
    : `${round1(straightLineKm)} km straight-line · about ${roadKm} km by road (estimate, not a route)`;
}
