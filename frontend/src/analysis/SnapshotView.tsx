import { forwardRef, memo } from 'react';
import { Charts, Metrics } from '../events/Charts';
import { dateTime, sourceLabel, typeLabels, type Snapshot } from '../types';

export const SnapshotView = memo(
  forwardRef<HTMLDivElement, { snapshot: Snapshot }>(function SnapshotView({ snapshot: s }, ref) {
    const shown = s.events.slice(0, 8);
    return (
      <div className="snapshot-capture" ref={ref} data-snapshot-id={s.snapshotId}>
        <div className="capture-heading">
          <div>
            <p className="eyebrow">TETRAGON / FROZEN SNAPSHOT</p>
            <h2>보안 관찰 스냅샷</h2>
          </div>
          <span className="badge frozen">고정 데이터</span>
        </div>
        {import.meta.env.VITE_DATA_LABEL && (
          <p className="mock-label">{import.meta.env.VITE_DATA_LABEL}</p>
        )}
        <p className="snapshot-id">Snapshot ID · {s.snapshotId}</p>
        <div className="snapshot-meta">
          <p>
            <b>수신 기간</b> {dateTime(s.filters.from)} ~ {dateTime(s.filters.to)}{' '}
            <span>(종료 제외)</span>
          </p>
          <p>
            <b>집계 범위</b> {s.filters.instanceId || '전체 인스턴스'} ·{' '}
            {s.filters.eventType ? typeLabels[s.filters.eventType] : '전체 유형'} ·{' '}
            {s.filters.status === 'attention'
              ? '주의 필요'
              : s.filters.status === 'observed'
                ? '관찰됨'
                : '전체 상태'}{' '}
            · {sourceLabel(s.filters.source)}
          </p>
          <p>
            <b>생성 시각</b> {dateTime(s.createdAt)} · 라이브 수신과 무관하게 유지
          </p>
        </div>
        <Metrics data={s.dashboard} />
        <Charts data={s.dashboard} fixed />
        <div className="panel safe-events">
          <div className="panel-heading">
            <h3>안전한 이벤트 요약</h3>
            <span>
              화면 {shown.length}건 / 저장 요약 {s.events.length}건 / 전체 {s.dashboard.total}건
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>수신 시각</th>
                <th>인스턴스</th>
                <th>유형</th>
                <th>출처</th>
                <th>상태</th>
                <th>실제 결과</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.eventId}>
                  <td>{dateTime(e.receivedAt)}</td>
                  <td>{e.instanceId}</td>
                  <td>{typeLabels[e.eventType]}</td>
                  <td>{e.source}</td>
                  <td>{e.status === 'attention' ? '주의 필요' : '관찰됨'}</td>
                  <td>{e.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="empty">선택 범위에 이벤트가 없습니다.</p>}
          <p className="hint">
            서버 요약 한도 {s.eventLimit}건 · 서버 요약 생략 {s.eventsTruncated ? '있음' : '없음'} ·
            화면 요약 생략{' '}
            {s.events.length > shown.length ? `${s.events.length - shown.length}건` : '없음'}.
            집계는 전체 범위입니다.
          </p>
        </div>
        <p className="capture-footer">
          원본·명령 인자·프로세스 경로는 제외됩니다. 주의 필요는 공격 확정이 아니며 실제 차단·유출
          여부는 확인되지 않았습니다.
        </p>
      </div>
    );
  }),
);
