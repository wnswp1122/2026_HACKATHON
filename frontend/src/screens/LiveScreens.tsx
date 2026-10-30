import { serverName } from '../types';
import { api } from '../api';
import { Charts } from '../events/Charts';
import { EventTable } from '../events/EventTable';
import { describeEvent } from '../events/describeEvent';
import type { useDashboard } from '../events/useDashboard';
import { dateTime, number, statusLabels, typeLabels, type PeriodFilters, type Selection } from '../types';
import {
  ResourceStatus,
  ServerBars,
  ServerTable,
  Stats,
  Timeline,
} from './Common';
import { NetworkGlobe } from './NetworkGlobe';
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
    <>
      <ResourceStatus label="전체 집계·목록" resource={{ ...live, data: live.data, successAt: live.data?.successAt }} />
      {live.data && !live.error && live.data.dashboard.total === 0 && <div className="notice" role="status">
        <strong>선택한 기간과 조건에 맞는 이벤트가 없습니다.</strong>
        <p>조회 기간을 넓히거나 상세 필터를 해제해 보세요.{live.data.filters.source === 'live' && ' 실제 수집 데이터가 계속 없다면 준비 점검과 서버의 이벤트 전송을 확인하세요.'}</p>
      </div>}
      {live.data?.filters.source === 'sample' && live.data.dashboard.simulation && <p className="hint" role="note">
        sample 환산 집계 · 대표 원본 {number(live.data.dashboard.simulation.representativeEvents)}건으로 활동 규모를 표현합니다.
        상세 목록·관계·조사·AI 분석은 대표 원본 기준입니다.
      </p>}
    </>
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
  const riskCount = data?.dashboard.attention || 0;
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
                  <span>{serverName(event.instanceId)}</span>
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
            { label: '전체 위험 이벤트', value: data.dashboard.attention, tone: data.dashboard.attention ? 'warning' : '' },
            { label: '네트워크 이벤트', value: network.data?.value.totalNetworkEvents ?? '—' },
          ]} />
        </>
      )}
      {data && (
        <div className="overview-details">
          <Timeline dashboard={data.dashboard} />
          <article className="panel recent-events overview-logs">
            <div className="panel-heading">
              <h3>{data.dashboard.simulation ? '최근 대표 이벤트' : '최근 이벤트'}</h3>
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
                    <tr key={event.eventId} className={event.status === 'attention' ? 'log-attention' : ''}>
                      <td title={dateTime(event.receivedAt)}>{new Date(event.receivedAt).toLocaleTimeString('ko-KR', { hour12: false })}</td>
                      <td>{serverName(event.instanceId)}</td>
                      <td>{typeLabels[event.eventType]}</td>
                      <td>{event.policyName || '—'}</td>
                      <td><span className={`badge ${event.source}`}>{event.source}</span></td>
                      <td><span className={`badge ${event.status}`}>{statusLabels[event.status]}</span></td>
                      <td><button aria-label={`${serverName(event.instanceId)} ${typeLabels[event.eventType]} 이벤트 상세`} onClick={() => props.onDetail(event.eventId)}>보기</button></td>
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
      <div className="telemetry-grid">
        <div className="stack">
          {data && <Timeline dashboard={data.dashboard} explain />}
          <ResourceStatus resource={servers} label="서버별 집계" />
          {servers.data && (
            <>
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
  const { data } = props.live;
  return (
    <>
      <LiveStatus live={props.live} />
      {data && (
        <>
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
                label: data.filters.source === 'sample' ? '격리·차단 성공 · 시연' : '격리·차단 성공',
                value: data.filters.source === 'sample' ? '확인' : '미확인',
                tone: 'amber-tile',
              },
            ]}
          />
        </>
      )}
      <ResourceStatus resource={servers} label="서버 분포" />
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

      </div>
    </>
  );
}
