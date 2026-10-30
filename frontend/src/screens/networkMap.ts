import type { Location, NetworkItem } from '../types';

type Colors = { safe: string; danger: string; server: string; unknown: string };
type Point = { lat: number; lng: number; color: string; risk: boolean };
type Arc = { startLat: number; startLng: number; endLat: number; endLng: number; color: string; risk: boolean };
const valid = (location: Location | null): location is Location => !!location &&
  Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
  Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;

export function networkMap(items: NetworkItem[], colors: Colors) {
  const points = new Map<string, { point: Point; priority: number }>();
  const arcs = new Map<string, { arc: Arc; priority: number }>();
  function place(location: Location, color: string, priority: number) {
    const key = `${location.latitude},${location.longitude}`;
    // Shared coordinates must not let a safe/server marker cover a risk marker.
    if ((points.get(key)?.priority ?? -1) > priority) return;
    points.set(key, { point: { lat: location.latitude, lng: location.longitude, color, risk: priority === 3 }, priority });
  }
  for (const item of items) {
    const known = Number.isInteger(item.attentionCount) && item.attentionCount >= 0 && item.attentionCount <= item.count;
    const risk = known && item.attentionCount > 0;
    const color = risk ? colors.danger : known ? colors.safe : colors.unknown;
    const priority = risk ? 3 : known ? 2 : 1;
    if (valid(item.location)) place(item.location, color, priority);
    if (valid(item.serverLocation)) place(item.serverLocation, colors.server, 0);
    if (valid(item.location) && valid(item.serverLocation)) {
      const arc = {
        startLat: item.serverLocation.latitude, startLng: item.serverLocation.longitude,
        endLat: item.location.latitude, endLng: item.location.longitude, color, risk,
      };
      const key = `${arc.startLat},${arc.startLng}:${arc.endLat},${arc.endLng}`;
      if ((arcs.get(key)?.priority ?? -1) <= priority) arcs.set(key, { arc, priority });
    }
  }
  return { points: [...points.values()].map(({ point }) => point), arcs: [...arcs.values()].map(({ arc }) => arc) };
}
