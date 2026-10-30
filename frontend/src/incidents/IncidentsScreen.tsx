import { useEffect, useMemo, useRef, useState } from 'react';
import { describeError } from '../api';
import { useResource } from '../screens/useResource';
import { incidentApi, type Incident, type IncidentStatus, type Severity } from './api';
import { IncidentTrend } from './IncidentTrend';
import './incidents.css';

const statusLabel: Record<IncidentStatus, string> = {
  unconfirmed: '미확인', investigating: '조사 중', resolved: '조치 완료', benign: '정상 작업 / 오탐', unknown: '상태 미제공',
};
const severityLabel: Record<Severity, string> = {
  CRITICAL: '치명', HIGH: '높음', MEDIUM: '중간', LOW: '낮음', UNKNOWN: '미제공',
};
const when = (value: string | null) => value && !Number.isNaN(Date.parse(value))
  ? new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '시각 미제공';
const initialId = () => new URLSearchParams(location.search).get('incident') || '';
type Tab = 'overview' | 'events' | 'response';

function IncidentPanel({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [incident, setIncident] = useState<Incident>();
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedEvent, setSelectedEvent] = useState(0);
  const [status, setStatus] = useState<IncidentStatus>('unconfirmed');
  const [checklist, setChecklist] = useState<Incident['checklist']>([]);
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    closeRef.current?.focus();
    setTab('overview'); setSelectedEvent(0); setIncident(undefined); setError(''); setMessage('');
    const controller = new AbortController();
    incidentApi.detail(id, controller.signal).then((item) => {
      if (controller.signal.aborted) return;
      setIncident(item); setStatus(item.status); setChecklist(item.checklist); setMemo(item.memo);
    }).catch((cause) => { if (!controller.signal.aborted) setError(describeError(cause)); });
    return () => controller.abort();
  }, [id]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    addEventListener('keydown', escape);
    return () => removeEventListener('keydown', escape);
  }, [onClose]);
  async function analyze() {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const item = await incidentApi.analyze(id);
      setIncident(item);
      setMessage(item.analysis?.kind === 'demo' ? 'Demo 설명을 다시 불러왔습니다. 실제 AI 분석은 아닙니다.' : '분석 결과를 불러왔습니다.');
    } catch (cause) { setError(describeError(cause)); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!incident || status === 'unknown' || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const item = await incidentApi.update(id, { status, checklist, memo });
      setIncident(item); setStatus(item.status); setChecklist(item.checklist); setMemo(item.memo);
      setMessage('대응 기록이 저장됐습니다.'); onSaved();
    } catch (cause) { setError(describeError(cause)); }
    finally { setBusy(false); }
  }
  const event = incident?.events[selectedEvent];
  return <aside className="incident-panel" aria-labelledby="incident-panel-title">
    <div className="incident-panel-top"><span>사건 상세</span><button ref={closeRef} onClick={onClose} aria-label="사건 상세 닫기">×</button></div>
    {error && <p className="incident-error" role="alert">{error}</p>}
    {!incident ? <p className="incident-loading" role="status">사건을 불러오는 중…</p> : <>
      <div className="incident-panel-head">
        <div className="incident-tags"><span className={`incident-severity ${incident.severity.toLowerCase()}`}>{severityLabel[incident.severity]}</span><span className="incident-source">{incident.source === 'demo' ? 'DEMO · 시연 자료' : incident.source === 'live' ? 'LIVE' : '출처 미제공'}</span></div>
        <h2 id="incident-panel-title">{incident.title}</h2>
        <p>{incident.id} · {incident.server || '서버 미제공'} · {when(incident.firstSeenAt)}</p>
      </div>
      <div className="incident-tabs" role="tablist" aria-label="사건 상세 탭">
        {([['overview', '분석'], ['events', `관찰 이벤트 ${incident.eventCount}`], ['response', '대응 기록']] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}
      </div>
      <div className="incident-panel-body" role="tabpanel">
        {tab === 'overview' && <>
          <section><div className="incident-section-head"><h3>한눈에 보기</h3>{incident.source !== 'demo' && <button disabled={busy} onClick={analyze}>{busy ? '분석 중…' : 'AI 분석 요청'}</button>}</div>
            {incident.analysis ? <div className="incident-analysis"><span>{incident.analysis.kind === 'demo' ? 'Demo 설명 · 실제 AI 분석 아님' : 'AI 분석 · 서버 응답'}</span><p className="incident-analysis-lead">{incident.analysis.behavior || '행동 설명 미제공'}</p><div className="incident-risk"><b>확인이 필요한 이유</b><p>{incident.analysis.risk || '위험 설명 미제공'}</p></div><p className="incident-uncertainty">확인되지 않은 점 · {incident.analysis.uncertainty || '한계 미제공'}</p><details><summary>예상 영향과 판단 근거</summary><h4>예상 영향</h4><p>{incident.analysis.impact || '설명 미제공'}</p><h4>판단 근거</h4><p>{incident.analysis.evidence || '근거 미제공'}</p></details></div> : <p className="incident-muted">분석 결과가 없습니다. 서버에 분석을 요청하세요.</p>}
          </section>
          <div className="incident-quick-links"><button onClick={() => setTab('events')}>관찰 이벤트 {incident.eventCount}건 보기 →</button><button className="primary" onClick={() => setTab('response')}>대응 기록 →</button></div>
        </>}
        {tab === 'events' && <section><h3>사건 타임라인 <small>서버가 연결한 이벤트</small></h3>
          {incident.events.length ? <><div className="incident-timeline">{incident.events.map((item, index) => <button key={item.id} className={selectedEvent === index ? 'active' : ''} onClick={() => setSelectedEvent(index)}><time>{when(item.occurredAt)}</time><span>{item.title}</span></button>)}</div>
            {event && <div className="incident-event-facts"><h4>선택 이벤트 · 수집된 사실</h4><dl>{([['유형', event.type], ['실행 프로그램', event.process], ['명령어', event.command], ['부모 프로세스', event.parent], ['파일 경로', event.filePath], ['네트워크', event.network]] as const).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><details><summary>원본 JSON 로그 보기</summary><pre>{event.raw === null ? '원본 로그 미제공' : JSON.stringify(event.raw, null, 2)}</pre></details></div>}
          </> : <p className="incident-muted">연결된 이벤트가 없습니다.</p>}</section>}
        {tab === 'response' && <><section><h3>처리 상태</h3><div className="incident-status-options">{(['unconfirmed', 'investigating', 'resolved', 'benign'] as const).map((value) => <button key={value} className={status === value ? 'active' : ''} aria-pressed={status === value} onClick={() => setStatus(value)}>{statusLabel[value]}</button>)}</div></section>
          <section><h3>권장 확인 항목</h3>{checklist.length ? <div className="incident-checklist">{checklist.map((step, index) => <label key={step.id}><input type="checkbox" checked={step.done} onChange={(e) => setChecklist((current) => current.map((item, i) => i === index ? { ...item, done: e.target.checked } : item))} /><span>{step.label}</span></label>)}</div> : <p className="incident-muted">서버에서 제공한 확인 항목이 없습니다.</p>}</section>
          <section><label className="incident-memo-label" htmlFor="incident-memo">관리자 메모</label><textarea id="incident-memo" maxLength={5000} value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="확인한 사실과 다음 담당자를 기록하세요." /></section>
          <button className="primary incident-save" disabled={busy || status === 'unknown'} onClick={save}>{busy ? '저장 중…' : '대응 상태 저장'}</button>
          <section><h3>처리 이력</h3>{incident.history.length ? <ul className="incident-history">{incident.history.map((entry, index) => <li key={`${entry.at}-${index}`}>{when(entry.at)} · {entry.text}</li>)}</ul> : <p className="incident-muted">기록된 변경이 없습니다.</p>}</section>
          <p className="incident-muted">이 화면은 서버 격리·차단·프로세스 종료를 실행하지 않습니다.</p>
        </>}
        {message && <p className="incident-success" role="status">{message}</p>}
      </div>
    </>}
  </aside>;
}

export default function IncidentsScreen({ refresh, onRefresh }: { refresh: number; onRefresh: () => void }) {
  const [revision, setRevision] = useState(0);
  const resource = useResource(incidentApi.list, refresh + revision);
  const [selectedId, setSelectedId] = useState(initialId);
  const [server, setServer] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState('6');
  useEffect(() => {
    const pop = () => setSelectedId(initialId());
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);
  const items = resource.data || [];
  const servers = useMemo(() => [...new Set(items.map((item) => item.server).filter(Boolean))] as string[], [items]);
  const shown = items.filter((item) => {
    if (server && item.server !== server) return false;
    if (severity && item.severity !== severity) return false;
    if (status && item.status !== status) return false;
    if (period !== 'all') {
      const time = item.firstSeenAt ? Date.parse(item.firstSeenAt) : NaN;
      if (!Number.isFinite(time) || Date.now() - time > Number(period) * 3_600_000) return false;
    }
    return true;
  });
  const select = (id: string) => {
    const url = new URL(location.href);
    if (id) url.searchParams.set('incident', id); else url.searchParams.delete('incident');
    history.pushState(null, '', url);
    setSelectedId(id);
  };
  const activeFilters = [server, severity, status].filter(Boolean).length;
  const demo = items.some((item) => item.source === 'demo');
  return <div className={`incident-layout ${selectedId ? 'with-panel' : ''}`}>
    <div className="incident-content">
      <section className="incident-overview-card" aria-label="사건 현황">
        <div className="incident-overview-head">
          <div><h2>사건 흐름 {demo && <span className="incident-source">DEMO</span>}</h2><p>최초 발생 시각 기준 · {period === '6' ? '30분' : period === '24' ? '2시간' : period === '168' ? '14시간' : '12구간'} 단위</p></div>
          <div className="incident-overview-actions"><select aria-label="조회 기간" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="6">최근 6시간</option><option value="24">최근 24시간</option><option value="168">최근 7일</option><option value="all">전체 기간</option></select><button onClick={onRefresh} aria-label="사건 새로고침" title="사건 새로고침">↻</button></div>
        </div>
        <div className="incident-metrics"><div><span>사건</span><strong>{shown.length}</strong></div><div><span>높음 이상</span><strong>{shown.filter((item) => ['HIGH', 'CRITICAL'].includes(item.severity)).length}</strong></div><div><span>대응 필요</span><strong>{shown.filter((item) => ['unconfirmed', 'investigating'].includes(item.status)).length}</strong></div></div>
        {resource.loading && !resource.data ? <p className="incident-empty" role="status">사건을 불러오는 중…</p> : <IncidentTrend items={shown} period={period} />}
        <p className="incident-last-sync">{resource.error ? '조회 실패' : resource.successAt ? `마지막 조회 ${when(resource.successAt)}` : '조회 대기'} · 2초마다 갱신{demo ? ' · Demo 자료, 실제 수집·AI 판단 아님' : ''}</p>
      </section>
      {resource.error && <div className="incident-error" role="alert">사건 API 조회에 실패했습니다. {resource.error} {resource.data && '마지막 성공 목록을 표시합니다.'}</div>}
      <div className="incident-list-card">
        <div className="incident-list-head"><div><h3>사건 목록 <small>{shown.length}건</small></h3><p>사건을 선택하면 오른쪽에서 분석과 대응을 확인합니다.</p></div><details className="incident-filter-details"><summary>필터{activeFilters ? ` ${activeFilters}` : ''}</summary><div className="incident-filters"><select aria-label="서버 필터" value={server} onChange={(event) => setServer(event.target.value)}><option value="">전체 서버</option>{servers.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="위험도 필터" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="">전체 위험도</option>{(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const).map((item) => <option key={item} value={item}>{severityLabel[item]}</option>)}</select><select aria-label="처리 상태 필터" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">전체 상태</option>{(Object.keys(statusLabel) as IncidentStatus[]).map((item) => <option key={item} value={item}>{statusLabel[item]}</option>)}</select></div></details></div>
        {resource.loading && !resource.data ? <p className="incident-empty" role="status">사건 목록을 불러오는 중…</p> : !shown.length ? <p className="incident-empty">{resource.error ? '사건 API가 준비되지 않았거나 응답하지 않습니다.' : '조건에 맞는 사건이 없습니다.'}</p> : <div className="incident-table-wrap"><table className="incident-table"><thead><tr><th>위험도</th><th>사건 / 서버 · 시각</th><th>상태</th></tr></thead><tbody>{shown.map((item) => <tr key={item.id} className={selectedId === item.id ? 'selected' : ''}><td><span className={`incident-severity ${item.severity.toLowerCase()}`}>{severityLabel[item.severity]}</span></td><td><button className="incident-row-button" onClick={() => select(item.id)} aria-label={`${item.title} 상세 보기`}><strong>{item.title}</strong><small>{item.server || '서버 미제공'} · {when(item.firstSeenAt)} · 이벤트 {item.eventCount}건</small></button></td><td><span className="incident-status">{statusLabel[item.status]}</span></td></tr>)}</tbody></table></div>}
      </div>
    </div>
    {selectedId && <IncidentPanel id={selectedId} onClose={() => select('')} onSaved={() => setRevision((value) => value + 1)} />}
  </div>;
}
