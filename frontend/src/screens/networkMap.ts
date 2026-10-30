import type { Location, NetworkItem } from '../types';

type Colors = { safe: string; danger: string; server: string; unknown: string };
type Point = { lat: number; lng: number; color: string; risk: boolean };
type Arc = { startLat: number; startLng: number; endLat: number; endLng: number; color: string; risk: boolean; altitude: number; dashOffset: number };
const valid = (location: Location | null): location is Location => !!location &&
  Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
  Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;

export function networkMap(items: NetworkItem[], colors: Colors) {
  const points = new Map<string, { point: Point; priority: number }>();
  const routes = new Map<string, { startLat: number; startLng: number; endLat: number; endLng: number; color: string; risk: boolean; count: number }>();
  function place(location: Location, color: string, priority: number) {
    const key = `${location.latitude},${location.longitude}`;
    // Shared coordinates must not let a safe/server marker cover a risk marker.
    if ((points.get(key)?.priority ?? -1) > priority) return;
    points.set(key, { point: { lat: location.latitude, lng: location.longitude, color, risk: priority === 3 }, priority });
  }
  for (const item of items) {
    if (!Number.isFinite(item.count) || item.count <= 0) continue;
    const known = Number.isInteger(item.attentionCount) && item.attentionCount >= 0 && item.attentionCount <= item.count;
    const risk = known && item.attentionCount > 0;
    const color = risk ? colors.danger : known ? colors.safe : colors.unknown;
    const priority = risk ? 3 : known ? 2 : 1;
    if (valid(item.location)) place(item.location, color, priority);
    if (valid(item.serverLocation)) place(item.serverLocation, colors.server, 0);
    if (valid(item.location) && valid(item.serverLocation)) {
      const groups = known ? [
        { count: item.count - item.attentionCount, color: colors.safe, risk: false },
        { count: item.attentionCount, color: colors.danger, risk: true },
      ] : [{ count: item.count, color: colors.unknown, risk: false }];
      for (const group of groups) {
        if (group.count <= 0) continue;
        const route = {
          startLat: item.serverLocation.latitude, startLng: item.serverLocation.longitude,
          endLat: item.location.latitude, endLng: item.location.longitude, ...group,
        };
        const key = `${route.startLat},${route.startLng}:${route.endLat},${route.endLng}:${group.color}`;
        const previous = routes.get(key);
        routes.set(key, { ...route, count: (previous?.count || 0) + group.count });
      }
    }
  }
  const arcs: Arc[] = [];
  for (const route of routes.values()) {
    if (route.startLat === route.endLat && route.startLng === route.endLng) continue;
    const radians = Math.PI / 180;
    const distance = Math.acos(Math.max(-1, Math.min(1,
      Math.sin(route.startLat * radians) * Math.sin(route.endLat * radians) +
      Math.cos(route.startLat * radians) * Math.cos(route.endLat * radians) * Math.cos((route.endLng - route.startLng) * radians),
    )));
    // Log scaling keeps busy routes readable; lanes share the actual endpoints.
    const lanes = Math.min(24, 1 + Math.ceil(Math.log2(route.count)));
    for (let lane = 0; lane < lanes; lane++) {
      arcs.push({ ...route, altitude: Math.min(0.85, Math.max(0.08, distance * 0.3) + lane * 0.018), dashOffset: lane / lanes });
    }
  }
  return { points: [...points.values()].map(({ point }) => point), arcs };
}
