import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dataClient, dataMode } from './api';
import type { Analysis, Incident, IncidentStatus, Overview, Severity } from './model';
import { severities, severityLabels, statuses, statusLabels } from './model';
import './style.css';

const ThreatMapPage = React.lazy(() => import('./ThreatMapPage'));
type Page = 'dashboard' | 'threat-map' | 'analysis' | 'response';
function route(): { page: Page; id: string | null } {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  return { page: parts[0] === 'analysis' || parts[0] === 'response' || parts[0] === 'threat-map' ? parts[0] : 'dashboard', id: parts[1] || null };
}
const go = (page: Page, id?: string) => { location.hash = page === 'dashboard' ? '#/' : page === 'threat-map' ? '#/threat-map' : `#/${page}/${encodeURIComponent(id || '')}`; };
const clock = (value: string | null) => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)) : '미수집';
const dateTime = (value: string | null) => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date(value)) : '미수집';
const formatNumber = (value: number | null) => value === null ? '—' : value.toLocaleString('ko-KR');
const statusTone = (value: IncidentStatus) => value === 'resolved' ? 'green' : value === 'benign' ? 'cyan' : value === 'investigating' ? 'amber' : value === 'unconfirmed' ? 'red' : 'muted';
const severityTone = (value: Severity) => value === 'CRITICAL' || value === 'HIGH' ? 'red' : value === 'MEDIUM' ? 'cyan' : value === 'LOW' ? 'green' : 'muted';

