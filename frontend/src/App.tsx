import { lazy, Suspense, useEffect, useState } from 'react';
import { Charts, Metrics } from './events/Charts';
import { Detail } from './events/Detail';
import { EventTable } from './events/EventTable';
import { Filters, initialSelection } from './events/Filters';
import { useDashboard } from './events/useDashboard';
import { dateTime, sourceLabel, type Analysis } from './types';
const AnalysisPanel = lazy(() => import('./analysis/AnalysisPanel'));

export default function App() {
  const [selection, setSelection] = useState(initialSelection);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [detailId, setDetailId] = useState('');
  const [briefing, setBriefing] = useState<Analysis>();
  const [section, setSection] = useState(window.location.hash || '#overview');
  const [now, setNow] = useState(Date.now());
  const { data, error, loading } = useDashboard(selection, page, refresh);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const changed = () => setSection(window.location.hash || '#overview');
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  const stale = !data || now - Date.parse(data.successAt) > 10_000;
  const latest = data?.instances.reduce<string | null>(
    (max, i) =>
      (!data.filters.instanceId || i.instanceId === data.filters.instanceId) &&
      (!max || Date.parse(i.lastReceivedAt) > Date.parse(max))
        ? i.lastReceivedAt
        : max,
    null,
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-icon">L</span>
          <b>LiteSOC</b>
        </a>
        <p className="nav-caption">홈</p>
        <a
          className={`nav-link ${section === '#overview' ? 'active' : ''}`}
          aria-current={section === '#overview' ? 'location' : undefined}
          href="#overview"
        >
          <i />
          보안 개요
        </a>
        <p className="nav-caption">관찰 · 분석</p>
        <a
          className={`nav-link ${section === '#events' ? 'active' : ''}`}
          aria-current={section === '#events' ? 'location' : undefined}
          href="#events"
        >
          <i />
          런타임 이벤트
        </a>
        <a
          className={`nav-link ${section === '#analysis' ? 'active' : ''}`}
          aria-current={section === '#analysis' ? 'location' : undefined}
          href="#analysis"
        >
          <i />
          스냅샷 · AI 분석
        </a>
        <div className="sidebar-note">
          <b>수집 파이프라인</b>
          <p>
            Tetragon 에이전트 <span>상태 미확인</span>
          </p>
          <p>
            Event Forwarder <span>상태 미확인</span>
          </p>
          <p>
            조회 API <span>{error ? '조회 오류' : stale ? '응답 대기' : '응답 수신'}</span>
          </p>
          <small>최근 수신은 heartbeat가 아닙니다.</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="workspace-badge">L</span>
            <b>로컬 보안 워크스페이스</b>
            <span className="env-label">MVP</span>
          </div>
          <div>
            <span className={`connection ${error || stale ? 'delayed' : ''}`}>
              <i className="dot" />
              {error ? '조회 오류' : stale ? '응답 대기' : 'API 응답 수신'}
            </span>
            <span className="poll-label">2s 폴링</span>
            <a className="analyst-link" href="#analysis">
              <b>AI</b> 분석가
            </a>
          </div>
        </header>
        <main id="overview">
          <div className="page-heading">
            <div>
              <h1>보안 개요</h1>
              <p>Tetragon에서 관찰된 런타임 이벤트 · 수신 시각 기준</p>
            </div>
            <button disabled={loading} onClick={() => setRefresh((x) => x + 1)}>
              ↻ 지금 새로고침
            </button>
          </div>
          <section className="ai-briefing">
            <span className="ai-tag">AI 브리핑</span>
            <div>
              <p>
                {briefing
                  ? `고정 스냅샷 ${briefing.snapshotId.slice(0, 8)} · ${briefing.model} · ${dateTime(briefing.createdAt)}`
                  : '선택한 시점의 데이터와 캡처를 함께 분석합니다.'}
              </p>
              <strong>
                {briefing
                  ? briefing.result.facts[0] || '고정 스냅샷의 분석 결과를 확인하세요.'
                  : '아직 분석한 스냅샷이 없습니다.'}
              </strong>
              <span>
                {briefing?.model.includes('mock')
                  ? 'mock 응답 · 실제 모델 분석 아님'
                  : '관찰된 사실 · 가능한 해석 · 확인 사항 · 한계를 구분합니다.'}
              </span>
            </div>
            <a className="button primary" href="#analysis">
              {briefing ? '분석 결과 보기 →' : '스냅샷으로 분석 →'}
            </a>
          </section>
          {import.meta.env.VITE_DATA_LABEL && (
            <div className="mock-label">
              {import.meta.env.VITE_DATA_LABEL} · 실제 수집·전체 통합·실제 AI 분석 검증이 아닙니다.
            </div>
          )}
          <Filters
            instances={data?.instances || []}
            disabled={busy}
            onChange={(s) => {
              setSelection(s);
              setPage(1);
            }}
          />
          <div className="freshness">
            <span>
              <i className={`dot ${error || stale ? 'amber' : 'green'}`} /> 2초 폴링 · 마지막 성공{' '}
              {data ? dateTime(data.successAt) : '없음'} {loading ? '· 조회 중…' : ''}
              {data && stale ? ' · 오래된 화면' : ''}
            </span>
            <span>
              최근 수신(전체 출처) {dateTime(latest || null)} · 수집기 정상 상태 보장이 아님
            </span>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <b>최신 데이터를 가져오지 못했습니다.</b>
              <p>{error}</p>
              <p>
                {data
                  ? '아래는 마지막 성공 데이터와 해당 필터 범위입니다.'
                  : '서버 연결을 확인하세요. 예시 데이터를 자동으로 넣지 않습니다.'}
              </p>
            </div>
          )}
          {data ? (
            <>
              <p className="scope">
                표시 중: {dateTime(data.filters.from)} ~ {dateTime(data.filters.to)} ·{' '}
                {data.filters.instanceId || '전체 인스턴스'} ·{' '}
                {data.filters.eventType || '전체 유형'} · {data.filters.status || '전체 상태'} ·{' '}
                {sourceLabel(data.filters.source)}
              </p>
              <Metrics data={data.dashboard} />
              <Charts data={data.dashboard} />
              <EventTable
                events={data.events}
                loading={loading}
                onPage={setPage}
                onDetail={setDetailId}
              />
            </>
          ) : (
            <div className="panel empty" role="status">
              {loading ? '관찰 이벤트와 집계를 불러오는 중…' : '표시할 성공 데이터가 없습니다.'}
            </div>
          )}
          <p className="hint semantics">
            주의 필요는 등록한 경고 정책과 일치했다는 뜻입니다. 관찰만으로 공격·유출·차단 성공을
            단정하지 않습니다. 실제 결과는 unknown입니다.
          </p>
          <Suspense fallback={<p>분석 화면 준비 중…</p>}>
            <AnalysisPanel selection={selection} onBusy={setBusy} onResult={setBriefing} />
          </Suspense>
          <footer>수신 시각 기준 집계 · LiteSOC · Tetragon 기반 로컬 관찰 MVP</footer>
        </main>
      </div>
      {detailId && <Detail id={detailId} onClose={() => setDetailId('')} />}
    </div>
  );
}
