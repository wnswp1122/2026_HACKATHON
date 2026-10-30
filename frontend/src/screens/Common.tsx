import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  dateTime,
  number,
  sourceLabel,
  typeLabels,
  type Dashboard,
  type PeriodFilters,
  type ServerSummary,
} from '../types';
import type { Resource } from './useResource';
export function ResourceStatus({
  resource,
  label,
}: {
  resource: Resource<unknown>;
  label: string;
}) {
  return (
    <div className="resource-status">
      <p>
        {label} · 마지막 성공 {resource.successAt ? dateTime(resource.successAt) : '없음'}
        {resource.loading ? ' · 조회 중…' : ''}
        {resource.successAt && Date.now() - Date.parse(resource.successAt) > 10000
          ? ' · 오래된 데이터'
          : ''}
      </p>
      {resource.error && (
        <div role="alert" className="error-banner">
          {resource.error}
          {resource.data
            ? ' 마지막 성공 결과와 그 범위를 유지합니다.'
            : ' 제품 API에 예시를 자동 주입하지 않습니다.'}
        </div>
      )}
      {!resource.data && !resource.error && (
        <p role="status" className="empty">
          {label} 불러오는 중…
        </p>
      )}
    </div>
  );
}
export function Scope({ filters, compact = false }: { filters: PeriodFilters; compact?: boolean }) {
  if (compact) {
    const labels = [
      filters.instanceId,
      filters.status && (filters.status === 'attention' ? '정책 일치' : '관찰됨'),
      filters.eventType && typeLabels[filters.eventType],
      filters.policyName,
      filters.processExecId && '프로세스 필터 적용',
    ].filter(Boolean);
    return labels.length ? <p className="scope">적용 필터 · {labels.join(' · ')}</p> : null;
  }
  return (
    <p className="scope">
      수신 시각 [ {dateTime(filters.from)} ~ {dateTime(filters.to)} ) ·{' '}
      {filters.instanceId || '전체 인스턴스'} · {sourceLabel(filters.source)}
      {filters.processExecId ? ` · execId=${filters.processExecId}` : ''}
      {filters.policyName ? ` · 정책=${filters.policyName}` : ''}
    </p>
  );
}
export function Stats({
  items,
}: {
  items: { label: string; value: number | string; note: string; tone?: string }[];
}) {
  return (
    <div className={`screen-stats count-${items.length}`}>
      {items.map((item) => (
        <article className={`metric ${item.tone || ''}`} key={item.label}>
          <span>{item.label}</span>
          <strong>{typeof item.value === 'number' ? number(item.value) : item.value}</strong>
          <p>{item.note}</p>
        </article>
      ))}
    </div>
  );
}
export function Timeline({
  dashboard,
  explain = false,
}: {
  dashboard: Dashboard;
  explain?: boolean;
}) {
  return (
    <article className="panel timeline-panel">
      <div className="panel-heading">
        <h3>{explain ? '시간별 수집 이벤트 수' : '이벤트 · 정책 일치 추이'}</h3>
        <span>
          {dashboard.bucketSeconds / 60}분당 건수
        </span>
      </div>
      {explain && (
        <p className="timeline-explanation">
          서버에서 보낸 프로세스 실행·파일 접근·네트워크 등 관찰 기록을 수신 시각으로 집계합니다.
          정책 일치는 전체 중 경고 정책에 해당하는 기록이며, 공격 횟수는 아닙니다.
        </p>
      )}
      <div className="legend">
        <i className="dot blue" /> 전체 <i className="dot amber" /> 정책 일치
      </div>
      {explain && <p className="timeline-axis-caption">수신 시각 · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>}
      <div className="chart">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={dashboard.timeline} margin={{ top: 12, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid stroke="#242a33" vertical={false} />
            <XAxis
              dataKey="bucketStart"
              tick={{ fontSize: 12, fill: '#a6b1c2' }}
              minTickGap={50}
              tickFormatter={(v) =>
                new Date(v).toLocaleString(
                  'ko-KR',
                  dashboard.bucketSeconds >= 3600
                    ? { month: 'numeric', day: 'numeric', hour: '2-digit', hour12: false }
                    : { hour: '2-digit', minute: '2-digit', hour12: false },
                )
              }
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#a6b1c2' }} />
            <Tooltip labelFormatter={(v) => dateTime(String(v))} />
            <Area
              name="수집 이벤트"
              dataKey="count"
              stroke="#22d3ee"
              fill="#12353e"
              isAnimationActive={false}
            />
            <Area
              name="정책 일치 (전체에 포함)"
              dataKey="attention"
              stroke="#ff3b5c"
              fill="#3c1923"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
export function ServerTable({
  items,
  onSelect,
}: {
  items: ServerSummary[];
  onSelect?: (id: string) => void;
}) {
  return (
    <article className="panel">
      <div className="panel-heading">
        <h3>서버별 관찰 집계</h3>
        <span>필터 전체 범위 · 보안 정상 판정 아님</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>서버</th>
              <th>관찰 이벤트</th>
              <th>정책 일치</th>
              <th>최근 수신 · 전체 출처</th>
              {onSelect && <th>필터</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.instanceId}>
                <td>{s.instanceId}</td>
                <td>{number(s.total)}</td>
                <td className="pink-text">{number(s.attention)}</td>
                <td>{dateTime(s.lastReceivedAt)}</td>
                {onSelect && (
                  <td>
                    <button onClick={() => onSelect(s.instanceId)}>이 서버 보기</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length && <p className="empty">선택 범위에 서버 이벤트가 없습니다.</p>}
    </article>
  );
}
export function ServerBars({ items }: { items: ServerSummary[] }) {
  return (
    <article className="panel server-bars">
      <div className="panel-heading">
        <h3>서버별 관찰 이벤트 수</h3>
        <span>위험 점수가 아닙니다</span>
      </div>
      {items.length ? (
        <ResponsiveContainer width="100%" height={Math.max(220, items.length * 38)}>
          <BarChart data={items} layout="vertical" margin={{ left: 0, right: 15 }}>
            <CartesianGrid stroke="#242a33" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis dataKey="instanceId" type="category" width={130} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="total" name="관찰 이벤트" fill="#22d3ee" isAnimationActive={false} />
            <Bar
              dataKey="attention"
              name="정책 일치 (전체에 포함)"
              fill="#ff3b5c"
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="empty">관찰된 서버 데이터가 없습니다.</p>
      )}
    </article>
  );
}
export function AnalysisAside({ onAnalyze }: { onAnalyze: () => void }) {
  return (
    <aside className="panel analysis-aside">
      <h3>
        <span className="ai-tag">AI</span> 관찰 분석
      </h3>
      <p>같은 기간·서버·출처의 안전 집계와 요약을 고정하여 분석합니다.</p>
      <div className="analysis-boundary">
        <b>분석에 포함되지 않는 정보</b>
        <p>IP·파일 경로·프로세스 관계·위치·준비 상태·원본·명령 인자</p>
      </div>
      <p className="hint">
        현재 화면 전체를 전송하지 않습니다. 프로세스·정책 추가 필터는 안전 스냅샷에서 제외됩니다.
      </p>
      <button className="primary" onClick={onAnalyze}>
        안전 스냅샷 분석 열기
      </button>
      <p className="unsupported">기준선 이상 탐지 · 전송 MB/s · 로그인/유출 판정: 미지원</p>
    </aside>
  );
}