function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
function SourceBadge({ source }: { source: Incident['source'] }) { return <Badge tone={source === 'live' ? 'green' : source === 'sample' || source === 'demo' ? 'amber' : 'muted'}>{source === 'demo' ? 'DEMO' : source === 'sample' ? 'SAMPLE' : source === 'live' ? 'LIVE' : '출처 미제공'}</Badge>; }
function Panel({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}
function Metric({ title, value, unit, caption, tone }: { title: string; value: string; unit?: string; caption: string; tone: string }) {
  return <div className={`metric ${tone}`}><span className="metric-title">{title}</span><div className="metric-main"><strong>{value}</strong><span>{unit}</span></div><small>{caption}</small></div>;
}
function Empty({ children }: { children: React.ReactNode }) { return <div className="empty">{children}</div>; }

function Dashboard({ overview, incidents, search, onSelect }: { overview: Overview; incidents: Incident[]; search: string; onSelect: (id: string) => void }) {
  const [server, setServer] = useState('all');
  const [risk, setRisk] = useState('all');
  const [period, setPeriod] = useState('all');
  const servers = [...new Set(incidents.map(x => x.server))];
  const filtered = incidents.filter(x => {
    const date = x.firstSeenAt ? Date.parse(x.firstSeenAt) : null;
    const hours = period === '1h' ? 1 : period === '24h' ? 24 : period === '7d' ? 168 : null;
    return (server === 'all' || x.server === server) && (risk === 'all' || x.severity === risk)
      && (hours === null || date !== null && date >= Date.now() - hours * 3600_000)
      && (!search || `${x.id} ${x.title} ${x.server}`.toLowerCase().includes(search.toLowerCase()));
  });
  const high = incidents.filter(x => x.severity === 'HIGH' || x.severity === 'CRITICAL').length;
  const pending = incidents.filter(x => x.status === 'unconfirmed' || x.status === 'investigating').length;
  const featured = incidents.find(x => x.id === 'INC-0241') || incidents[0];
  const distribution = overview.severityDistribution.length ? overview.severityDistribution : severities.map(s => ({ severity: s, count: incidents.filter(x => x.severity === s).length }));
  const total = distribution.reduce((n, x) => n + x.count, 0) || 1;
  return <>
    <div className="page-heading"><h1>보안 통합 대시보드</h1><p>Tetragon 런타임 탐지 · 서버 상태 · 사고 대응 현황</p></div>
    {featured && <div className="priority"><Badge tone="red">AI 요약</Badge><span>{featured.analysis?.behavior || `${featured.title} 사건의 관찰 근거를 확인하세요.`}</span><button className="primary small" onClick={() => onSelect(featured.id)}>사고 분석 보기 <b>→</b></button></div>}
    <div className="metric-grid">
      <Metric title="감시 중인 서버" value={formatNumber(overview.monitoredServers)} unit="대" caption={overview.collectorStatus === 'healthy' ? '수집 상태 정상 보고' : '수집 상태 별도 확인 필요'} tone="cyan" />
      <Metric title="오늘 탐지 이벤트" value={formatNumber(overview.todayEvents)} unit="건" caption={dataMode === 'demo' ? '시연용 집계' : 'API 집계'} tone="purple" />
      <Metric title="HIGH 이상 사건" value={formatNumber(high)} unit="건" caption="등록된 사고 기준" tone="red" />
      <Metric title="미처리 보안 사고" value={formatNumber(pending)} unit="건" caption="미확인 · 조사 중" tone="amber" />
    </div>
    <div className="two-columns charts-row">
      <Panel title="시간대별 탐지 이벤트" subtitle={dataMode === 'demo' ? '시연용 추이 · 5분 단위' : 'API 제공 시간 추이'} action={<Badge tone="green">● 최근 조회</Badge>}>
        {overview.trend.length ? <><div className="legend"><span className="purple-dot">프로세스</span><span className="blue-dot">파일</span><span className="cyan-dot">네트워크</span><span className="red-dot">고위험</span></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={overview.trend} barGap={0} barCategoryGap="18%"><CartesianGrid stroke="#242b35" vertical={false} /><XAxis dataKey="time" tick={{ fill: '#66717f', fontSize: 10 }} axisLine={false} tickLine={false} interval={5} /><YAxis tick={{ fill: '#66717f', fontSize: 10 }} axisLine={false} tickLine={false} width={28} /><Tooltip contentStyle={{ background: '#171b22', border: '1px solid #2a3039', color: '#e8eaed', borderRadius: 7 }} /><Bar dataKey="process" stackId="a" fill="#a78bfa" name="프로세스" /><Bar dataKey="file" stackId="a" fill="#60a5fa" name="파일" /><Bar dataKey="network" stackId="a" fill="#22d3ee" name="네트워크" /><Bar dataKey="high" stackId="a" fill="#ff3b5c" name="고위험" /></BarChart></ResponsiveContainer></div></> : <Empty>표시할 시간 추이 데이터가 없습니다.</Empty>}
      </Panel>
      <Panel title="서버별 위험 점수" subtitle="API 또는 시연 데이터에서 제공한 점수">
        {overview.serverRisk.length ? <div className="risk-list">{overview.serverRisk.map((x, i) => <div className="risk-row" key={x.server}><div><span>{x.server}</span><b className={i === 0 ? 'text-red' : i === 1 ? 'text-amber' : 'text-cyan'}>{x.score}</b></div><div className="risk-track"><span className={i === 0 ? 'bg-red' : i === 1 ? 'bg-amber' : i === 2 ? 'bg-cyan' : 'bg-blue'} style={{ width: `${Math.min(100, Math.max(0, x.score))}%` }} /></div></div>)}</div> : <Empty>위험 점수가 제공되지 않았습니다.</Empty>}
      </Panel>
    </div>
    <div className="two-columns bottom-row">
      <Panel title="최근 보안 사고" subtitle="위험도 · 상세 보기" className="incident-panel">
        <div className="filters"><select aria-label="서버별 필터" value={server} onChange={e => setServer(e.target.value)}><option value="all">전체 서버</option>{servers.map(x => <option key={x}>{x}</option>)}</select><select aria-label="위험도별 필터" value={risk} onChange={e => setRisk(e.target.value)}><option value="all">전체 위험도</option>{severities.map(x => <option key={x} value={x}>{severityLabels[x]}</option>)}</select><select aria-label="기간 필터" value={period} onChange={e => setPeriod(e.target.value)}><option value="all">전체 기간</option><option value="1h">최근 1시간</option><option value="24h">최근 24시간</option><option value="7d">최근 7일</option></select></div>
        {filtered.length ? <div className="table-wrap"><table><thead><tr><th>발생 시각</th><th>서버</th><th>사건 제목</th><th>위험도</th><th>처리 상태</th><th>상세</th></tr></thead><tbody>{filtered.map(x => <tr key={x.id} onClick={() => onSelect(x.id)}><td className="mono">{clock(x.firstSeenAt)}</td><td className="mono">{x.server}</td><td>{x.title}</td><td><span className={`text-${severityTone(x.severity)}`}>{severityLabels[x.severity]}</span></td><td>{statusLabels[x.status]}</td><td><button className="text-button" onClick={e => { e.stopPropagation(); onSelect(x.id); }}>보기 →</button></td></tr>)}</tbody></table></div> : <Empty>조건에 맞는 사고가 없습니다.</Empty>}
      </Panel>
      <Panel title="위험도 분포" subtitle="등록된 보안 사고 기준"><div className="distribution-bar">{distribution.filter(x => x.count > 0).map(x => <span key={x.severity} className={`bg-${severityTone(x.severity)}`} style={{ width: `${x.count / total * 100}%` }} />)}</div><div className="distribution-list">{distribution.map(x => <div key={x.severity}><span className={`text-${severityTone(x.severity)}`}>■</span><span>{severityLabels[x.severity]}</span><b>{x.count}건</b></div>)}</div></Panel>
    </div>
  </>;
}

function AnalysisPage({ incident, onResponse, onAnalyze, analyzing, analysisError }: { incident: Incident; onResponse: () => void; onAnalyze: () => void; analyzing: boolean; analysisError: string | null }) {
  const [selectedEvent, setSelectedEvent] = useState(0);
  const [showRaw, setShowRaw] = useState(false);
  useEffect(() => { setSelectedEvent(0); setShowRaw(false); }, [incident.id]);
  const current = incident.events[selectedEvent];
  const processes = new Set(incident.events.map(x => x.process).filter(Boolean)).size;
  return <>
    <div className="page-heading heading-with-action"><div><h1>AI 보안 사고 분석</h1><p>{incident.id} · {incident.title} · {incident.server}</p></div><div className="heading-badges"><SourceBadge source={incident.source} /><Badge tone={severityTone(incident.severity)}>{severityLabels[incident.severity]}</Badge></div></div>
    <div className="metric-grid">
      <Metric title="연결된 탐지 신호" value={String(incident.events.length).padStart(2, '0')} unit="건" caption="Tetragon 이벤트" tone="red" />
      <Metric title="관련 프로세스" value={String(processes).padStart(2, '0')} unit="개" caption="관찰된 프로세스 경로" tone="purple" />
      <Metric title="최초 관찰 시각" value={clock(incident.firstSeenAt).slice(0, 5)} caption={incident.server} tone="cyan" />
      <Metric title="처리 상태" value={statusLabels[incident.status]} caption="관리자 기록" tone="amber" />
    </div>
    <Panel title="사고 타임라인" subtitle="Tetragon 관찰 이벤트 · 선택해 근거 확인" action={<Badge tone="cyan">● 관찰된 사실</Badge>} className="timeline-panel">
      {incident.events.length ? <div className="timeline">{incident.events.map((x, i) => <button key={x.id || i} className={`timeline-event ${selectedEvent === i ? 'selected' : ''}`} onClick={() => { setSelectedEvent(i); setShowRaw(false); }}><div className="timeline-top"><b>{String(i + 1).padStart(2, '0')}</b><span>{clock(x.occurredAt).slice(0, 5)}</span></div><strong>{x.title}</strong><small>{x.process || x.target || x.type}</small></button>)}</div> : <Empty>연결된 이벤트가 없습니다.</Empty>}
      <div className="timeline-foot"><span>사고 ID {incident.id}</span><span>{incident.events.length}개 신호</span></div>
    </Panel>
    <div className="two-columns analysis-row">
      <Panel title="AI 사고 분석" subtitle="AI 추론 · 실제 관찰 사실과 구분" action={<button className="secondary" disabled={analyzing} onClick={onAnalyze}>{analyzing ? '분석 중…' : 'AI 분석 요청 ↻'}</button>} className="ai-panel">
        {analysisError && <div className="inline-error" role="alert">{analysisError}</div>}
        {incident.analysis ? <div className="analysis-copy"><Badge tone="red">AI 추론</Badge><h3>무슨 일이 있었나</h3><p>{incident.analysis.behavior || '제공된 설명이 없습니다.'}</p><h3>왜 주의가 필요한가</h3><p>{incident.analysis.risk || '제공된 설명이 없습니다.'}</p><h3>예상 영향</h3><p>{incident.analysis.impact || '제공된 설명이 없습니다.'}</p><h3>판단 근거</h3><p>{incident.analysis.evidence || '제공된 설명이 없습니다.'}</p><div className="uncertainty">불확실성 · {incident.analysis.uncertainty || '추가 확인 필요'}</div></div> : <Empty>아직 AI 분석 결과가 없습니다. 분석 요청을 누르세요.</Empty>}
      </Panel>
      <Panel title="관찰 근거와 원본 이벤트" subtitle={dataMode === 'demo' ? 'Tetragon 형식의 시연 데이터' : 'API가 전달한 관찰 데이터'} className="evidence-panel">
        {current ? <><div className="evidence-info"><div><span>발생 시각</span><b>{dateTime(current.occurredAt)}</b></div><div><span>이벤트 유형</span><b className="text-cyan mono">{current.type}</b></div><div><span>프로세스</span><b className="mono">{current.process || '미수집'}</b></div><div><span>실행 명령어</span><b className="mono wrap">{current.command || '미수집'}</b></div><div><span>부모 프로세스</span><b className="mono">{current.parent || '미수집'}</b></div><div><span>파일/대상</span><b className="mono wrap">{current.target || '미수집'}</b></div><div><span>IP / 포트</span><b className="mono">{current.ip ? `${current.ip}${current.port ? `:${current.port}` : ''}` : '미수집'}</b></div></div><button className="text-button raw-toggle" onClick={() => setShowRaw(!showRaw)}>{showRaw ? '원본 JSON 닫기 ↑' : '원본 JSON 로그 보기 ↗'}</button>{showRaw && <pre className="raw-log">{current.rawEvent ? JSON.stringify(current.rawEvent, null, 2) : '원본 로그가 제공되지 않았습니다.'}</pre>}</> : <Empty>선택할 이벤트가 없습니다.</Empty>}
        <button className="text-button response-link" onClick={onResponse}>대응 및 조치 관리 →</button>
      </Panel>
    </div>
    <Panel title="AI 대응 가이드" subtitle="권장 확인 항목 · 실제 서버 조치는 수행하지 않습니다" className="guide-panel">{incident.guide.length ? <ol>{incident.guide.map((x, i) => <li key={i}>{x}</li>)}</ol> : <Empty>제공된 대응 가이드가 없습니다.</Empty>}</Panel>
  </>;
}

function ResponsePage({ incidents, selected, onSelect, onUpdate, saving, saveError }: { incidents: Incident[]; selected: Incident | null; onSelect: (id: string) => void; onUpdate: (changes: Partial<Pick<Incident, 'status' | 'checklist' | 'memo'>>) => void; saving: boolean; saveError: string | null }) {
  const [memo, setMemo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  useEffect(() => { setMemo(selected?.memo || ''); }, [selected?.id, selected?.memo]);
  const visible = incidents.filter(x => statusFilter === 'all' || x.status === statusFilter).sort((a, b) => severities.indexOf(a.severity) - severities.indexOf(b.severity));
  return <>
    <div className="page-heading"><h1>대응 및 조치 관리</h1><p>사고 상태, 담당자 확인, 대응 체크리스트와 이력</p></div>
    <div className="metric-grid">{statuses.map((x, i) => <Metric key={x} title={statusLabels[x]} value={String(incidents.filter(v => v.status === x).length).padStart(2, '0')} unit="건" caption="등록된 사고 기준" tone={['red', 'amber', 'green', 'cyan'][i]} />)}</div>
    <div className="response-grid">
      <Panel title="사고 목록" subtitle="위험도가 높은 사건을 먼저 표시합니다" action={<select aria-label="처리 상태 필터" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">전체 {incidents.length}</option>{statuses.map(x => <option key={x} value={x}>{statusLabels[x]}</option>)}</select>} className="response-list">
        {visible.length ? <div className="incident-list">{visible.map(x => <button key={x.id} className={`incident-item ${x.id === selected?.id ? 'selected' : ''} ${severityTone(x.severity)}`} onClick={() => onSelect(x.id)}><span className="incident-id mono">{x.id}<b className={`text-${severityTone(x.severity)}`}>{severityLabels[x.severity]}</b></span><strong>{x.title}</strong><small>{x.server} · {statusLabels[x.status]}</small></button>)}</div> : <Empty>조건에 맞는 사고가 없습니다.</Empty>}
      </Panel>
      <Panel title={selected ? `${selected.id} · ${selected.title}` : '선택한 사건의 대응'} subtitle={selected ? `${selected.server} · 최초 관찰 ${dateTime(selected.firstSeenAt)}` : '목록에서 사건을 선택하세요'} action={selected && <div className="heading-badges"><SourceBadge source={selected.source} /><Badge tone={severityTone(selected.severity)}>{severityLabels[selected.severity]}</Badge></div>} className="response-detail">
        {saveError && <div className="inline-error" role="alert">{saveError}</div>}
        {selected ? <><div className="response-section"><h3>처리 상태</h3><div className="status-options">{statuses.map(x => <button key={x} disabled={saving} className={selected.status === x ? `active ${statusTone(x)}` : ''} onClick={() => onUpdate({ status: x })}>{statusLabels[x]}</button>)}</div></div><div className="response-section"><div className="section-title"><h3>권장 대응 체크리스트</h3><small>실제 서버 조치는 별도 승인 절차로 진행</small></div>{selected.guide.length ? selected.guide.map((x, i) => <label className="check-row" key={i}><input type="checkbox" checked={selected.checklist[i] || false} disabled={saving} onChange={e => onUpdate({ checklist: selected.checklist.map((v, j) => j === i ? e.target.checked : v) })} /><span>{x}</span><small>{selected.checklist[i] ? '완료' : '대기'}</small></label>) : <Empty>제공된 체크리스트가 없습니다.</Empty>}</div><div className="memo-box"><label htmlFor="admin-memo">관리자 메모</label><textarea id="admin-memo" value={memo} onChange={e => setMemo(e.target.value)} placeholder="확인 내용과 다음 조치를 기록하세요" rows={3} /><button className="primary small" disabled={saving || memo === selected.memo} onClick={() => onUpdate({ memo })}>{saving ? '저장 중…' : '메모 저장'}</button></div></> : <Empty>사고를 선택하면 대응 기록을 작성할 수 있습니다.</Empty>}
      </Panel>
    </div>
    <div className="two-columns activity-row"><Panel title="선택한 사건의 처리 이력" subtitle="담당자가 기록한 상태·체크리스트·메모 변경">{selected?.activity.length ? <div className="activity-list">{selected.activity.map((x, i) => <div key={`${x.at}-${i}`}><span className="mono">{dateTime(x.at)}</span><strong>{x.text}</strong></div>)}</div> : <Empty>아직 처리 이력이 없습니다.</Empty>}</Panel><Panel title="다음 단계" subtitle="조사를 마친 뒤 대시보드로 돌아갑니다"><p className="next-copy">현재 화면은 상태와 확인 기록만 저장합니다. 서버 격리, IP 차단, 프로세스 종료는 실행하지 않습니다.</p><button className="secondary" onClick={() => go('dashboard')}>대시보드로 돌아가기 →</button></Panel></div>
  </>;
}

function App() {
  const [locationState, setLocationState] = useState(route);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => { const handler = () => setLocationState(route()); addEventListener('hashchange', handler); return () => removeEventListener('hashchange', handler); }, []);
  const refresh = useCallback(async () => {
    try {
      const [nextOverview, nextIncidents] = await Promise.all([dataClient.overview(), dataClient.incidents(), dataClient.events()]);
      setOverview(nextOverview); setIncidents(nextIncidents); setError(null); setLastSuccess(new Date().toISOString());
    } catch (e) { setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (locationState.page === 'threat-map') return; void refresh(); const timer = setInterval(() => { void refresh(); }, 4000); return () => clearInterval(timer); }, [refresh, locationState.page]);
  useEffect(() => {
    if (locationState.page === 'dashboard' || locationState.page === 'threat-map') return;
    const id = locationState.id || incidents[0]?.id;
    if (!id) return;
    let active = true;
    dataClient.incident(id).then(x => { if (active) { setSelected(x); setDetailError(null); } }).catch(e => { if (active) { setSelected(null); setDetailError(e instanceof Error ? e.message : '사고 상세를 불러오지 못했습니다.'); } });
    return () => { active = false; };
  }, [locationState.page, locationState.id, incidents]);
  const currentId = locationState.id || incidents[0]?.id;
  const displayed = useMemo(() => selected?.id === currentId ? selected : null, [selected, currentId]);
  async function update(changes: Partial<Pick<Incident, 'status' | 'checklist' | 'memo'>>) {
    if (!displayed || saving) return;
    setSaving(true); setSaveError(null);
    try { const next = await dataClient.updateIncident(displayed.id, changes); setSelected(next); await refresh(); }
    catch (e) { setSaveError(e instanceof Error ? e.message : '변경을 저장하지 못했습니다.'); }
    finally { setSaving(false); }
  }
  async function analyze() {
    if (!displayed || analyzing) return;
    setAnalyzing(true); setAnalysisError(null);
    try { const result: Analysis = await dataClient.analyze(displayed.id); setSelected({ ...displayed, analysis: result }); }
    catch (e) { setAnalysisError(e instanceof Error ? e.message : 'AI 분석에 실패했습니다.'); }
    finally { setAnalyzing(false); }
  }
  const collector = overview?.collectorStatus;
  const pageContent = locationState.page === 'threat-map'
    ? <Suspense fallback={<Empty>3D 위협 지도를 불러오는 중입니다…</Empty>}><ThreatMapPage /></Suspense>
    : loading && !overview ? <Empty>보안 현황을 불러오는 중입니다…</Empty>
    : locationState.page === 'dashboard' ? overview
      ? <Dashboard overview={overview} incidents={incidents} search={search} onSelect={id => go('analysis', id)} />
      : <Empty>표시할 대시보드 데이터가 없습니다.</Empty>
    : detailError ? <div className="error-banner" role="alert">{detailError}<button onClick={() => void refresh()}>다시 시도</button></div>
    : !displayed ? <Empty>{incidents.length ? '사고 상세를 불러오는 중입니다…' : '표시할 사고가 없습니다.'}</Empty>
    : locationState.page === 'analysis'
      ? <AnalysisPage incident={displayed} onResponse={() => go('response', displayed.id)} onAnalyze={() => void analyze()} analyzing={analyzing} analysisError={analysisError} />
      : <ResponsePage incidents={incidents.filter(x => !search || `${x.id} ${x.title} ${x.server}`.toLowerCase().includes(search.toLowerCase()))} selected={displayed} onSelect={id => go('response', id)} onUpdate={changes => void update(changes)} saving={saving} saveError={saveError} />;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-tile">S</span><strong>Server Watch</strong></div>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="주요 화면">
        <button className={locationState.page === 'dashboard' ? 'active' : ''} onClick={() => go('dashboard')}><i />개요</button>
        <button className={locationState.page === 'threat-map' ? 'active' : ''} onClick={() => go('threat-map')}><i />실시간 위협 지도</button>
        <button className={locationState.page === 'analysis' ? 'active' : ''} onClick={() => go('analysis', currentId)}><i />AI 사고 분석</button>
        <button className={locationState.page === 'response' ? 'active' : ''} onClick={() => go('response', currentId)}><i />대응 및 조치</button>
      </nav>
      <div className="sidebar-bottom"><div className="nav-label">DATA SOURCE</div><div className="source-line"><i className={collector === 'healthy' ? 'on' : collector === 'degraded' ? 'warn' : ''} />{dataMode === 'demo' ? '시연용 데이터' : 'FastAPI · 실시간 조회'}</div><small>{dataMode === 'demo' ? 'DEMO DATA · 실제 수집 아님' : overview?.collectorLabel || '수집기 상태 확인 필요'}</small></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span className="project">OO스토어&nbsp; / &nbsp;{dataMode}</span>{locationState.page !== 'threat-map' && <input aria-label="사고 검색" value={search} onChange={e => setSearch(e.target.value)} placeholder="서버, 사건 제목, 사건 ID 검색" />}<div className="top-spacer" />{locationState.page !== 'threat-map' && <Badge tone={collector === 'healthy' ? 'green' : collector === 'degraded' ? 'amber' : 'muted'}>{collector === 'healthy' ? '● 수집 정상 보고' : collector === 'degraded' ? '● 수집 이상 보고' : '● 수집 상태 미확인'}</Badge>}{dataMode === 'demo' && <Badge tone="amber">DEMO</Badge>}<span className="avatar">정</span></header>
      <main>{locationState.page !== 'threat-map' && <><div className="connection-row"><span>{error ? <span className="text-amber">연결 오류 · 기존 데이터 유지</span> : dataMode === 'demo' ? 'Demo 데이터 연결' : 'API 연결됨'}</span><span>마지막 성공 조회 {lastSuccess ? dateTime(lastSuccess) : '없음'} · 4초 간격</span></div>{error && <div className="error-banner" role="alert">{error}<button onClick={() => void refresh()}>다시 시도</button></div>}</>}{pageContent}{locationState.page === 'analysis' && <div className="page-footer"><button className="secondary" onClick={() => go('dashboard')}>← 대시보드</button><button className="primary" onClick={() => go('response', displayed?.id)}>대응 상태 기록 →</button></div>}</main>
    </div>
  </div>;
}

const container = document.getElementById('root') as (HTMLElement & { securityStoryRoot?: Root });
const root = container.securityStoryRoot ?? createRoot(container);
container.securityStoryRoot = root;
root.render(<App />);
