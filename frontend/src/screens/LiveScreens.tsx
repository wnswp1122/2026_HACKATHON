import { useState } from 'react';
import { api } from '../api';
import { Charts } from '../events/Charts';
import { EventTable } from '../events/EventTable';
import type { useDashboard } from '../events/useDashboard';
import { dateTime, number, type Dashboard, type PeriodFilters, type Selection } from '../types';
import {
  AnalysisAside,
  ResourceStatus,
  Scope,
  ServerBars,
  ServerTable,
  Stats,
  Timeline,
} from './Common';
import { NetworkGlobe, UnmappedNetwork } from './NetworkGlobe';
import { RelationshipGraph } from './RelationshipGraph';
import { usePeriodResource } from './useResource';

type Props = {
  selection: Selection;
  refresh: number;
  live: ReturnType<typeof useDashboard>;
  onDetail: (id: string) => void;
  onPage: (page: number) => void;
  onSelection: (selection: Selection) => void;
  onAnalyze: (filters?: PeriodFilters) => void;
};
function LiveStatus({ live }: Pick<Props, 'live'>) {
  return (
    <ResourceStatus
      label="전체 집계·목록"
      resource={{ ...live, data: live.data, successAt: live.data?.successAt }}
    />
  );
}
export function Overview(props: Props) {
  const network = usePeriodResource(api.network, props.selection, props.refresh);
  const { data } = props.live;
  return (
    <>
      <LiveStatus live={props.live} />
      {data && (
        <>
          <Scope filters={data.filters} />
          <Stats
            items={[
              {
                label: '전체 관찰 이벤트',
                value: data.dashboard.total,
                note: '선택 범위 · 수신 이벤트',
              },
              {
                label: '정책 일치',
                value: data.dashboard.attention,
                note: '공격·차단 성공 판정 아님',
                tone: 'warning',
              },
              {
                label: '네트워크 관찰',
                value: network.data?.value.totalNetworkEvents ?? '미확인',
                note: '별도 네트워크 API의 범위',
              },
              {
                label: '현재 수집 · live',
                value: data.dashboard.bySource.find((s) => s.source === 'live')?.count || 0,
                note: 'API에 저장된 live 출처',
              },
              {
                label: '예시·재생 · sample',
                value: data.dashboard.bySource.find((s) => s.source === 'sample')?.count || 0,
                note: '실제 수집과 분리',
              },
            ]}
          />
        </>
      )}
      <div className="overview-grid">
        <div>
          <ResourceStatus resource={network} label="관찰 연결·위치" />
          {network.data && (
            <>
              <Scope filters={network.data.filters} />
              <NetworkGlobe data={network.data.value} />
            </>
          )}
        </div>
        <div className="stack">
          {data && (
            <>
              <Timeline dashboard={data.dashboard} to={data.filters.to} />
              {network.data && <UnmappedNetwork data={network.data.value} />}
              <article className="panel recent-events">
                <div className="panel-heading">
                  <h3>최근 관찰 이벤트</h3>
                  <span>최신 목록 중 6건</span>
                </div>
                {data.events.items.slice(0, 6).map((event) => (
                  <button
                    className="recent-event"
                    key={event.eventId}
                    onClick={() => props.onDetail(event.eventId)}
                  >
                    <span className={`badge ${event.source}`}>{event.source}</span>
                    <span>
                      {event.instanceId}
                      <small>{event.eventType}</small>
                    </span>
                    <span className={event.status === 'attention' ? 'pink-text' : ''}>
                      {event.status === 'attention' ? '정책 일치' : '관찰'}
                    </span>
                  </button>
                ))}
                {!data.events.items.length && (
                  <p className="empty">선택 범위에 이벤트가 없습니다.</p>
                )}
              </article>
            </>
          )}
        </div>
      </div>
    </>
  );
}
export function Telemetry(props: Props) {
  const servers = usePeriodResource(api.servers, props.selection, props.refresh);
  const { data } = props.live;
  return (
    <>
      <LiveStatus live={props.live} />
      {data && <Scope filters={data.filters} />}
      <div className="telemetry-grid">
        <div className="stack">
          {data && (
            <>
              <Timeline dashboard={data.dashboard} to={data.filters.to} rate />
              <TimeWindow
                dashboard={data.dashboard}
                filters={data.filters}
                selection={props.selection}
                onSelection={props.onSelection}
              />
            </>
          )}
          <ResourceStatus resource={servers} label="서버별 집계" />
          {servers.data && (
            <>
              <Scope filters={servers.data.filters} />
              <ServerTable
                items={servers.data.value.items}
                onSelect={(id) => props.onSelection({ ...props.selection, instanceId: id })}
              />
            </>
          )}
          {data && (
            <EventTable
              events={data.events}
              loading={props.live.loading}
              onPage={props.onPage}
              onDetail={props.onDetail}
            />
          )}
        </div>
        <AnalysisAside onAnalyze={() => props.onAnalyze(data?.filters)} />
      </div>
    </>
  );
}
export function ServersScreen(props: Props) {
  const servers = usePeriodResource(api.servers, props.selection, props.refresh);
  const graph = usePeriodResource(api.graph, props.selection, props.refresh);
  const { data } = props.live;
  return (
    <>
      <LiveStatus live={props.live} />
      {data && (
        <>
          <Scope filters={data.filters} />
          <Stats
            items={[
              {
                label: '정책 일치',
                value: data.dashboard.attention,
                note: '공격 확정 아님',
                tone: 'warning',
              },
              {
                label: '관찰 이벤트',
                value: data.dashboard.total,
                note: '전체 범위의 수신 이벤트',
                tone: 'cyan-tile',
              },
              {
                label: '관찰 서버',
                value: servers.data?.value.items.length ?? '미확인',
                note: '보호율·보안 정상 판정 아님',
              },
              {
                label: '격리·차단 성공',
                value: '미확인',
                note: '현재 outcome=unknown',
                tone: 'amber-tile',
              },
            ]}
          />
        </>
      )}
      <ResourceStatus resource={servers} label="서버 분포" />
      {servers.data && <Scope filters={servers.data.filters} />}
      <div className="server-dashboard-grid">
        <div className="stack">
          {servers.data && (
            <>
              <ServerBars items={servers.data.value.items} />
              <ServerTable
                items={servers.data.value.items}
                onSelect={(id) => props.onSelection({ ...props.selection, instanceId: id })}
              />
            </>
          )}
        </div>
        <div className="stack">
          {data && <Charts data={data.dashboard} />}
          <ResourceStatus resource={graph} label="프로세스·통신 관계" />
          {graph.data && (
            <>
              <Scope filters={graph.data.filters} />
              <RelationshipGraph graph={graph.data.value} />
            </>
          )}
        </div>
      </div>
      <p className="hint">
        관찰 서버 {servers.data ? number(servers.data.value.items.length) : '미확인'}대는 선택
        범위에 이벤트가 있는 서버입니다. 준비 상태는 별도 준비 점검에서 확인합니다.
      </p>
      <AnalysisAside onAnalyze={() => props.onAnalyze(data?.filters)} />
    </>
  );
}

