import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Incident } from './api';

export function IncidentTrend({ items, period }: { items: Incident[]; period: string }) {
  const data = useMemo(() => {
    const end = Date.now();
    const times = items.map((item) => Date.parse(item.firstSeenAt || '')).filter(Number.isFinite);
    const start = period === 'all'
      ? Math.min(end - 6 * 3_600_000, ...times)
      : end - Number(period) * 3_600_000;
    const step = (end - start) / 12;
    const points = Array.from({ length: 13 }, (_, index) => {
      const at = start + index * step;
      return {
        label: end - start > 48 * 3_600_000
          ? new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(at)
          : new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(at),
        count: 0,
      };
    });
    for (const time of times) {
      if (time < start || time > end) continue;
      points[Math.min(12, Math.floor((time - start) / step))].count++;
    }
    return points;
  }, [items, period]);
  return <div className="incident-trend" role="img" aria-label={`사건 최초 발생 시각 기준 추이. 총 ${items.length}건`}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 12, left: -26, bottom: 0 }}>
        <CartesianGrid stroke="#2b3442" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="label" interval={2} tick={{ fill: '#8996aa', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} domain={[0, 'dataMax + 1']} tick={{ fill: '#8996aa', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: '#1c2533', border: '1px solid #47536a', borderRadius: 8, fontSize: 11 }} formatter={(value) => [`${value}건`, '신규 사건']} />
        <Line type="linear" dataKey="count" stroke="#8b83ff" strokeWidth={2.5} dot={{ fill: '#afaaff', r: 3 }} activeDot={{ r: 5, fill: '#e5e2ff' }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
