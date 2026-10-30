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
  const stale = resource.successAt && Date.now() - Date.parse(resource.successAt) > 10000;
  if (resource.data && !resource.error && !stale) return null;
  return (
    <div className="resource-status">
      {resource.error ? (
        <div role="alert" className="error-banner">
          <strong>{label} 조회 실패</strong> · {resource.error}
          {!!resource.data && <span> · 이전 데이터 {dateTime(resource.successAt || null)}</span>}
        </div>
      ) : stale ? (
        <span className="status-chip caution">{label} · 업데이트 지연</span>
      ) : (
        <p role="status" className="empty">{label} 불러오는 중…</p>
      )}
    </div>
  );
}

export function Scope({ filters, compact = false }: { filters: PeriodFilters; compact?: boolean }) {
  const hasFilters = [filters.instanceId, filters.status, filters.eventType, filters.policyName, filters.processExecId].some(Boolean);
  if (compact && !hasFilters) return null;
  const format = new Intl.DateTimeFormat('ko-KR', {
    ...(Date.parse(filters.to) - Date.parse(filters.from) >= 86400000
      ? { month: 'numeric', day: 'numeric' }
      : {}),
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return (
    <div className="scope-chips" aria-label="표시 중인 데이터 범위">
      {!compact && <span className={`status-chip ${filters.source === 'sample' ? 'caution' : ''}`}>{sourceLabel(filters.source)}</span>}
      {filters.instanceId && <span className="status-chip">{filters.instanceId}</span>}
      {filters.status && <span className="status-chip">{filters.status === 'attention' ? '주의' : '관찰됨'}</span>}
      {filters.eventType && <span className="status-chip">{typeLabels[filters.eventType]}</span>}
      {filters.policyName && <span className="status-chip">{filters.policyName}</span>}
      {filters.processExecId && <span className="status-chip" title={filters.processExecId}>프로세스 필터 적용</span>}
      {!compact && <span className="status-chip" title={`${dateTime(filters.from)} ~ ${dateTime(filters.to)}`}>
        {format.format(new Date(filters.from))}
        {' – '}
        {format.format(new Date(filters.to))}
      </span>}
    </div>
  );
}

export function Stats({
  items,
}: {
  items: { label: string; value: number | string; tone?: string }[];
}) {
  return (
    <div className={`screen-stats count-${items.length}`}>
      {items.map((item) => (
        <article className={`metric ${item.tone || ''}`} key={item.label}>
          <span>{item.label}</span>
          <strong>{typeof item.value === 'number' ? number(item.value) : item.value}</strong>

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
        <h3>{explain ? '시간별 수집 이벤트 수' : '이벤트 · 주의 추이'}</h3>
        <span>
          {dashboard.bucketSeconds / 60}분당 건수
        </span>
      </div>
      {explain && (
        <p className="timeline-explanation">
          서버에서 보낸 프로세스 실행·파일 접근·네트워크 등 관찰 기록을 수신 시각으로 집계합니다.
          주의는 전체 중 경고 정책에 해당하는 기록이며, 공격 횟수는 아닙니다.
        </p>
      )}
      <div className="legend">
        <i className="dot blue" /> 전체 <i className="dot amber" /> 주의
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
              name="주의 (전체에 포함)"
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

      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>서버</th>
              <th>관찰 이벤트</th>
              <th>주의</th>
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

      </div>
      {items.length ? (
        <ResponsiveContainer width="100%" height={Math.max(220, items.length * 38)}>
          <BarChart data={items} layout="vertical" margin={{ left: 0, right: 15 }}>
            <CartesianGrid stroke="#242a33" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#a6b1c2' }} />
            <YAxis dataKey="instanceId" type="category" width={130} tick={{ fontSize: 12, fill: '#a6b1c2' }} />
            <Tooltip />
            <Bar dataKey="total" name="관찰 이벤트" fill="#22d3ee" isAnimationActive={false} />
            <Bar
              dataKey="attention"
              name="주의 (전체에 포함)"
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
