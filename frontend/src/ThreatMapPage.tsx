import { useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import { dataMode } from './api';
import { demoThreatEvent, hasGeo, normalizeThreatEvent, threatSeverityLabels, threatTypeLabels, type ThreatEvent, type ThreatSeverity } from './threatMapData';
import './threatMap.css';

type Connection = 'demo' | 'connecting' | 'connected' | 'disconnected' | 'unconfigured';
const colors: Record<ThreatSeverity, string> = { low: '#22d3ee', medium: '#f5a524', high: '#ff3b5c', critical: '#ff3b5c', unknown: '#8b93a0' };
const typeColors: Record<ThreatEvent['type'], string> = { network: '#22d3ee', auth: '#f5a524', process: '#a78bfa', file: '#60a5fa', db: '#f472b6', exfil: '#ff3b5c', other: '#8b93a0' };
const clock = (at: string | null) => at ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(at)) : '시각 미제공';
const websocketUrl = (import.meta.env.VITE_THREAT_WS_URL || '').trim();

function ThreatGlobe({ events, selected, onSelect }: { events: ThreatEvent[]; selected: ThreatEvent | null; onSelect: (id: string) => void }) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const wrapper = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 500, height: 610 });
  const [countries, setCountries] = useState<object[]>([]);
  const [mapError, setMapError] = useState(false);
  const [webgl] = useState(() => {
    try { const canvas = document.createElement('canvas'); return !!(canvas.getContext('webgl2') || canvas.getContext('webgl')); }
    catch { return false; }
  });
  useEffect(() => {
    if (!wrapper.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(200, entry.contentRect.width), height: Math.max(300, entry.contentRect.height) }));
    observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}threat-map/countries.geojson`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('지도 데이터를 불러오지 못했습니다.'); return response.json(); })
      .then(data => { if (Array.isArray(data?.features)) setCountries(data.features); else setMapError(true); })
      .catch(error => { if (error?.name !== 'AbortError') setMapError(true); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (selected && hasGeo(selected) && ref.current) {
      ref.current.pointOfView({ lat: ((selected.srcLat as number) + (selected.dstLat as number)) / 2 + 7, lng: ((selected.srcLng as number) + (selected.dstLng as number)) / 2, altitude: 2.1 }, 1000);
      ref.current.controls().autoRotate = false;
    }
  }, [selected]);
  const arcs = useMemo(() => events.filter(hasGeo).slice(0, 18), [events]);
  const destinations = useMemo(() => arcs.filter((item, index) => arcs.findIndex(other => other.dstLat === item.dstLat && other.dstLng === item.dstLng) === index).map(item => ({ lat: item.dstLat, lng: item.dstLng, label: item.dstHost || '대상 서버' })), [arcs]);
  const dots = useMemo(() => [
    ...destinations.map(item => ({ lat: item.lat, lng: item.lng, color: '#22d3ee', radius: 0.45 })),
    ...arcs.map(item => ({ lat: item.srcLat, lng: item.srcLng, color: colors[item.severity], radius: item.severity === 'critical' ? 0.35 : 0.25 })),
  ], [arcs, destinations]);
  const rings = useMemo(() => arcs.slice(0, 5).map(item => ({ lat: item.dstLat, lng: item.dstLng, color: colors[item.severity] })), [arcs]);
  return <div className="threat-globe-wrap" ref={wrapper}>
    {webgl ? <Globe ref={ref} width={size.width} height={size.height} backgroundColor="rgba(0,0,0,0)" globeImageUrl={null}
      showAtmosphere atmosphereColor="#22d3ee" atmosphereAltitude={0.16}
      hexPolygonsData={countries} hexPolygonResolution={3} hexPolygonMargin={0.45} hexPolygonUseDots hexPolygonColor={() => 'rgba(139,147,160,0.58)'}
      arcsData={arcs} arcStartLat="srcLat" arcStartLng="srcLng" arcEndLat="dstLat" arcEndLng="dstLng"
      arcColor={(item: object) => [colors[(item as ThreatEvent).severity] + '40', colors[(item as ThreatEvent).severity]]}
      arcStroke={item => (item as ThreatEvent).severity === 'critical' ? 1.6 : (item as ThreatEvent).severity === 'high' ? 1.1 : 0.6}
      arcDashLength={0.45} arcDashGap={1.2} arcDashInitialGap={1} arcDashAnimateTime={1700} arcAltitudeAutoScale={0.45}
      onArcClick={item => onSelect((item as ThreatEvent).id)}
      pointsData={dots} pointLat="lat" pointLng="lng" pointColor="color" pointRadius="radius" pointAltitude={0.01}
      ringsData={rings} ringLat="lat" ringLng="lng" ringColor={(item: object) => (t: number) => {
        const hex = (item as { color: string }).color; const n = parseInt(hex.slice(1), 16);
        return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${1 - t})`;
      }} ringMaxRadius={5} ringPropagationSpeed={3} ringRepeatPeriod={650}
      labelsData={destinations} labelLat="lat" labelLng="lng" labelText="label" labelSize={1.1} labelDotRadius={0.5} labelColor={() => '#22d3ee'}
      onGlobeReady={() => { if (ref.current) { ref.current.pointOfView({ lat: 35, lng: 105, altitude: 2.2 }); ref.current.controls().autoRotate = true; ref.current.controls().autoRotateSpeed = 0.25; } }}
    /> : <div className="threat-map-fallback">이 브라우저에서 WebGL을 사용할 수 없어 3D 지도를 표시하지 못했습니다. 이벤트 목록은 계속 확인할 수 있습니다.</div>}
    {mapError && <div className="threat-map-error">국가 경계 데이터를 불러오지 못했습니다.</div>}
    <div className="threat-globe-legend"><span><i className="red" />고위험</span><span><i className="amber" />의심</span><span><i className="cyan" />저위험</span></div>
  </div>;
}