function TimeWindow({
  dashboard,
  filters,
  selection,
  onSelection,
}: {
  dashboard: Dashboard;
  filters: PeriodFilters;
  selection: Selection;
  onSelection: (value: Selection) => void;
}) {
  const [window, setWindow] = useState<{
    dashboard: Dashboard;
    filters: PeriodFilters;
    start: number;
    end: number;
  }>();
  const value = window || { dashboard, filters, start: 0, end: dashboard.timeline.length };
  const rows = value.dashboard.timeline;
  if (!rows.length) return null;
  const from = rows[value.start]?.bucketStart || value.filters.from;
  const to = rows[value.end]?.bucketStart || value.filters.to;
  const max = Math.max(1, ...rows.map((row) => row.count));
  const local = (date: string) => {
    const d = new Date(date);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 23);
  };
  return (
    <article className="panel time-window">
      <div className="panel-heading">
        <h3>수신 기간 구간 선택</h3>
        <span>조작 중에는 선택 기준을 고정합니다.</span>
      </div>
      <div className="mini-timeline">
        {rows.map((row, i) => (
          <span
            key={row.bucketStart}
            style={{
              height: `${Math.max(3, (row.count / max) * 100)}%`,
              opacity: i >= value.start && i < value.end ? 1 : 0.2,
            }}
            title={`${dateTime(row.bucketStart)} · ${row.count}건`}
          />
        ))}
      </div>
      <div className="window-controls">
        <label>
          구간 시작
          <input
            aria-label="구간 시작 버킷"
            type="range"
            min="0"
            max={rows.length - 1}
            value={value.start}
            onChange={(e) =>
              setWindow({
                ...value,
                start: Number(e.target.value),
                end: Math.max(value.end, Number(e.target.value) + 1),
              })
            }
          />
        </label>
        <label>
          구간 종료
          <input
            aria-label="구간 종료 버킷"
            type="range"
            min="1"
            max={rows.length}
            value={value.end}
            onChange={(e) =>
              setWindow({
                ...value,
                end: Number(e.target.value),
                start: Math.min(value.start, Number(e.target.value) - 1),
              })
            }
          />
        </label>
        <button
          onClick={() =>
            onSelection({ ...selection, period: 'custom', from: local(from), to: local(to) })
          }
        >
          선택 구간 적용
        </button>
        <button onClick={() => setWindow(undefined)}>구간 초기화</button>
      </div>
      <p className="hint">
        {dateTime(from)} ~ {dateTime(to)} · 종료 제외
      </p>
    </article>
  );
}
