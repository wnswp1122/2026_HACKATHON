import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent } from 'react';
import { api } from './api';
import { MonitoringSetup } from './MonitoringSetup';
import { Detail } from './events/Detail';
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
  const analysisRef = useRef<HTMLDivElement>(null);
  const instances = useResource(api.instances, refresh);
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
    if (busy) return;
    setAnalysisContext(filters || selectionFilters(selection));
    setAnalysisOpen(true);
    requestAnimationFrame(() =>
      analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }
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
    onAnalyze: analyze,
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
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/overview" onClick={(event) => go(event, '/overview')}>
          <span className="brand-icon">L</span>
          <b>LiteSOC</b>
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
        <div className="sidebar-note">
          <b>Tetragon 센서</b>
          <p>
            센서·정책 상태 <span>준비 점검에서 확인</span>
          </p>
          <p>
            조회 API{' '}
            <span>{instances.error ? '조회 오류' : stale ? '오래됨/대기' : '응답 수신'}</span>
          </p>
          <small>이벤트 수신 ≠ 센서 정상. source live/sample을 구분합니다.</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="workspace-badge">L</span>
            <div className="monitoring-scope">
              <b>{selection.instanceId || '전체 인스턴스'}</b>
              <small>{sourceLabel(selection.source)}</small>
            </div>
            <button disabled={busy} onClick={() => setSetupOpen(true)}>모니터링 설정</button>
            <span className="env-label">MVP</span>
          </div>
          <div>
            <span className={`connection ${instances.error || stale ? 'delayed' : ''}`}>
              <i className="dot" />
              {instances.error ? '조회 오류' : stale ? '응답 대기' : '조회 API 응답'}
            </span>
            <span className="poll-label">2s 폴링</span>
            <button
              className="analyst-link"
              disabled={
                busy ||
                (path === '/replay' && !replayFilters) ||
                (path === '/readiness' && !selection.source)
              }
              onClick={() =>
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
              <p>AI 기반 서버 보안 모니터링·분석 플랫폼</p>
            </div>
            <div className="heading-actions">
              {path !== '/replay' && (
                <button
                  disabled={
                    busy || (live.loading && ['/overview', '/telemetry', '/servers'].includes(path))
                  }
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  ↻ 저장된 최신 데이터 조회
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
              <div className="ai-briefing">
                <span className="ai-tag">AI 관찰</span>
                <div>
                  <p>
                    {briefing
                      ? `고정 스냅샷 ${briefing.snapshotId.slice(0, 8)} · ${briefing.model} · ${dateTime(briefing.createdAt)}`
                      : '기존 안전 집계·이벤트 요약과 고정 캡처만 분석합니다.'}
                  </p>
                  <strong>
                    {briefing
                      ? briefing.result.facts[0] || '고정 스냅샷의 분석 결과를 확인하세요.'
                      : '관찰 순서만으로 공격·로그인·DB 조회·유출·차단 성공을 단정하지 않습니다.'}
                  </strong>
                  {briefing?.model.includes('mock') && <span>mock 응답 · 실제 모델 분석 아님</span>}
                </div>
              </div>
              {path !== '/readiness' && <Filters
                selection={selection}
                disabled={busy}
                onChange={choose}
              />}
              <p className="freshness">
                source={selection.source || 'live + sample 혼합'} ·{' '}
                {path === '/readiness'
                  ? '상태 보고 관찰·수신 시각'
                  : path === '/replay'
                    ? '수신 시각으로 집합 선택 · 발생 시각으로 재생'
                    : '수신 시각 기준 조회'}{' '}
                · 마지막 인스턴스 조회{' '}
                {instances.successAt ? dateTime(instances.successAt) : '없음'} · 최근 이벤트가
                heartbeat를 대신하지 않습니다.
              </p>
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
                    onAnalyze={analyze}
                    onSelectInstance={(id) => choose({ ...selection, instanceId: id })}
                  />
                )}
                {path === '/replay' && (
                  <ReplayScreen
                    selection={selection}
                    onDetail={inspect}
                    onTelemetry={inspectReplay}
                    onAnalyze={analyze}
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
          <div ref={analysisRef} className="analysis-workspace" hidden={!analysisOpen}>
            <div className="analysis-workspace-heading">
              <h2>안전 요약 분석 영역</h2>
              <button disabled={busy} onClick={() => setAnalysisOpen(false)}>
                분석 영역 닫기
              </button>
            </div>
            {analysisContext && <Scope filters={analysisContext} />}
            <p className="notice">
              분석 진입 시점의 기간·서버·출처로 고정합니다. 프로세스·정책 필터는 제외되며, 현재
              화면의 IP·위치·관계·센서 상태·파일 경로는 AI에 전달하지 않습니다.
            </p>
            <Suspense fallback={<p>분석 화면 준비 중…</p>}>
              <AnalysisPanel
                selection={selection}
                filters={analysisContext ? safeSnapshotFilters(analysisContext) : undefined}
                onBusy={setBusy}
                onResult={setBriefing}
              />
            </Suspense>
          </div>
          <footer>LiteSOC · AI 기반 서버 보안 모니터링·분석 플랫폼</footer>
        </main>
      </div>
      {detailId && <Detail id={detailId} onClose={closeDetail} />}
    </div>
  );
}
