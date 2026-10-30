import { api } from '../api';
import { Charts } from '../events/Charts';
import { EventTable } from '../events/EventTable';
import type { useDashboard } from '../events/useDashboard';
import { dateTime, number, typeLabels, type Selection } from '../types';
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
export function Overview(props: Props) {
  const network = usePeriodResource(api.network, props.selection, props.refresh);
  const { data } = props.live;
  return (
    <>
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
      <LiveStatus live={props.live} />
      {data && (
        <>
          <div className={`attention-summary ${data.dashboard.attention ? 'has-matches' : ''}`}>
            <div>
              <span className="dot" />
              <strong>{data.dashboard.attention ? `주의 ${number(data.dashboard.attention)}건` : data.dashboard.total ? '주의 없음' : '관찰 이벤트 없음'}</strong>
            </div>
            {data.dashboard.attention > 0 && (
              <button disabled={props.live.loading || !!props.live.error} onClick={() => props.onSelection({ ...props.selection, status: props.selection.status === 'attention' ? undefined : 'attention' })}>
                {props.selection.status === 'attention' ? '전체 이벤트 보기' : '주의만 보기'} →
              </button>
            )}
          </div>
          <p className="policy-explanation">주의란? 이벤트의 정책명이 등록된 경고 정책명과 일치한다는 뜻입니다. 공격 확정이나 차단 성공을 뜻하지 않습니다.</p>
          <Stats items={[
            { label: '관찰 이벤트', value: data.dashboard.total },
            { label: '주의', value: data.dashboard.attention, tone: data.dashboard.attention ? 'warning' : '' },
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
                >주의만</button>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>수신 시각</th><th>서버</th><th>유형</th><th>정책</th><th>출처</th><th>상태</th><th>상세</th></tr></thead>
                <tbody>
                  {data.events.items.slice(0, 6).map((event) => (
                    <tr key={event.eventId} className={event.status === 'attention' ? 'log-attention' : ''}>
                      <td title={dateTime(event.receivedAt)}>{new Date(event.receivedAt).toLocaleTimeString('ko-KR', { hour12: false })}</td>
                      <td>{event.instanceId}</td>
                      <td>{typeLabels[event.eventType]}</td>
                      <td>{event.policyName || '—'}</td>
                      <td><span className={`badge ${event.source}`}>{event.source}</span></td>
                      <td className={event.status === 'attention' ? 'pink-text' : ''}>{event.status === 'attention' ? '주의' : '관찰'}</td>
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
                label: '주의',
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
