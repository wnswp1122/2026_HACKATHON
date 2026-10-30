import { useEffect, useRef, useState } from 'react';
import { api, describeError } from '../api';
import {
  dateTime,
  eventTypes,
  selectionFilters,
  sourceLabel,
  typeLabels,
  type PeriodFilters,
  type Replay,
  type Selection,
} from '../types';
import { AnalysisAside, Scope, Stats } from './Common';

export function ReplayScreen({
  selection,
  onDetail,
  onTelemetry,
  onAnalyze,
  onReplay,
}: {
  selection: Selection;
  onDetail: (id: string) => void;
  onTelemetry: (filters: PeriodFilters) => void;
  onAnalyze: (filters?: PeriodFilters) => void;
  onReplay: (filters: PeriodFilters) => void;
}) {
  const [replay, setReplay] = useState<Replay>();
  const [id, setId] = useState(new URLSearchParams(location.search).get('replay') || '');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [position, setPosition] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const lock = useRef(false),
    mounted = useRef(true);
  const start = replay?.events.length ? Date.parse(replay.events[0].occurredAt!) : 0;
  const end = replay?.events.length ? Date.parse(replay.events.at(-1)!.occurredAt!) : start;
  const duration = Math.max(0, end - start);
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
    if (!playing) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(),
        elapsed = now - last;
      last = now;
      setPosition((value) => Math.min(duration, value + elapsed * speed));
    }, 100);
    return () => clearInterval(timer);
  }, [playing, speed, duration]);
  useEffect(() => {
    if (playing && position >= duration) setPlaying(false);
  }, [position, duration, playing]);
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
    setPlaying(false);
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
  function step(direction: number) {
    if (!replay?.events.length) return;
    setPlaying(false);
    const next = Math.max(0, Math.min(replay.events.length - 1, currentIndex + direction));
    setPosition(Date.parse(replay.events[next].occurredAt!) - start);
    setSelectedIndex(next);
  }
  return (
    <>
      <p className="hint">
        위 필터 변경은 새 리플레이를 고정할 때 적용합니다. 기존 고정 집합과 재생 시점은 자동으로
        바뀌지 않습니다.
      </p>
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
          기간·서버·출처를 선택하고 리플레이를 고정하세요. 예시 이벤트를 자동 생성하지 않습니다.
        </div>
      ) : (
        <>
          <Scope filters={replay.filters} />
          <p className="scope mono">
            Replay {replay.replayId} · 생성 {dateTime(replay.createdAt)} · 발생 시각 기준 재생 ·{' '}
            {sourceLabel(replay.filters.source)}
          </p>
          <Stats
            items={[
              { label: '선택 집합 전체', value: replay.total, note: 'receivedAt으로 기간 선택' },
              {
                label: '재생 이벤트',
                value: replay.events.length,
                note: 'occurredAt → eventId 오름차순',
              },
              {
                label: '발생 시각 없음',
                value: replay.undatedCount,
                note: '재생에서 제외 · 원본 목록에서 확인',
              },
              {
                label: '고정 한도',
                value: replay.eventLimit,
                note: replay.truncated ? '상한으로 일부 생략' : '서버 응답 생략 없음',
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
                          setPlaying(false);
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
              <div className="panel replay-player">
                <button
                  disabled={!duration}
                  aria-label={playing ? '리플레이 일시정지' : '리플레이 재생'}
                  onClick={() => {
                    if (position >= duration) setPosition(0);
                    setSelectedIndex(undefined);
                    setPlaying((value) => !value);
                  }}
                >
                  {playing ? 'Ⅱ 일시정지' : '▶ 재생'}
                </button>
                <button disabled={!replay.events.length} onClick={() => step(-1)}>
                  이전 관찰
                </button>
                <input
                  aria-label="리플레이 시점"
                  type="range"
                  min="0"
                  max={duration || 1}
                  step="1"
                  value={position}
                  disabled={!duration}
                  onChange={(e) => {
                    setPosition(Number(e.target.value));
                    setSelectedIndex(undefined);
                    setPlaying(false);
                  }}
                />
                <button disabled={!replay.events.length} onClick={() => step(1)}>
                  다음 관찰
                </button>
                <label>
                  배속
                  <select
                    aria-label="리플레이 배속"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    <option value="1">1x</option>
                    <option value="4">4x</option>
                    <option value="16">16x</option>
                  </select>
                </label>
              </div>
              <article className="panel replay-lanes">
                <div className="panel-heading">
                  <h3>레인별 발생 시각 타임라인</h3>
                  <span>
                    {replay.events.length
                      ? dateTime(new Date(start + position).toISOString())
                      : '재생할 이벤트 없음'}
                  </span>
                </div>
                {eventTypes.map((type) => (
                  <div className="lane-row" key={type}>
                    <span>{typeLabels[type]}</span>
                    <div className="lane-track">
                      {replay.events
                        .filter((event) => event.eventType === type)
                        .map((event) => (
                          <i
                            key={event.eventId}
                            className={event.status === 'attention' ? 'attention' : ''}
                            style={{
                              left: `${duration ? ((Date.parse(event.occurredAt!) - start) / duration) * 99 : 0}%`,
                            }}
                            title={`${dateTime(event.occurredAt)} · ${event.instanceId} · ${event.source}`}
                          />
                        ))}
                      <b style={{ left: `${duration ? (position / duration) * 99 : 0}%` }} />
                    </div>
                  </div>
                ))}
                {!replay.events.length && (
                  <p className="empty">발생 시각이 있는 이벤트가 없습니다.</p>
                )}
                {!!replay.events.length && !duration && (
                  <p className="hint">
                    모든 이벤트의 발생 시각이 같습니다. 이전·다음 관찰로 eventId 순서의 개별
                    이벤트를 확인하세요.
                  </p>
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
                <p className="notice">
                  로그인·계정 탈취·DB 조회·전송량·유출을 재구성하지 않습니다. 새 수신이나 라이브
                  폴링으로 이 리플레이를 변경하지 않습니다.
                </p>
                <button onClick={() => onTelemetry(replay.filters)}>
                  발생 시각 없는 {replay.undatedCount}건 포함 원본 목록 보기
                </button>
              </article>
            </div>
            <AnalysisAside onAnalyze={() => onAnalyze(replay.filters)} />
          </div>
        </>
      )}
    </>
  );
}
