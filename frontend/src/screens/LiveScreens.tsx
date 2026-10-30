import { api } from '../api';
import { Charts } from '../events/Charts';
import { EventTable } from '../events/EventTable';
import { describeEvent } from '../events/describeEvent';
import type { useDashboard } from '../events/useDashboard';
import { dateTime, number, statusLabels, typeLabels, type PeriodFilters, type Selection } from '../types';
import {
  ResourceStatus,
  Scope,
  ServerBars,
  ServerTable,
  Stats,
  Timeline,
} from './Common';
import { NetworkGlobe } from './NetworkGlobe';
import { RelationshipGraph } from './RelationshipGraph';
import { usePeriodResource } from './useResource';

type Props = {
  selection: Selection;
  refresh: number;
  live: ReturnType<typeof useDashboard>;
  onDetail: (id: string) => void;
  selectedDetailId: string;
  onPage: (page: number) => void;
  onSelection: (selection: Selection) => void;
};
function LiveStatus({ live }: Pick<Props, 'live'>) {
  return (
    <ResourceStatus
      label="전체 집계·목록"
      resource={{ ...live, data: live.data, successAt: live.data?.successAt }}
    />
  );
}
const fetchRiskEvents = (filters: PeriodFilters, signal: AbortSignal) =>
  api.events({ ...filters, status: 'attention' }, 1, signal);

export function Overview(props: Props) {
  const network = usePeriodResource(api.network, props.selection, props.refresh);
  const { data } = props.live;
  const risks = usePeriodResource(fetchRiskEvents, props.selection, props.refresh, !!data?.dashboard.attention);
  const sameRiskScope = !!data?.dashboard.attention && data && risks.data &&
    (['instanceId', 'source', 'eventType', 'status', 'processExecId', 'policyName'] as const)
      .every((key) => risks.data!.filters[key] === data.filters[key]) &&
    (props.selection.period !== 'custom' ||
      (risks.data.filters.from === data.filters.from && risks.data.filters.to === data.filters.to));
  const riskCount = sameRiskScope ? risks.data!.value.total : data?.dashboard.attention || 0;
  return (
    <>
      <LiveStatus live={props.live} />
      {data && (
        <section className={`risk-summary ${riskCount ? 'has-risk' : data.dashboard.total ? 'has-safe' : ''}`} aria-label="이벤트 안전·위험 요약">
          <div className="attention-summary">
            <div><span className="dot" /><strong>{riskCount ? `위험 ${number(riskCount)}건` : data.dashboard.total ? `안전 ${number(data.dashboard.total)}건` : '관찰 이벤트 없음'}</strong></div>
            {riskCount > 0 && <button disabled={props.live.loading || !!props.live.error} onClick={() => props.onSelection({ ...props.selection, status: props.selection.status === 'attention' ? undefined : 'attention' })}>
              {props.selection.status === 'attention' ? '전체 이벤트 보기' : '위험만 보기'} →
            </button>}
          </div>
          {riskCount > 0 && <>
            <ResourceStatus resource={risks} label="위험 이벤트" />
            {sameRiskScope ? <div className="risk-events">
              {risks.data!.value.items.slice(0, 4).map((event) => (
                <button className="risk-event" key={event.eventId} onClick={() => props.onDetail(event.eventId)}>
                  <time title={dateTime(event.receivedAt)}>{new Date(event.receivedAt).toLocaleTimeString('ko-KR', { hour12: false })}</time>
                  <span>{event.instanceId}</span>
                  <span>{describeEvent(event)}</span>
                  <span className="badge attention">상세 보기 →</span>
                </button>
              ))}
            </div> : !!risks.data && !risks.error && <p role="status" className="empty">현재 범위의 위험 이벤트 불러오는 중…</p>}
          </>}
        </section>
      )}
      <ResourceStatus resource={network} label="네트워크" />
      {network.data && (
        <>
          <Scope filters={network.data.filters} />
          <NetworkGlobe
            data={network.data.value}
            status={network.data.filters.status}
            disabled={network.loading}
            onStatusChange={(status) => props.onSelection({ ...props.selection, status })}
          />
        </>
      )}
      {data && (
        <>
          <Stats items={[
            { label: '관찰 이벤트', value: data.dashboard.total },
            { label: '안전', value: data.dashboard.total - data.dashboard.attention, tone: 'safe' },
            { label: '위험', value: data.dashboard.attention, tone: data.dashboard.attention ? 'warning' : '' },
            { label: '네트워크 이벤트', value: network.data?.value.totalNetworkEvents ?? '—' },
          ]} />
        </>
      )}
      {data && (
        <div className="overview-details">
          <Timeline dashboard={data.dashboard} />
          <article className="panel recent-events overview-logs">
            <div className="panel-heading">
              <h3>최근 이벤트</h3>
              <div className="log-actions">
                <span>{Math.min(6, data.events.items.length)}건</span>
                <button
                  aria-pressed={data.filters.status === 'attention'}
                  disabled={props.live.loading}
                  onClick={() => props.onSelection({ ...props.selection, status: props.selection.status === 'attention' ? undefined : 'attention' })}
                >위험만</button>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>수신 시각</th><th>서버</th><th>유형</th><th>정책</th><th>출처</th><th>상태</th><th>상세</th></tr></thead>
                <tbody>
                  {data.events.items.slice(0, 6).map((event) => (
                    <tr key={event.eventId} className={`${event.status === 'attention' ? 'log-attention' : ''} ${props.selectedDetailId === event.eventId ? 'selected-event' : ''}`}>
                      <td title={dateTime(event.receivedAt)}>{new Date(event.receivedAt).toLocaleTimeString('ko-KR', { hour12: false })}</td>
                      <td>{event.instanceId}</td>
                      <td>{typeLabels[event.eventType]}</td>
                      <td>{event.policyName || '—'}</td>
                      <td><span className={`badge ${event.source}`}>{event.source}</span></td>
                      <td><span className={`badge ${event.status}`}>{statusLabels[event.status]}</span></td>
                      <td><button aria-label={`${event.instanceId} ${typeLabels[event.eventType]} 이벤트 상세`} onClick={() => props.onDetail(event.eventId)}>보기</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.events.items.length && <p className="empty">이벤트 없음</p>}
          </article>
        </div>
      )}
    </>
  );
}
export function Telemetry(props: Props) {
  const servers = usePeriodResource(api.servers, props.selection, props.refresh);
  const { data } = props.live;
  return (
    <>
      <LiveStatus live={props.live} />
      {data && <Scope filters={data.filters} compact />}
      <div className="telemetry-grid">
        <div className="stack">
          {data && <Timeline dashboard={data.dashboard} explain />}
          <ResourceStatus resource={servers} label="서버별 집계" />
          {servers.data && (
            <>
              <Scope filters={servers.data.filters} compact />
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
              selectedId={props.selectedDetailId}
            />
          )}
        </div>
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
                label: '위험',
                value: data.dashboard.attention,
                tone: 'warning',
              },
              {
                label: '관찰 이벤트',
                value: data.dashboard.total,
                tone: 'cyan-tile',
              },
              {
                label: '관찰 서버',
                value: servers.data?.value.items.length ?? '미확인',
              },
              {
                label: '격리·차단 성공',
                value: '미확인',
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
        </div>
        <div className="stack server-relationships">
          <ResourceStatus resource={graph} label="프로세스·통신 관계" />
          {graph.data && (
            <>
              <Scope filters={graph.data.filters} />
              <RelationshipGraph graph={graph.data.value} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
