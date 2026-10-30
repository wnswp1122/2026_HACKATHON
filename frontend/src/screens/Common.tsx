import { serverName } from '../types';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  dateTime,
  number,
  type Dashboard,
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
        <span className="hint">{label} · 업데이트 지연</span>
      ) : (
        <p role="status" className="empty">{label} 불러오는 중…</p>
      )}
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
        <h3>{explain ? '초당 수집 이벤트' : '이벤트 · 위험 추이'}</h3>
        <span>
          건/초 · {dashboard.bucketSeconds / 60}분 평균
        </span>
      </div>
      {explain && (
        <p className="timeline-explanation">
          프로세스 실행·파일 접근·네트워크 관찰 기록을 수신 시각으로 집계해 초당 평균을 표시합니다.
          위험은 전체 중 경고 정책에 해당하는 기록이며, 공격 횟수는 아닙니다.
        </p>
      )}
      <div className="legend">
        <i className="dot status-observed" /> 안전 <i className="dot status-attention" /> 위험
      </div>
      {explain && <p className="timeline-axis-caption">수신 시각 · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>}
      <div className="chart">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={dashboard.timeline.map((row) => ({ ...row, safe: (row.count - row.attention) / dashboard.bucketSeconds, attention: row.attention / dashboard.bucketSeconds }))} margin={{ top: 12, right: 10, left: -15, bottom: 0 }}>
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
            <Tooltip labelFormatter={(v) => dateTime(String(v))} formatter={(value, name) => [`${Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}건/초`, name]} />
            <Area
              name="안전"
              dataKey="safe"
              stroke="var(--status-safe)"
              fill="var(--status-safe-fill)"
              isAnimationActive={false}
            />
            <Area
              name="위험"
              dataKey="attention"
              stroke="var(--status-danger)"
              fill="var(--status-danger-fill)"
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
              <th>위험</th>
              <th>최근 수신 · 전체 출처</th>
              {onSelect && <th>필터</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.instanceId}>
                <td>{serverName(s.instanceId)}</td>
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
        <h3>서버별 안전·위험 이벤트</h3>

      </div>
      {items.length ? (
        <div className="server-comparison">
          <div className="legend"><i className="dot status-observed" />안전 <i className="dot status-attention" />위험</div>
          {items.map((item) => (
            <div className="server-comparison-row" key={item.instanceId}>
              <div className="server-comparison-label"><span>{serverName(item.instanceId)}</span><strong>{number(item.total)}건</strong></div>
              <div className="server-comparison-track" role="img" aria-label={`${serverName(item.instanceId)} 안전 ${number(item.total - item.attention)}건, 위험 ${number(item.attention)}건`}>
                <span className="server-comparison-safe" style={{ width: `${item.total ? (item.total - item.attention) / Math.max(...items.map((s) => s.total)) * 100 : 0}%` }} />
                <span className="server-comparison-risk" style={{ width: `${item.total ? item.attention / Math.max(...items.map((s) => s.total)) * 100 : 0}%` }} />
              </div>
              <small>안전 {number(item.total - item.attention)} · 위험 {number(item.attention)}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">관찰된 서버 데이터가 없습니다.</p>
      )}
    </article>
  );
}
