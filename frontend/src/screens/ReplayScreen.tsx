import { serverName } from '../types';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { api, describeError } from '../api';
import { useInvestigationAnalysis } from './useInvestigationAnalysis';
import {
  dateTime,
  selectionFilters,
  typeLabels,
  statusLabels,
  sourceLabel,
  type Event,
  type EventType,
  type PeriodFilters,
  type Replay,
  type Selection,
} from '../types';
import { Stats } from './Common';

function eventLabel(event: Event): string {
  const process = event.process.binary?.split('/').at(-1) || '미확인';
  const target = event.file?.path || event.target;
  return `${typeLabels[event.eventType]} · ${process}${target ? ` · ${target}` : ''}`;
}

const replayTracks: { label: string; description: string; types: EventType[] }[] = [
  { label: '프로세스', description: '실행 · 종료', types: ['PROCESS_EXEC', 'PROCESS_EXIT'] },
  { label: '파일', description: '파일 접근', types: ['FILE_ACCESS'] },
  { label: '네트워크·기타', description: '네트워크 · 기타', types: ['NETWORK', 'OTHER'] },
];

const zoomLevels = [1, 2, 4, 8, 16, 32, 64] as const;
const timeSteps = [
  1, 2, 5, 10, 20, 50, 100, 200, 500,
  1000, 2000, 5000, 10000, 15000, 30000,
  60000, 120000, 300000, 600000, 900000, 1800000,
  3600000, 7200000, 10800000, 21600000, 43200000, 86400000,
  172800000, 604800000, 2592000000,
];
function rulerTime(timestamp: number, step: number) {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const hms = `${hm}:${pad(date.getSeconds())}`;
  if (step < 1000) return `${hms}.${String(date.getMilliseconds()).padStart(3, '0')}`;
  if (step < 60000) return hms;
  if (step < 86400000) return hm;
  return `${date.getMonth() + 1}/${date.getDate()} ${hm}`;
}

