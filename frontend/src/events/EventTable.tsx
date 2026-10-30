import { dateTime, number, typeLabels, type EventPage } from '../types';
export function EventTable({
  events,
  loading,
  onPage,
  onDetail,
  selectedId,
}: {
  events: EventPage;
  loading: boolean;
  onPage: (p: number) => void;
  onDetail: (id: string) => void;
  selectedId: string;
}) {
  const pages = Math.max(1, Math.ceil(events.total / events.pageSize));
  return (
    <section id="events" className="panel events">
      <div className="panel-heading">
        <h3>런타임 이벤트</h3>
        <span>전체 {number(events.total)}건 · 수신 시각 내림차순</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>수신 / 발생 시각</th>
              <th>인스턴스</th>
              <th>이벤트 유형</th>
              <th>프로세스</th>
              <th>출처</th>
              <th>상태</th>
              <th>조사</th>
            </tr>
          </thead>
          <tbody>
            {events.items.map((e) => (
              <tr key={e.eventId} className={selectedId === e.eventId ? 'selected-event-row' : ''} aria-selected={selectedId === e.eventId} tabIndex={0} onClick={() => onDetail(e.eventId)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onDetail(e.eventId); } }}>
                <td>
                  {dateTime(e.receivedAt)}
                  <small>발생 {dateTime(e.occurredAt)}</small>
                </td>
                <td>{e.instanceId}</td>
                <td>{typeLabels[e.eventType]}</td>
                <td className="binary" title={e.process.binary || ''}>
                  {e.process.binary || '미확인'}
                </td>
                <td>
                  <span className={`badge ${e.source}`}>{e.source}</span>
                </td>
                <td>
                  <span className={`badge ${e.status}`}>
                    {e.status === 'attention' ? '주의 필요' : '관찰됨'}
                  </span>
                </td>
                <td>
                  <button className="text-button" aria-label={`${typeLabels[e.eventType]} 이벤트 상세 보기`} onClick={(event) => { event.stopPropagation(); onDetail(e.eventId); }}>
                    상세 보기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {events.items.length === 0 && (
        <p className="empty">선택한 조건의 이벤트가 없습니다. 기간과 필터를 확인하세요.</p>
      )}
      <div className="pagination">
        <span>목록은 페이지 단위입니다. 집계 카드는 전체 범위 기준입니다.</span>
        <div>
          <button disabled={loading || events.page <= 1} onClick={() => onPage(events.page - 1)}>
            이전
          </button>
          <span>
            {events.page} / {pages}
          </span>
          <button
            disabled={loading || events.page >= pages}
            onClick={() => onPage(events.page + 1)}
          >
            다음
          </button>
        </div>
      </div>
    </section>
  );
}
