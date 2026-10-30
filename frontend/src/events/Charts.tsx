import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { number, typeLabels, type Dashboard } from '../types';
const colors = ['#a78bfa', '#60a5fa', '#22d3ee', '#ff3b5c', '#8b93a0'];
export function Metrics({ data }: { data: Dashboard }) {
  return (
    <div className="metrics">
      <article className="metric">
        <span>전체 관찰 이벤트</span>
        <strong>
          {number(data.total)}
          <small>건</small>
        </strong>
        <p>선택한 필터의 전체 범위</p>
      </article>
      <article className="metric warning">
        <span>위험</span>
        <strong>
          {number(data.attention)}
          <small>건</small>
        </strong>
        <p>등록한 경고 정책과 일치</p>
      </article>
      <article className="metric">
        <span>현재 수집 · live</span>
        <strong>
          {number(data.bySource.find((s) => s.source === 'live')?.count || 0)}
          <small>건</small>
        </strong>
        <p>공격·차단 성공을 뜻하지 않음</p>
      </article>
      <article className="metric">
        <span>예시/재생 · sample</span>
        <strong>
          {number(data.bySource.find((s) => s.source === 'sample')?.count || 0)}
          <small>건</small>
        </strong>
        <p>실제 수집 데이터와 구분</p>
      </article>
    </div>
  );
}
export function Charts({ data, fixed = false }: { data: Dashboard; fixed?: boolean }) {
  const timeline = (
    <AreaChart
      width={fixed ? 650 : undefined}
      height={fixed ? 220 : undefined}
      data={data.timeline.map((row) => ({ ...row, safe: row.count - row.attention }))}
      margin={{ top: 12, right: 16, bottom: 0, left: -15 }}
    >
      <CartesianGrid vertical={false} stroke="#242a33" />
      <XAxis
        dataKey="bucketStart"
        tickFormatter={(v) =>
          new Date(v).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
        }
        tick={{ fontSize: 11 }}
        minTickGap={45}
      />
      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
      {!fixed && (
        <Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString('ko-KR')} />
      )}
      <Area
        name="안전"
        dataKey="safe"
        stackId="status"
        stroke="var(--status-safe)"
        fill="var(--status-safe-fill)"
        strokeWidth={2}
        isAnimationActive={false}
      />
      <Area
        name="위험"
        dataKey="attention"
        stackId="status"
        stroke="var(--status-danger)"
        fill="var(--status-danger-fill)"
        strokeWidth={2}
        isAnimationActive={false}
      />
    </AreaChart>
  );
  const types = data.byType.filter((t) => t.count > 0);
  const pie = (
    <PieChart width={fixed ? 180 : undefined} height={fixed ? 180 : undefined}>
      <Pie
        data={types}
        nameKey="eventType"
        dataKey="count"
        innerRadius={48}
        outerRadius={72}
        isAnimationActive={false}
      >
        {types.map((t) => (
          <Cell
            key={t.eventType}
            fill={colors[data.byType.findIndex((v) => v.eventType === t.eventType) % colors.length]}
          />
        ))}
      </Pie>
      {!fixed && (
        <Tooltip
          formatter={(v, name) => [v, typeLabels[name as keyof typeof typeLabels] || name]}
        />
      )}
    </PieChart>
  );
  return (
    <div className={`charts ${fixed ? 'fixed-charts' : ''}`}>
      <article className="panel">
        <div className="panel-heading">
          <h3>이벤트 수신 추이</h3>
          <span>{data.bucketSeconds / 60}분 단위</span>
        </div>
        <div className="legend">
          <i className="dot status-observed" /> 안전 <i className="dot status-attention" /> 위험
        </div>
        <div className="chart">
          {fixed ? (
            timeline
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              {timeline}
            </ResponsiveContainer>
          )}
        </div>
      </article>
      <article className="panel">
        <div className="panel-heading">
          <h3>유형별 분포</h3>
          <span>전체 {number(data.total)}건</span>
        </div>
        {data.total === 0 ? (
          <div className="chart-empty">선택 범위에 이벤트가 없습니다.</div>
        ) : (
          <div className="distribution">
            <div className="pie">
              {fixed ? (
                pie
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  {pie}
                </ResponsiveContainer>
              )}
            </div>
            <ul>
              {data.byType.map((t, i) => (
                <li key={t.eventType}>
                  <span>
                    <i className="dot" style={{ backgroundColor: colors[i % colors.length] }} />
                    {typeLabels[t.eventType]}
                  </span>
                  <b>{number(t.count)}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </div>
  );
}
