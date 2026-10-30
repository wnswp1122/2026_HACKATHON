import { dateTime, serverName, type Readiness, type ReadinessItem } from '../types';
import { ResourceStatus } from './Common';
import type { Resource } from './useResource';

export function readinessDescription(item: ReadinessItem): string {
  if (!item.report) return '상태 보고 미수신 · 센서가 동작하는지 아직 확인할 수 없습니다.';
  if (item.state === 'stale') return '상태 보고가 오래되었습니다. 서버의 상태 전송이 계속되는지 확인하세요.';
  if (item.state === 'error') return '수집 오류가 보고되었습니다. 준비 점검에서 오류 항목을 확인하세요.';
  if (item.state === 'ready') return '저장된 보고에서 센서와 정책의 수집 준비를 확인했습니다.';
  if (!item.report.tetragon.sensors.length) return '상태 보고는 수신했지만 센서 상태는 미확인입니다.';
  if (item.state === 'warning') return '센서 또는 정책 설정에 주의가 필요합니다. 준비 점검을 확인하세요.';
  return '상태 보고는 수신했지만 수집 준비 여부는 아직 확인되지 않았습니다.';
}

export function CollectionStatus({ resource, instanceId, onReadiness }: {
  resource: Resource<Readiness>;
  instanceId?: string;
  onReadiness: () => void;
}) {
  const items = resource.data?.items.filter((item) => !instanceId || item.instanceId === instanceId);
  return <section className="panel collection-status" aria-label="실제 수집 상태">
    <div className="panel-heading"><h3>실제 수집 상태</h3><button onClick={onReadiness}>수집·정책 준비 점검 →</button></div>
    <ResourceStatus label="수집 상태" resource={resource} />
    {items && !items.length && <p role="status">{instanceId ? '선택한 서버의 상태 조회 대상이 없습니다. 모니터링 대상 설정을 확인하세요.' : '모니터링 대상 서버가 없습니다. 서버 설정 후 모니터링 설정에서 다시 조회하세요.'}</p>}
    {items?.slice(0, 3).map((item) => <p key={item.instanceId}>
      <strong>{serverName(item.instanceId)}</strong> · {readinessDescription(item)}
      {item.receivedAt && <small>최근 상태 수신 {dateTime(item.receivedAt)}</small>}
    </p>)}
    {items && items.length > 3 && <p>외 {items.length - 3}대 · 준비 점검에서 전체 서버를 확인하세요.</p>}
    <p className="hint">이벤트 수신과 센서 상태 보고는 별개입니다. 이벤트가 없거나 상태가 미확인인 것만으로 안전을 판단하지 않습니다.</p>
  </section>;
}
