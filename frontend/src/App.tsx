import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent } from 'react';
import { api } from './api';
import { MonitoringSetup } from './MonitoringSetup';
import { Detail } from './events/Detail';
import { incidentApi } from './incidents/api';
import './incidents/incidents.css';
import { Filters, initialSelection } from './events/Filters';
import { useDashboard } from './events/useDashboard';
import { routes, useNavigation } from './navigation';
import { Scope } from './screens/Common';
import { useResource } from './screens/useResource';
import {
  dateTime,
  safeSnapshotFilters,
  selectionFilters,
  sourceLabel,
  type Analysis,
  type PeriodFilters,
  type Selection,
} from './types';
const AnalysisPanel = lazy(() => import('./analysis/AnalysisPanel'));
const IncidentsScreen = lazy(() => import('./incidents/IncidentsScreen'));
const Overview = lazy(() => import('./screens/LiveScreens').then((m) => ({ default: m.Overview })));
const Telemetry = lazy(() =>
  import('./screens/LiveScreens').then((m) => ({ default: m.Telemetry })),
);
const ServersScreen = lazy(() =>
  import('./screens/LiveScreens').then((m) => ({ default: m.ServersScreen })),
);
const ReadinessScreen = lazy(() =>
  import('./screens/ReadinessScreen').then((m) => ({ default: m.ReadinessScreen })),
);
const ReplayScreen = lazy(() =>
  import('./screens/ReplayScreen').then((m) => ({ default: m.ReplayScreen })),
);
const localTime = (value: string) => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 23);
};

const scopeStorageKey = 'litesoc-monitoring-scope';
function savedScope(): Pick<Selection, 'instanceId' | 'source'> | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(scopeStorageKey) || 'null');
    if (value && (value.source === 'live' || value.source === 'sample') &&
      (value.instanceId === undefined || typeof value.instanceId === 'string')) {
      return { instanceId: value.instanceId, source: value.source };
    }
  } catch { /* Storage may be unavailable; setup still works for this visit. */ }
}

