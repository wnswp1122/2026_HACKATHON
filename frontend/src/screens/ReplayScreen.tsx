import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { api, describeError } from '../api';
import {
  dateTime,
  eventTypes,
  selectionFilters,
  typeLabels,
  type EventType,
  type PeriodFilters,
  type Replay,
  type Selection,
} from '../types';
import { Scope, Stats } from './Common';

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
    if (!duration) return { ticks: [start], tickStep: 1000 };
    const visibleStep = duration / Math.max(1, (timelineViewportWidth * zoom) / 120);
    const step = timeSteps.find((value) => value >= visibleStep) || timeSteps.at(-1)!;
    const result: number[] = [];
    // Align to wall-clock boundaries; never fabricate or interpolate event values.
    const first = Math.ceil(start / step) * step;
    for (let t = first; t <= end && result.length < 750; t += step) result.push(t);
    if (!result.length) result.push(start);
    return { ticks: result, tickStep: step };
  }, [start, end, duration, zoom, timelineViewportWidth]);
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
      const value = restore
        ? await api.getReplay(restore, AbortSignal.timeout(15000))
        : await api.replay(selectionFilters(selection));
      if (!mounted.current) return;
      if (restore && value.replayId !== restore)
        throw new Error('리플레이 ID가 일치하지 않습니다.');
      setReplay(value);
      onReplay(value.filters);
      setPosition(0);
      setZoomIndex(0);
      setSelectedIndex(0);
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
  return (
    <>
      <div className="replay-actions">
        <button className="primary" disabled={busy} onClick={() => void load()}>
          선택 범위 리플레이 고정
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load(id);
          }}
        >
          <input
            aria-label="리플레이 UUID"
            placeholder="저장한 리플레이 UUID"
            value={id}
            disabled={busy}
            onChange={(e) => setId(e.target.value)}
          />
          <button disabled={busy || !id}>리플레이 불러오기</button>
        </form>
      </div>
      {busy && (
        <p role="status" className="status-line">
          고정 리플레이를 불러오는 중…
        </p>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error} 기존 리플레이는 유지됩니다.
        </div>
      )}
      {!replay ? (
        <div className="panel empty">
          재생할 이벤트를 선택하세요.
        </div>
      ) : (
        <>
          <Scope filters={replay.filters} />
          <div className="scope-chips"><span className="status-chip" title={replay.replayId}>고정 리플레이</span>{replay.truncated && <span className="status-chip caution">일부 이벤트만 재생</span>}</div>
          <Stats
            items={[
              { label: '선택 집합 전체', value: replay.total },
              {
                label: '재생 이벤트',
                value: replay.events.length,
              },
              {
                label: '발생 시각 없음',
                value: replay.undatedCount,
              },
              {
                label: '고정 한도',
                value: replay.eventLimit,
              },
            ]}
          />
          <div className="replay-grid">
            <div className="stack">
              <article className="panel">
                <div className="panel-heading">
                  <h3>관찰 단계</h3>
                  <span>관찰 순서 ≠ 인과관계</span>
                </div>
                <div className="replay-stages">
                  {eventTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        const event = replay.events.find((event) => event.eventType === type);
                        if (event) {
                          setPosition(Date.parse(event.occurredAt!) - start);
                          setSelectedIndex(replay.events.indexOf(event));
                          setPlayDirection(0);
                        }
                      }}
                      disabled={!replay.events.some((event) => event.eventType === type)}
                    >
                      <span>{typeLabels[type]}</span>
                      <strong>
                        {replay.events.filter((event) => event.eventType === type).length}건
                      </strong>
                      <small>해당 유형 첫 관찰로 이동</small>
                    </button>
                  ))}
                </div>
              </article>
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
                {current && (
                  <div className="current-event" data-event-id={current.eventId}>
                    <p>
                      <span className={`badge ${current.source}`}>{current.source}</span>{' '}
                      {current.instanceId} · {typeLabels[current.eventType]} · 실제 결과{' '}
                      {current.outcome}
                    </p>
                    <p>
                      발생 {dateTime(current.occurredAt)} / 수신 {dateTime(current.receivedAt)}
                    </p>
                    <p className="mono">
                      execId {current.process.execId || '미확인'} · 부모 execId{' '}
                      {current.process.parentExecId || '미관찰'}
                    </p>
                    <button onClick={() => onDetail(current.eventId)}>선택 이벤트 원본 상세</button>
                  </div>
                )}
                <button onClick={() => onTelemetry(replay.filters)}>
                  발생 시각 없는 {replay.undatedCount}건 포함 원본 목록 보기
                </button>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
