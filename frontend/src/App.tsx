import { serverName } from './types';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { api } from './api';
import { MonitoringSetup } from './MonitoringSetup';
import { Detail } from './events/Detail';
import { Filters, initialSelection } from './events/Filters';
import { useDashboard } from './events/useDashboard';
import { routes, useNavigation } from './navigation';
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
const SampleAnalysisPanel = lazy(() => import('./analysis/SampleAnalysisPanel'));
const CollectionStatus = lazy(() => import('./screens/CollectionStatus').then((m) => ({ default: m.CollectionStatus })));
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
  const params = new URLSearchParams(location.search);
  const source = params.get('source');
  if (source === 'live' || source === 'sample') {
    return { source, instanceId: params.get('instanceId') || undefined };
  }
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
  const [selection, setSelection] = useState<Selection>(() => ({ ...initialSelection, ...scope, period: scope?.source === 'sample' ? '120' : initialSelection.period })),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false);
  const [detailId, setDetailId] = useState(
    path === '/telemetry' ? new URLSearchParams(location.search).get('event') || '' : '',
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
  const instances = useResource(api.instances, refresh);
  const loadReadiness = useCallback(async (signal: AbortSignal) => ({
    source: selection.source || 'live',
    value: await api.readiness(undefined, selection.source || 'live', signal),
  }), [selection.source]);
  const readiness = useResource(loadReadiness, refresh);
  const currentReadiness = readiness.data && readiness.data.source === selection.source ? readiness.data.value : undefined;
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
    if (!configured) return;
    const url = new URL(location.href);
    url.searchParams.set('source', selection.source || 'live');
    if (selection.instanceId) url.searchParams.set('instanceId', selection.instanceId);
    else url.searchParams.delete('instanceId');
    history.replaceState(null, '', url);
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
    if (!busy) navigate(target);
  }
  function inspect(id: string) {
    if (busy) return;
    navigate(`/telemetry?event=${encodeURIComponent(id)}`);
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
    onPage: setPage,
    onSelection: choose,
  };
  if (setupOpen) return (
    <MonitoringSetup
      selection={selection}
      instances={[...new Set([
        ...(currentReadiness?.items.map((item) => item.instanceId) || []),
        ...(instances.data?.items.map((item) => item.instanceId) || []),
      ])]}
      loading={instances.loading || readiness.loading}
      error={[instances.error, readiness.error].filter(Boolean).join(' · ')}
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
        choose({ ...initialSelection, instanceId, source, period: source === 'sample' ? '120' : '60' });
        setConfigured(true);
        setSetupOpen(false);
        setBriefing(undefined);
        setAnalysisContext(undefined);
        setAnalysisOpen(false);
      }}
    />
  );
  return (
    <div className={`app-shell ${analysisOpen ? 'analysis-is-open' : ''}`}>
      <aside className="sidebar">
        <a className="brand" href="/overview" onClick={(event) => go(event, '/overview')}>
          <span className="brand-icon">S</span>
          <b>ServerWatch</b>
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
        <header className="topbar">
          <div>
            <span className="workspace-badge">L</span>
            <div className="monitoring-scope">
              <b>{selection.instanceId ? serverName(selection.instanceId) : '전체 인스턴스'}</b>
              <small>{sourceLabel(selection.source)}</small>
            </div>
            <button disabled={busy} onClick={() => setSetupOpen(true)}>모니터링 설정</button>
          </div>
          <div>
            <span className={`connection ${instances.error || stale ? 'delayed' : ''}`}>
              <i className="dot" />
              {instances.error ? '조회 오류' : stale ? '응답 대기' : '조회 API 응답'}
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
              <b>AI</b> 안전 분석
            </button>
          </div>
        </header>
        <main className={`screen-${path.slice(1)}`}>
          <div className="page-heading">
            <div>
              <h1>{route?.label || '화면을 찾을 수 없습니다'}</h1>
            </div>
            <div className="heading-actions">
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
            </div>
          </div>
          {import.meta.env.VITE_DATA_LABEL && (
            <div className="mock-label">
              {import.meta.env.VITE_DATA_LABEL} · 실제 수집·통합·실제 모델 분석 검증이 아닙니다.
            </div>
          )}
          {route && (
            <>
              {path !== '/readiness' && selection.source === 'live' && <Suspense fallback={<p role="status">수집 상태 화면 준비 중…</p>}><CollectionStatus
                resource={{ ...readiness, data: currentReadiness }}
                instanceId={selection.instanceId}
                onReadiness={() => navigate('/readiness')}
              /></Suspense>}
              {briefing && (
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
              {path !== '/readiness' && <Filters
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
          <footer>ServerWatch · AI 기반 서버 보안 모니터링·분석 플랫폼</footer>
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
          <Suspense fallback={<p role="status">분석 화면 준비 중…</p>}>
            {(analysisContext?.source || selection.source) === 'sample'
              ? analysisOpen && <SampleAnalysisPanel key={path} screen={path} filters={analysisContext || selectionFilters(selection)} />
              : <AnalysisPanel
              selection={selection}
              filters={analysisContext ? safeSnapshotFilters(analysisContext) : undefined}
              onBusy={setBusy}
              onResult={setBriefing}
            />}
          </Suspense>
        </div>
      </aside>
      {detailId && <Detail id={detailId} onClose={closeDetail} />}
    </div>
  );
}