export default function App() {
  const { path, navigate } = useNavigation();
  const route = routes.find((route) => route.path === path);
  const [scope] = useState(savedScope);
  const [configured, setConfigured] = useState(!!scope);
  const [setupOpen, setSetupOpen] = useState(!scope);
  const [selection, setSelection] = useState<Selection>(() => ({ ...initialSelection, ...scope })),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false);
  const [detailId, setDetailId] = useState(
    () => new URLSearchParams(location.search).get('event') || '',
  );
  const [briefing, setBriefing] = useState<Analysis>();
  const [analysisOpen, setAnalysisOpen] = useState(
    () =>
      new URLSearchParams(location.search).has('snapshot') ||
      new URLSearchParams(location.search).get('analysis') === 'open',
  );
  const [analysisContext, setAnalysisContext] = useState<PeriodFilters>();
  const [replayFilters, setReplayFilters] = useState<PeriodFilters>();
  const analysisToggleRef = useRef<HTMLButtonElement>(null);
  const analysisCloseRef = useRef<HTMLButtonElement>(null);
  const instances = useResource(api.instances, refresh, path !== '/incidents');
  const recentIncidents = useResource(incidentApi.list, refresh, path === '/overview');
  const live = useDashboard(
    selection,
    page,
    refresh,
    configured && !setupOpen && ['/overview', '/telemetry', '/servers'].includes(path),
  );
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const syncDetail = () => setDetailId(new URLSearchParams(location.search).get('event') || '');
    addEventListener('popstate', syncDetail);
    return () => removeEventListener('popstate', syncDetail);
  }, []);
  useEffect(() => {
    if (!configured) return;
    try {
      sessionStorage.setItem(scopeStorageKey, JSON.stringify({ instanceId: selection.instanceId, source: selection.source }));
    } catch { /* Keep the in-memory selection when storage is unavailable. */ }
  }, [configured, selection.instanceId, selection.source]);
  const stale = !instances.successAt || now - Date.parse(instances.successAt) > 10000;
  function choose(next: Selection) {
    if (busy) return;
    setSelection(next);
    setPage(1);
  }
  function go(event: MouseEvent<HTMLAnchorElement>, target: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    if (!busy) { setDetailId(''); navigate(target); }
  }
  function inspect(id: string) {
    if (busy) return;
    const url = new URL(location.href);
    url.searchParams.set('event', id);
    history.pushState(null, '', url);
    setDetailId(id);
  }
  function closeDetail() {
    setDetailId('');
    const url = new URL(location.href);
    url.searchParams.delete('event');
    history.replaceState(null, '', url);
  }
  function analyze(filters?: PeriodFilters) {
    if (!busy) setAnalysisContext(filters || selectionFilters(selection));
    setAnalysisOpen(true);
  }
  function closeAnalysis() {
    setAnalysisOpen(false);
    analysisToggleRef.current?.focus();
  }
  useEffect(() => {
    if (!analysisOpen) return;
    analysisCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setAnalysisOpen(false);
        analysisToggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [analysisOpen]);
  function inspectReplay(filters: PeriodFilters) {
    if (busy) return;
    setDetailId('');
    choose({
      ...filters,
      period: 'custom',
      from: localTime(filters.from),
      to: localTime(filters.to),
    });
    navigate('/telemetry');
  }
  const screenProps = {
    selection,
    refresh,
    live,
    onDetail: inspect,
    selectedDetailId: detailId,
    onPage: setPage,
    onSelection: choose,
  };
  if (setupOpen) return (
    <MonitoringSetup
      selection={selection}
      instances={instances.data?.items || []}
      loading={instances.loading}
      error={instances.error}
      onRetry={() => setRefresh((value) => value + 1)}
      onCancel={configured ? () => setSetupOpen(false) : undefined}
      onStart={(instanceId, source) => {
        if (configured && (instanceId !== selection.instanceId || source !== selection.source)) {
          const url = new URL(location.href);
          for (const name of ['replay', 'snapshot', 'event', 'analysis']) url.searchParams.delete(name);
          history.replaceState(null, '', url);
          setDetailId('');
          setReplayFilters(undefined);
        }
        choose({ ...initialSelection, instanceId, source });
        setConfigured(true);
        setSetupOpen(false);
        setBriefing(undefined);
        setAnalysisContext(undefined);
        setAnalysisOpen(false);
      }}
    />
  );
  return (
    <div className={`app-shell ${analysisOpen ? 'analysis-is-open' : ''} ${detailId ? 'has-event-detail' : ''}`}>
      <aside className="sidebar">
        <a className="brand" href="/overview" onClick={(event) => go(event, '/overview')}>
          <span className="brand-icon">S</span>
          <b>Server Watch</b>
        </a>
        <p className="nav-caption">서버 보안 관찰</p>
        {routes.map((item) => (
          <a
            className={`nav-link ${path === item.path ? 'active' : ''}`}
            href={item.path}
            key={item.path}
            aria-current={path === item.path ? 'page' : undefined}
            aria-disabled={busy}
            onClick={(event) => go(event, item.path)}
          >
            <i />
            {item.label}
          </a>
        ))}
      </aside>
      <div className="workspace">
        {path !== '/incidents' && <header className="topbar">
          <div>
            <span className="workspace-badge">L</span>
            <div className="monitoring-scope">
              <b>{selection.instanceId || '전체 인스턴스'}</b>
              <small>{sourceLabel(selection.source)}</small>
            </div>
            <button disabled={busy} onClick={() => setSetupOpen(true)}>모니터링 설정</button>
          </div>
          <div>
            <span className={`connection ${instances.error || stale ? 'delayed' : ''}`}>
              <i className="dot" />
              {instances.error ? '인스턴스 조회 오류' : stale ? '인스턴스 응답 대기' : '인스턴스 API 응답'}
            </span>
            <span className="poll-label">2s 폴링</span>
            <button
              ref={analysisToggleRef}
              className={`analyst-link ${analysisOpen ? 'active' : ''}`}
              aria-expanded={analysisOpen}
              aria-controls="ai-sidebar"
              disabled={
                !analysisOpen && !busy && (
                (path === '/replay' && !replayFilters) ||
                (path === '/readiness' && !selection.source))
              }
              onClick={() => analysisOpen ? closeAnalysis() :
                analyze(
                  path === '/replay'
                    ? replayFilters
                    : ['/overview', '/telemetry', '/servers'].includes(path)
                      ? live.data?.filters
                      : undefined,
                )
              }
            >
              <b>AI</b> 관찰 요약 분석
            </button>
          </div>
        </header>}
        <main className={`screen-${path.slice(1)}`}>
          <div className="page-heading">
            <div>
              <h1>{route?.label || '화면을 찾을 수 없습니다'}</h1>
            </div>
            {path !== '/incidents' && <div className="heading-actions">
              {path !== '/replay' && (
                <button
                  disabled={
                    busy || (live.loading && ['/overview', '/telemetry', '/servers'].includes(path))
                  }
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  ↻ 새로고침
                </button>
              )}
              <button disabled title="후속 지원 예정">
                공유 · 예정
              </button>
            </div>}
          </div>
          {import.meta.env.VITE_DATA_LABEL && path !== '/incidents' && (
            <div className="mock-label">
              {import.meta.env.VITE_DATA_LABEL} · 실제 수집·통합·실제 모델 분석 검증이 아닙니다.
            </div>
          )}
          {route && (
            <>
              {path === '/overview' && <section className="incident-preview"><div className="incident-preview-head"><div><span>사건별 확인</span><h2>최근 보안 사고</h2></div><a href="/incidents" onClick={(event) => go(event, '/incidents')}>전체 사건 보기 →</a></div>{recentIncidents.error ? <p>사건 API 미연결 · 사건 목록은 백엔드 계약 적용 후 표시됩니다.</p> : recentIncidents.loading && !recentIncidents.data ? <p>사건 조회 중…</p> : recentIncidents.data?.length ? <div className="incident-preview-items">{recentIncidents.data.slice(0, 3).map((item) => <a key={item.id} href={`/incidents?incident=${encodeURIComponent(item.id)}`} onClick={(event) => go(event, `/incidents?incident=${encodeURIComponent(item.id)}`)}><strong>{item.title}</strong><span>{item.server || '서버 미제공'} · {item.source === 'demo' ? 'DEMO · ' : ''}{({ unconfirmed: '미확인', investigating: '조사 중', resolved: '조치 완료', benign: '정상 작업 / 오탐', unknown: '상태 미제공' } as const)[item.status]}</span></a>)}</div> : <p>등록된 사건이 없습니다.</p>}</section>}
              {briefing && path !== '/incidents' && (
                <div className="ai-briefing">
                  <span className="ai-tag">AI 관찰</span>
                  <div>
                    <p>
                      고정 스냅샷 {briefing.snapshotId.slice(0, 8)} · {briefing.model} ·{' '}
                      {dateTime(briefing.createdAt)}
                    </p>
                    <strong>
                      {briefing.result.facts[0] || '고정 스냅샷의 분석 결과를 확인하세요.'}
                    </strong>
                    {briefing.model.includes('mock') && <span>mock 응답 · 실제 모델 분석 아님</span>}
                  </div>
                </div>
              )}
              {path !== '/readiness' && path !== '/incidents' && <Filters
                timePicker={path === '/telemetry'}
                range={live.data?.filters}
                selection={selection}
                disabled={busy}
                onChange={choose}
              />}
              <Suspense
                fallback={
                  <div className="panel empty" role="status">
                    화면 준비 중…
                  </div>
                }
              >
                {path === '/overview' && <Overview {...screenProps} />}
                {path === '/incidents' && <IncidentsScreen refresh={refresh} onRefresh={() => setRefresh((value) => value + 1)} />}
                {path === '/telemetry' && <Telemetry {...screenProps} />}
                {path === '/servers' && <ServersScreen {...screenProps} />}
                {path === '/readiness' && (
                  <ReadinessScreen
                    selection={selection}
                    refresh={refresh}
                    onSelectInstance={(id) => choose({ ...selection, instanceId: id })}
                  />
                )}
                {path === '/replay' && (
                  <ReplayScreen
                    selection={selection}
                    onDetail={inspect}
                    onTelemetry={inspectReplay}
                    onReplay={setReplayFilters}
                  />
                )}
              </Suspense>
            </>
          )}
          {!route && (
            <a className="button" href="/overview" onClick={(event) => go(event, '/overview')}>
              보안 개요로 이동
            </a>
          )}
          {path !== '/incidents' && <footer>Server Watch · 서버 보안 관찰과 사고 대응 기록</footer>}
        </main>
      </div>
      <aside
        id="ai-sidebar"
        className={`ai-sidebar ${analysisOpen ? 'is-open' : ''}`}
        aria-label="AI 분석"
        aria-hidden={!analysisOpen}
        inert={!analysisOpen}
      >
        <div className="ai-sidebar-heading">
          <div><span className="ai-tag">AI</span><h2>보안 분석</h2></div>
          <button ref={analysisCloseRef} aria-label="AI 사이드바 닫기" onClick={closeAnalysis}>×</button>
        </div>
        <div className="ai-sidebar-body">
          {analysisContext && <Scope filters={analysisContext} />}
          <Suspense fallback={<p role="status">분석 화면 준비 중…</p>}>
            <AnalysisPanel
              selection={selection}
              filters={analysisContext ? safeSnapshotFilters(analysisContext) : undefined}
              onBusy={setBusy}
              onResult={setBriefing}
            />
          </Suspense>
        </div>
      </aside>
      {detailId && <><button type="button" className="event-drawer-backdrop" aria-label="상세 닫기" onClick={closeDetail} /><Detail id={detailId} onClose={closeDetail} /></>}
    </div>
  );
}
