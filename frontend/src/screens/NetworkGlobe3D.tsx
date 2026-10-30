import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import type { Location, NetworkItem } from '../types';

class GlobeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="empty">3D 표시를 사용할 수 없습니다. 아래 연결 목록에서 확인하세요.</p> : this.props.children; }
}

type Point = { lat: number; lng: number; color: string };
const valid = (location: Location | null): location is Location => !!location &&
  Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
  Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;

function Scene({ items, center }: { items: NetworkItem[]; center: [number, number] }) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const wrapper = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 500, height: 460 });
  const [countries, setCountries] = useState<object[]>([]);
  const [mapError, setMapError] = useState(false);
  const [paused, setPaused] = useState(false);
  const [webgl] = useState(() => {
    try { return !!document.createElement('canvas').getContext('webgl2'); }
    catch { return false; }
  });
  useEffect(() => {
    if (!wrapper.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({
      width: Math.max(1, Math.floor(entry.contentRect.width)), height: 460,
    }));
    observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/threat-map/countries.geojson', { signal: abort.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { if (!Array.isArray(data.features)) throw new Error(); setCountries(data.features); })
      .catch(error => { if (error.name !== 'AbortError') setMapError(true); });
    return () => abort.abort();
  }, []);
  useEffect(() => { ref.current?.pointOfView({ lat: center[0], lng: center[1], altitude: 2.2 }, 600); }, [center]);
  useEffect(() => {
    if (ref.current) ref.current.controls().autoRotate = !paused;
  }, [paused]);
  const { points, arcs } = useMemo(() => {
    const points: Point[] = [];
    const arcs: { startLat: number; startLng: number; endLat: number; endLng: number }[] = [];
    for (const item of items) {
      if (valid(item.location)) points.push({ lat: item.location.latitude, lng: item.location.longitude, color: '#22d3ee' });
      if (valid(item.serverLocation)) points.push({ lat: item.serverLocation.latitude, lng: item.serverLocation.longitude, color: '#a78bfa' });
      if (valid(item.location) && valid(item.serverLocation)) arcs.push({
        startLat: item.serverLocation.latitude, startLng: item.serverLocation.longitude,
        endLat: item.location.latitude, endLng: item.location.longitude,
      });
    }
    return { points, arcs };
  }, [items]);
  return <>
    <div className="network-globe-3d" ref={wrapper} data-points={points.length} data-arcs={arcs.length}>
      {webgl ? <Globe ref={ref} width={size.width} height={size.height} backgroundColor="rgba(0,0,0,0)"
        showAtmosphere atmosphereColor="#22d3ee" atmosphereAltitude={0.16}
        hexPolygonsData={countries} hexPolygonResolution={3} hexPolygonMargin={0.45}
        hexPolygonUseDots hexPolygonColor={() => 'rgba(139,147,160,0.58)'}
        arcsData={arcs} arcColor={() => ['#a78bfa', '#22d3ee']} arcStroke={0.6}
        arcAltitudeAutoScale={0.45}
        pointsData={points} pointLat="lat" pointLng="lng" pointColor="color"
        pointRadius={0.4} pointAltitude={0.01}
        onGlobeReady={() => { if (ref.current) {
          ref.current.pointOfView({ lat: center[0], lng: center[1], altitude: 2.2 });
          ref.current.controls().autoRotate = !paused;
          ref.current.controls().autoRotateSpeed = 0.25;
        } }}
      /> : <p className="empty">WebGL을 사용할 수 없어 3D 지도를 표시하지 못했습니다. 연결 목록은 계속 확인할 수 있습니다.</p>}
    </div>
    {webgl && <button onClick={() => setPaused(value => !value)}>{paused ? '자동 회전 시작' : '자동 회전 중지'}</button>}
    {mapError && <p role="status" className="hint">국가 경계를 불러오지 못했습니다. 관찰 위치와 목록은 계속 표시합니다.</p>}
  </>;
}

export default function NetworkGlobe3D(props: { items: NetworkItem[]; center: [number, number] }) {
  return <GlobeBoundary><Scene {...props} /></GlobeBoundary>;
}