export default function ThreatMapPage() {
  const [events, setEvents] = useState<ThreatEvent[]>(() => dataMode === 'demo' ? Array.from({ length: 5 }, (_, i) => demoThreatEvent(i, new Date(Date.now() - (5 - i) * 1300))).reverse() : []);
  const [seen, setSeen] = useState(dataMode === 'demo' ? 5 : 0);
  const [connection, setConnection] = useState<Connection>(dataMode === 'demo' ? 'demo' : websocketUrl ? 'connecting' : 'unconfigured');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(false);
  const [now, setNow] = useState(Date.now());
  const chooseEvent = (id: string) => { pinnedRef.current = true; setPinned(true); setSelectedId(id); };
  const resumeLatest = () => { pinnedRef.current = false; setPinned(false); setSelectedId(null); };
  const selected = events.find(item => item.id === selectedId) ?? events[0] ?? null;
  const recent = events.filter(item => item.at && Date.parse(item.at) >= now - 60_000).length;
  const high = events.filter(item => item.severity === 'high' || item.severity === 'critical').length;
  const geocoded = events.filter(hasGeo).length;
  const countryCounts = useMemo(() => Object.entries(events.reduce<Record<string, number>>((all, item) => {
    if (item.srcCountry) all[item.srcCountry] = (all[item.srcCountry] || 0) + 1;
    return all;
  }, {})).sort((a, b) => b[1] - a[1]), [events]);
  const typeCounts = useMemo(() => Object.entries(events.reduce<Record<string, number>>((all, item) => {
    all[item.type] = (all[item.type] || 0) + 1;
    return all;
  }, {})).sort((a, b) => b[1] - a[1]), [events]);
  const chainSource = events.find(item => item.chain)?.srcIp;
  const chainProgress = events.filter(item => item.chain && item.srcIp === chainSource).reduce((max, item) => Math.max(max, item.chain || 0), 0);

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (dataMode === 'demo') {
      let index = 5;
      const timer = setInterval(() => {
        const item = demoThreatEvent(index++);
        setEvents(previous => [item, ...previous].slice(0, 80));
        setSeen(index);
        if (!pinnedRef.current && (item.severity === 'high' || item.severity === 'critical')) setSelectedId(item.id);
      }, 1500);
      return () => clearInterval(timer);
    }
    if (!websocketUrl) return;
    let active = true;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      try {
        const url = new URL(websocketUrl);
        if (url.protocol !== 'ws:' && url.protocol !== 'wss:') throw new Error('WebSocket URL은 ws:// 또는 wss://여야 합니다.');
        setConnection('connecting');
        socket = new WebSocket(url);
        socket.onopen = () => { if (active) setConnection('connected'); };
        socket.onmessage = message => {
          if (!active) return;
          try {
            const payload = JSON.parse(message.data);
            if (payload?.type === 'init' && Array.isArray(payload.events)) {
              const initial = payload.events.map(normalizeThreatEvent).filter((item: ThreatEvent | null): item is ThreatEvent => item !== null).reverse().slice(0, 80);
              setEvents(initial); setSeen(initial.length);
            } else if (payload?.type === 'event') {
              const item = normalizeThreatEvent(payload.data);
              if (item) { setEvents(previous => [item, ...previous].slice(0, 80)); setSeen(previous => previous + 1); if (!pinnedRef.current && (item.severity === 'high' || item.severity === 'critical')) setSelectedId(item.id); }
            }
          } catch { /* Ignore malformed stream messages; never render untrusted HTML. */ }
        };
        socket.onclose = () => { if (active) { setConnection('disconnected'); retry = setTimeout(connect, 2500); } };
        socket.onerror = () => { if (active) setConnection('disconnected'); };
      } catch { setConnection('unconfigured'); }
    };
    connect();
    return () => { active = false; if (retry) clearTimeout(retry); socket?.close(); };
  }, []);

  const connectionText = connection === 'demo' ? 'DEMO · 시연 이벤트' : connection === 'connected' ? 'WebSocket 연결됨' : connection === 'connecting' ? 'WebSocket 연결 중' : connection === 'disconnected' ? 'WebSocket 연결 끊김 · 재시도 중' : 'WebSocket 주소 미설정';
  return <div className="threat-page">
    <div className="page-heading threat-heading"><div><h1>실시간 위협 지도</h1><p>첨부 시연 시나리오 · 위치가 제공된 이벤트만 지구본에 표시</p></div><span className={`threat-connection ${connection}`}>● {connectionText}</span></div>
    <div className="threat-kpis"><div><span>현재 세션 이벤트</span><strong>{seen}</strong></div><div><span>최근 1분</span><strong>{recent}</strong></div><div className="alert"><span>표시된 고위험 · 치명</span><strong>{high}</strong></div><div><span>출발 국가</span><strong>{countryCounts.length}</strong></div></div>
    <div className="threat-layout">
      <section className="threat-feed"><div className="threat-panel-title">이벤트 피드 <button className="threat-follow" onClick={resumeLatest} disabled={!pinned}>{pinned ? '최신 따라가기' : '자동 선택 중'}</button></div>{events.length ? <div className="threat-feed-list">{events.map(item => <button key={item.id} className={`threat-event ${item.severity} ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => chooseEvent(item.id)}><div className="threat-event-top"><time>{clock(item.at)}</time><span className={`threat-tag ${item.severity}`}>{threatSeverityLabels[item.severity]}</span><span>{threatTypeLabels[item.type]}</span></div><div className="threat-route">{item.srcIso || '출발지 미제공'} {item.srcIp || ''} → {item.dstHost || '대상 미제공'}</div><p>{item.detail}</p></button>)}</div> : <div className="threat-empty">{connection === 'unconfigured' ? 'VITE_THREAT_WS_URL을 설정하면 이벤트를 받을 수 있습니다.' : '위협 지도 이벤트를 기다리는 중입니다.'}</div>}</section>
      <section className="threat-map-center"><ThreatGlobe events={events} selected={selected} onSelect={chooseEvent} />{selected && selected.severity === 'critical' && <div className="threat-banner">{selected.origin === 'demo' ? '시연 이벤트' : '수신 이벤트'} · {selected.srcIso || '출발지 미제공'} → {selected.dstHost || '대상 미제공'} · {selected.detail}</div>}{events.length > 0 && geocoded === 0 && <div className="threat-location-note">수신 이벤트에 출발지·대상 좌표가 없어 경로를 표시하지 않았습니다.</div>}</section>
      <aside className="threat-insights"><div className="threat-card scenario-card"><div className="threat-panel-title">시나리오 해설 <span className="threat-tag critical">{dataMode === 'demo' ? 'DEMO 규칙' : '수신 정보'}</span></div>{dataMode === 'demo' ? <><p>{chainProgress >= 4 ? '시연 데이터에서 DB 조회와 외부 전송 단계까지 이어졌습니다. 실제 침해나 유출을 확인한 결과는 아닙니다.' : chainProgress >= 2 ? '시연 데이터에서 로그인 성공 이후의 행동을 순서대로 보여주고 있습니다.' : '첨부된 시연 시나리오의 이벤트를 순서대로 재생합니다.'}</p><div className="threat-chain">{['접속', '계정', '프로세스', 'DB', '유출'].map((label, i) => <span key={label} className={chainProgress >= i + 1 ? 'on' : ''}>{label}</span>)}</div><small>규칙 기반 Demo 해설 · OpenAI 분석 결과 아님</small></> : <><p>{selected ? selected.detail : '수신된 이벤트를 선택하면 제공된 내용을 표시합니다.'}</p><small>사고 판단과 대응은 AI 사고 분석 화면에서 확인하세요.</small></>}</div>
        <div className="threat-card"><div className="threat-panel-title">선택한 이벤트</div>{selected ? <div className="threat-selected"><div><span>출처</span><b>{selected.origin === 'demo' ? 'DEMO' : 'WebSocket'}</b></div><div><span>발생 시각</span><b>{clock(selected.at)}</b></div><div><span>유형 · 위험도</span><b>{threatTypeLabels[selected.type]} · {threatSeverityLabels[selected.severity]}</b></div><div><span>출발</span><b>{[selected.srcCity, selected.srcCountry, selected.srcIp].filter(Boolean).join(' · ') || '미제공'}</b></div><div><span>대상</span><b>{selected.dstHost || '미제공'}</b></div><div><span>지도 좌표</span><b>{hasGeo(selected) ? '제공됨' : '미제공'}</b></div></div> : <div className="threat-empty">선택한 이벤트가 없습니다.</div>}</div>
        <div className="threat-card"><div className="threat-panel-title">이벤트 유형</div><div className="threat-bars">{typeCounts.map(([type, count]) => <div key={type}><span>{threatTypeLabels[type as ThreatEvent['type']]}</span><div><i style={{ width: `${count / (typeCounts[0]?.[1] || 1) * 100}%`, background: typeColors[type as ThreatEvent['type']] }} /></div><b>{count}</b></div>)}</div></div>
        <div className="threat-card"><div className="threat-panel-title">이벤트 출발 국가 Top 5</div><div className="threat-bars">{countryCounts.slice(0, 5).map(([country, count]) => <div key={country}><span>{country}</span><div><i style={{ width: `${count / (countryCounts[0]?.[1] || 1) * 100}%`, background: '#f5a524' }} /></div><b>{count}</b></div>)}</div></div>
      </aside>
    </div>
    <p className="threat-disclaimer">위치와 이벤트 내용은 Demo 시나리오 또는 WebSocket 응답에서 제공된 값입니다. 좌표가 없는 실제 Tetragon 이벤트의 출발지를 프론트엔드에서 추정하지 않습니다.</p>
  </div>;
}