export function ReplayScreen({
  selection,
  onDetail,
  onTelemetry,
  onReplay,
}: {
  selection: Selection;
  onDetail: (id: string) => void;
  onTelemetry: (filters: PeriodFilters) => void;
  onReplay: (filters: PeriodFilters) => void;
}) {
  const [replay, setReplay] = useState<Replay>();
  const [id, setId] = useState(new URLSearchParams(location.search).get('replay') || '');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [playDirection, setPlayDirection] = useState<-1 | 0 | 1>(0),
    [speed, setSpeed] = useState(1),
    [position, setPosition] = useState(0),
    [zoomIndex, setZoomIndex] = useState(0),
    [timelineViewportWidth, setTimelineViewportWidth] = useState(820);
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const lock = useRef(false),
    mounted = useRef(true),
    timelineScrollRef = useRef<HTMLDivElement>(null);
  const start = replay?.events.length ? Date.parse(replay.events[0].occurredAt!) : 0;
  const end = replay?.events.length ? Date.parse(replay.events.at(-1)!.occurredAt!) : start;
  const duration = Math.max(0, end - start);
  const zoom = zoomLevels[zoomIndex];
  const { ticks, tickStep } = useMemo(() => {
    if (!duration) return { ticks: replay?.events.length ? [start] : [], tickStep: 1000 };
    const visibleStep = duration / Math.max(1, (timelineViewportWidth * zoom) / 120);
    const step = timeSteps.find((value) => value >= visibleStep) || timeSteps.at(-1)!;
    const result: number[] = [];
    // Align to wall-clock boundaries; never fabricate or interpolate event values.
    const first = Math.ceil(start / step) * step;
    for (let t = first; t <= end && result.length < 750; t += step) result.push(t);
    if (!result.length) result.push(start);
    return { ticks: result, tickStep: step };
  }, [start, end, duration, zoom, timelineViewportWidth, replay?.events.length]);
  useEffect(() => {
    const scroller = timelineScrollRef.current;
    if (!scroller) return;
    const update = () => setTimelineViewportWidth(scroller.clientWidth || 820);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [replay]);
  useLayoutEffect(() => {
    const scroller = timelineScrollRef.current;
    if (!scroller || !duration) return;
    const cursorX = (position / duration) * scroller.scrollWidth;
    scroller.scrollLeft = cursorX - scroller.clientWidth * 0.5;
  }, [zoom, replay?.replayId]);
  useEffect(() => {
    const scroller = timelineScrollRef.current;
    if (!scroller || !duration) return;
    const cursorX = (position / duration) * scroller.scrollWidth;
    if (cursorX < scroller.scrollLeft + 20 || cursorX > scroller.scrollLeft + scroller.clientWidth - 20)
      scroller.scrollLeft = cursorX - scroller.clientWidth * 0.5;
  }, [position, duration]);
  const currentIndex =
    selectedIndex ??
    replay?.events.reduce(
      (last, event, index) => (Date.parse(event.occurredAt!) <= start + position ? index : last),
      -1,
    ) ??
    -1;
  const current = replay?.events[currentIndex];
  const riskAnalysis = useInvestigationAnalysis(replay?.replayId);
  const selectedAnalysis = useInvestigationAnalysis(replay?.replayId, current?.eventId);

  const sampleReplay = replay?.filters.source === 'sample' || !!replay?.events.length && replay.events.every((event) => event.source === 'sample');
  useEffect(() => {
    if (sampleReplay && replay) void riskAnalysis.run();
  }, [replay?.replayId, sampleReplay]);
  useEffect(() => {
    mounted.current = true;
    const restored = new URLSearchParams(location.search).get('replay');
    if (restored) void load(restored);
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!playDirection) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      setPosition((value) =>
        Math.max(0, Math.min(duration, value + elapsed * speed * playDirection)),
      );
    }, 50);
    return () => clearInterval(timer);
  }, [playDirection, speed, duration]);
  useEffect(() => {
    if (
      (playDirection === 1 && position >= duration) ||
      (playDirection === -1 && position <= 0)
    ) setPlayDirection(0);
  }, [position, duration, playDirection]);
  async function load(restore?: string) {
    if (lock.current) return;
    if (
      restore &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restore)
    ) {
      setError('리플레이 UUID를 확인하세요.');
      return;
    }
    if (restore) restore = restore.toLowerCase();
    lock.current = true;
    setBusy(true);
    setError('');
    setPlayDirection(0);
    try {
      const filters = selectionFilters(selection);
      const value = restore
        ? await api.getReplay(restore, AbortSignal.timeout(15000))
        : await api.replay({ from: filters.from, to: filters.to, instanceId: filters.instanceId, source: filters.source });
      if (!mounted.current) return;
      if (restore && value.replayId !== restore)
        throw new Error('리플레이 ID가 일치하지 않습니다.');
      setReplay(value);
      onReplay(value.filters);
      const firstRisk = value.events.findIndex((event) => event.status === 'attention');
      const index = firstRisk < 0 ? 0 : firstRisk;
      setPosition(value.events.length ? Date.parse(value.events[index].occurredAt!) - Date.parse(value.events[0].occurredAt!) : 0);
      setSelectedIndex(index);
      setZoomIndex(0);
      setId(value.replayId);
      const url = new URL(location.href);
      url.searchParams.set('replay', value.replayId);
      history.replaceState(null, '', url);
    } catch (error) {
      if (mounted.current) setError(describeError(error));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function step(direction: number) {
    if (!replay?.events.length) return;
    setPlayDirection(0);
    const candidates = replay.events.map((event, index) => ({ event, index }))
      .filter(({ event, index }) => event.instanceId === current?.instanceId && (direction < 0 ? index < currentIndex : index > currentIndex));
    const next = direction < 0 ? candidates.at(-1) : candidates[0];
    if (!next) return;
    setPosition(Date.parse(next.event.occurredAt!) - start);
    setSelectedIndex(next.index);
  }
  function play(direction: -1 | 1) {
    if (!duration) return;
    setPosition((value) =>
      direction === -1 && value <= 0 ? duration : direction === 1 && value >= duration ? 0 : value,
    );
    setSelectedIndex(undefined);
    setPlayDirection(direction);
  }
  function scrubRuler(event: PointerEvent<HTMLDivElement>) {
    if (!duration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    setPosition(Math.round(duration * ratio));
    setSelectedIndex(undefined);
    setPlayDirection(0);
  }
  function zoomBy(direction: -1 | 1) {
    setZoomIndex((index) => Math.max(0, Math.min(zoomLevels.length - 1, index + direction)));
  }
  function focus(index: number) {
    if (!replay?.events[index]) return;
    setPlayDirection(0);
    setPosition(Date.parse(replay.events[index].occurredAt!) - start);
    setSelectedIndex(index);
  }
  const riskEvents = replay?.events.map((event, index) => ({ event, index }))
    .filter(({ event }) => event.status === 'attention') || [];
  const serverEvents = replay?.events.map((event, index) => ({ event, index }))
    .filter(({ event }) => event.instanceId === current?.instanceId) || [];
  const serverIndex = serverEvents.findIndex(({ index }) => index === currentIndex);
  const contextEvents = serverEvents.slice(Math.max(0, serverIndex - 3), Math.max(0, serverIndex) + 4);
  return (
    <>
      <div className="investigation-intro">
        <p>같은 서버의 전체 기록에서 위험 이벤트 전후에 무슨 일이 있었는지 확인하세요.</p>
        <button className="primary" disabled={busy} title="같은 서버·출처·기간의 전체 이벤트로 조사합니다. 상태·유형·프로세스·정책 필터는 제외합니다." onClick={() => void load()}>전후 기록 포함해 조사 시작</button>
      </div>
      <details className="restore-investigation">
        <summary>저장한 조사 불러오기</summary>
        <form className="restore" onSubmit={(event) => { event.preventDefault(); void load(id); }}>
          <input aria-label="조사 ID" placeholder="저장한 조사 ID" value={id} disabled={busy} onChange={(event) => setId(event.target.value)} />
          <button disabled={busy || !id}>불러오기</button>
        </form>
      </details>
      {busy && <p role="status" className="status-line">이벤트 흐름을 불러오는 중…</p>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      {!replay ? <div className="panel empty">조사를 시작하면 같은 시점에 고정된 이벤트를 확인할 수 있습니다.</div> : (
        <>
          {replay.truncated && <p className="hint">일부 이벤트만 표시</p>}
          <Stats items={[
            { label: '전체 수신 이벤트', value: replay.total },
            { label: '시간순 조사 이벤트', value: replay.events.length },
            { label: '위험 이벤트', value: riskEvents.length, tone: 'warning' },
            { label: '발생 시각 미확인', value: replay.undatedCount, tone: 'unknown' },
          ]} />
          <article className="panel investigation-risks">
            <div className="panel-heading"><h3>먼저 확인할 위험 이벤트</h3><span>{riskEvents.length ? '대표 1건' : '0건'}</span>
              {riskEvents.length > 0 && <button disabled={riskAnalysis.loading} onClick={() => void riskAnalysis.run()}>{riskAnalysis.loading ? '요약 중…' : sampleReplay ? '요약 보기' : riskAnalysis.data ? '저장된 AI 요약 다시 보기' : 'AI로 위험 이벤트 요약'}</button>}
            </div>
            {riskEvents.length > 0 && !sampleReplay && <p className="hint">위험 이벤트 최대 20건의 제한된 요약 정보를 Gemini에 전송합니다. 전체 경로·IP·원본 인자는 제외합니다.</p>}
            {riskAnalysis.error && <p className="error-text" role="alert">{riskAnalysis.error}</p>}
            {riskAnalysis.data && <p className="hint">{sampleReplay ? '이벤트 요약' : `AI 요약 · ${riskAnalysis.data.model}`} · {dateTime(riskAnalysis.data.createdAt)}</p>}
            {riskEvents.length ? <div className="risk-anchor-list">
              {riskEvents.slice(0, 1).map(({ event, index }) => (
                <button key={event.eventId} className="risk-anchor" aria-pressed={currentIndex === index} onClick={() => focus(index)}>
                  <span className="badge attention">위험</span>
                  <time>{new Date(event.occurredAt!).toLocaleTimeString('ko-KR', { hour12: false })}</time>
                  <strong>{riskAnalysis.data?.result.summaries.find((item) => item.eventId === event.eventId)?.summary || eventLabel(event)}</strong>
                  <small>{serverName(event.instanceId)}{event.policyName ? ` · ${event.policyName}` : ''}</small>
                </button>
              ))}
            </div> : <p className="empty">고정된 시간순 기록에 위험 이벤트가 없습니다. 아래에서 일반 이벤트의 흐름을 확인할 수 있습니다.</p>}
          </article>
          <div className="investigation-grid">
            <article className="panel investigation-context">
              <div className="panel-heading"><h3>이벤트 전후 흐름</h3><span>{current ? serverName(current.instanceId) : ''} · 발생 시각순</span></div>
              <div className="investigation-step-controls">
                <button disabled={serverIndex <= 0} onClick={() => step(-1)}>← 이전 이벤트</button>
                <span>{serverEvents.length ? serverIndex + 1 : 0} / {serverEvents.length}</span>
                <button disabled={serverIndex >= serverEvents.length - 1} onClick={() => step(1)}>다음 이벤트 →</button>
              </div>
              <ol className="event-story-list">
                {contextEvents.map(({ event, index }) => {
                  return <li key={event.eventId}>
                    <button className={`event-story status-${event.status}`} aria-pressed={index === currentIndex} onClick={() => focus(index)}>
                      <time>{new Date(event.occurredAt!).toLocaleTimeString('ko-KR', { hour12: false })}</time>
                      <span className={`badge ${event.status}`}>{statusLabels[event.status]}</span>
                      <strong>{eventLabel(event)}</strong>
                    </button>
                  </li>;
                })}
              </ol>
              {!contextEvents.length && <p className="empty">발생 시각이 있는 이벤트가 없습니다.</p>}
            </article>
            {current && <article className="panel investigation-selected" data-event-id={current.eventId}>
              <div className="panel-heading"><h3>{sampleReplay ? '선택 이벤트 분석' : '선택 이벤트 AI 분석'}</h3><span className={`badge ${current.status}`}>{statusLabels[current.status]}</span></div>
              <p className="event-narrative-context">{eventLabel(current)}</p>
              <button className="primary" disabled={selectedAnalysis.loading} onClick={() => void selectedAnalysis.run()}>{selectedAnalysis.loading ? '분석 중…' : sampleReplay ? '분석 보기' : selectedAnalysis.data ? '저장된 분석 다시 보기' : '이 이벤트 AI 분석'}</button>
              {!sampleReplay && <p className="hint">선택 이벤트와 같은 서버의 앞뒤 3건을 Gemini로 분석합니다. 전체 경로·IP·원본 인자는 제외합니다.</p>}
              {selectedAnalysis.error && <p className="error-text" role="alert">{selectedAnalysis.error}</p>}
              {selectedAnalysis.data && <section className="investigation-ai-result" aria-label="선택 이벤트 AI 분석 결과">
                <p className="event-narrative">{selectedAnalysis.data.result.summaries[0]?.summary}</p>
                {(['facts', 'hypotheses', 'checks', 'limitations'] as const).map((key, index) => (
                  <div key={key}><h4>{['관찰된 사실', '가능한 해석', '다음 확인 사항', '분석의 한계'][index]}</h4>
                    <ul>{selectedAnalysis.data!.result[key].map((text, i) => <li key={i}>{text}</li>)}</ul>
                  </div>
                ))}
                <small>{sampleReplay ? '' : `${selectedAnalysis.data.model} · `}{dateTime(selectedAnalysis.data.createdAt)}</small>
              </section>}
              <p className="event-narrative-context">{serverName(current.instanceId)} · {sourceLabel(current.source)}</p>
              <p className="event-narrative-context">{dateTime(current.occurredAt)}</p>
              {current.status === 'attention' && <div className="investigation-reason">
                <b>위험으로 분류된 이유</b>
                <p>{current.policyName ? `${current.policyName} 규칙이 경고 정책명 목록과 일치합니다.` : '등록된 경고 정책 조건에 일치합니다.'}</p>
              </div>}
              <button onClick={() => onDetail(current.eventId)}>이 이벤트 상세 보기</button>
              <details className="event-technical">
                <summary>기술 정보</summary>
                <dl>
                  <dt>프로세스</dt><dd>{current.process.binary || '미확인'}</dd>
                  <dt>실행 식별자</dt><dd>{current.process.execId || '미확인'}</dd>
                  <dt>부모 프로세스</dt><dd>{current.process.parentBinary || '미확인'}</dd>
                  <dt>부모 실행 식별자</dt><dd>{current.process.parentExecId || '미확인'}</dd>
                  <dt>수신 시각</dt><dd>{dateTime(current.receivedAt)}</dd>
                  <dt>보고된 대응 동작</dt><dd>{current.reportedAction || '미확인'}</dd>
                  <dt>실제 대응 결과</dt><dd>미확인</dd>
                </dl>
              </details>
            </article>}
          </div>
          <details className="panel investigation-playback" onToggle={(event) => { if (!event.currentTarget.open) setPlayDirection(0); }}>
            <summary>시간축으로 흐름 재생하기</summary>
              <section className="panel replay-editor" aria-label="통합 리플레이 편집기">
                <div className="replay-player">
                  <div className="transport-controls" role="group" aria-label="재생 제어">
                    <button type="button" className={playDirection === -1 ? 'transport-active' : ''}
                      aria-label="역재생" aria-pressed={playDirection === -1} disabled={!duration}
                      onClick={() => play(-1)}>◀ 역재생</button>
                    <button type="button" aria-label="일시정지" disabled={!duration}
                      onClick={() => setPlayDirection(0)}>Ⅱ 일시정지</button>
                    <button type="button" className={playDirection === 1 ? 'transport-active' : ''}
                      aria-label="재생" aria-pressed={playDirection === 1} disabled={!duration}
                      onClick={() => play(1)}>▶ 재생</button>
                  </div>
                  <span className="transport-clock mono">
                    {replay.events.length ? dateTime(new Date(start + position).toISOString()) : '재생할 이벤트 없음'}
                  </span>
                  <label>
                    배속
                    <select aria-label="리플레이 배속" value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}>
                      <option value="1">1x</option>
                      <option value="4">4x</option>
                      <option value="16">16x</option>
                    </select>
                  </label>
                </div>
                <div className="replay-zoom-bar" role="group" aria-label="타임라인 확대 축소">
                  <strong>타임라인 배율</strong>
                  <button type="button" aria-label="타임라인 축소" onClick={() => zoomBy(-1)}
                    disabled={zoomIndex === 0 || !duration}>−</button>
                  <input type="range" min="0" max={zoomLevels.length - 1} step="1"
                    aria-label="타임라인 확대 축소 배율" value={zoomIndex}
                    disabled={!duration} onChange={(e) => setZoomIndex(Number(e.target.value))} />
                  <button type="button" aria-label="타임라인 확대" onClick={() => zoomBy(1)}
                    disabled={zoomIndex === zoomLevels.length - 1 || !duration}>+</button>
                  <span className="replay-zoom-value mono" aria-live="polite">{zoom}×</span>
                  <button type="button" className="replay-fit" onClick={() => setZoomIndex(0)}
                    disabled={zoomIndex === 0}>전체 보기</button>
                  <small>눈금 드래그: 시점 이동 · 가로 스크롤: 시간 구간 이동</small>
                </div>
                <div className="replay-timeline-grid">
                  <div className="replay-timeline-labels">
                    <div className="replay-time-label">시간</div>
                    {replayTracks.map((track) => (
                      <div className="replay-track-label" title={track.description} key={track.label}>
                        {track.label}
                      </div>
                    ))}
                  </div>
                  <div ref={timelineScrollRef} className="replay-timeline-scroll"
                    aria-label="타임라인 시간 구간 가로 스크롤" tabIndex={0}>
                    <div className="replay-timeline-canvas" style={{ width: `${zoom * 100}%` }}>
                      <div className="replay-time-ruler" role="slider" tabIndex={duration ? 0 : -1}
                        aria-label="발생 시각 탐색" aria-valuemin={0}
                        aria-valuemax={duration || 1} aria-valuenow={Math.round(position)}
                        aria-valuetext={replay.events.length ? dateTime(new Date(start + position).toISOString()) : '이벤트 없음'}
                        onPointerDown={(e) => {
                          if (!duration) return;
                          e.currentTarget.setPointerCapture(e.pointerId);
                          scrubRuler(e);
                        }}
                        onPointerMove={(e) => {
                          if (e.currentTarget.hasPointerCapture(e.pointerId)) scrubRuler(e);
                        }}
                        onPointerUp={(e) => {
                          if (e.currentTarget.hasPointerCapture(e.pointerId))
                            e.currentTarget.releasePointerCapture(e.pointerId);
                        }}
                        onKeyDown={(e) => {
                          if (!duration) return;
                          const increment = Math.max(1, Math.round(tickStep / 5));
                          const next = e.key === 'ArrowRight' ? position + increment
                            : e.key === 'ArrowLeft' ? position - increment
                              : e.key === 'Home' ? 0 : e.key === 'End' ? duration : null;
                          if (next === null) return;
                          e.preventDefault();
                          setPosition(Math.max(0, Math.min(duration, next)));
                          setSelectedIndex(undefined);
                          setPlayDirection(0);
                        }}>
                        {ticks.map((t) => (
                          <span className="replay-ruler-tick" key={t}
                            style={{ left: `${duration ? ((t - start) / duration) * 100 : 0}%` }}>
                            <span>{rulerTime(t, tickStep)}</span>
                          </span>
                        ))}
                      </div>
                      {replayTracks.map((track) => (
                        <div className="replay-timeline-track" key={track.label}>
                          {replay.events.filter((event) => track.types.includes(event.eventType)).map((event) => (
                            <i key={event.eventId}
                              className={event.status === 'attention' ? 'attention' : ''}
                              style={{ left: `${duration ? ((Date.parse(event.occurredAt!) - start) / duration) * 100 : 0}%` }}
                              title={`${typeLabels[event.eventType]} · ${dateTime(event.occurredAt)} · ${event.instanceId} · ${event.source}`}
                            />
                          ))}
                        </div>
                      ))}
                      <div className="replay-timeline-cursor" aria-hidden="true"
                        style={{ left: `${duration ? (position / duration) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
                {!replay.events.length && (
                  <p className="empty">발생 시각이 있는 이벤트가 없습니다.</p>
                )}
                {!!replay.events.length && !duration && (
                  <p className="hint">모든 이벤트의 발생 시각이 같습니다. 같은 시각의 이벤트는 개별 관찰에서 확인하세요.</p>
                )}
              </section>
          </details>
          <div className="investigation-footer">
            <button onClick={() => onTelemetry(replay.filters)}>같은 범위의 전체 이벤트 탐색</button>
            {replay.undatedCount > 0 && <span className="hint">발생 시각 미확인 {replay.undatedCount}건은 목록에서 확인</span>}
          </div>
        </>
      )}
    </>
  );
}
