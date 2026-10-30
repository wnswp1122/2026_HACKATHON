import { serverName } from './types';
import { useState } from 'react';
import { routes } from './navigation';
import type { Selection, Source } from './types';

export function MonitoringSetup({ selection, instances, loading, error, onRetry, onStart, onCancel }: {
  selection: Selection;
  instances: string[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onStart: (instanceId: string | undefined, source: Source) => void;
  onCancel?: () => void;
}) {
  const [instanceId, setInstanceId] = useState(selection.instanceId || '');
  const [source, setSource] = useState<Source>(selection.source || 'live');
  return (
    <main className="setup-screen">
      <div className="setup-content">
        <div className="brand"><span className="brand-icon">L</span><b>LiteSOC</b></div>
        <h1>모니터링할 서버를 선택하세요</h1>
        <p className="setup-description">한 번 설정하면 같은 서버의 데이터를 5개 모니터링 화면에서 확인할 수 있습니다.</p>
        <form className="panel setup-form" onSubmit={(event) => {
          event.preventDefault();
          onStart(instanceId || undefined, source);
        }}>
          <label htmlFor="setup-instance">인스턴스 <span>· 모니터링 대상 서버</span></label>
          <select id="setup-instance" value={instanceId} onChange={(event) => setInstanceId(event.target.value)}>
            <option value="">전체 인스턴스</option>
            {instanceId && !instances.includes(instanceId) && <option value={instanceId}>{serverName(instanceId)}</option>}
            {instances.map((id) => <option key={id} value={id}>{serverName(id)}</option>)}
          </select>
          {error ? <div role="alert" className="error-text">서버 목록 조회 실패 · {error} <button type="button" onClick={onRetry}>다시 조회</button></div>
            : loading ? <p role="status">서버 목록을 불러오는 중…</p>
            : !instances.length && <p className="setup-description">선택할 서버가 없습니다. 서버의 모니터링 대상 설정을 확인한 뒤 다시 조회하세요. 전체 인스턴스로 시작하면 수신되는 이벤트를 확인할 수 있습니다.</p>}
          <p className="setup-description">서버 목록에는 상태 보고나 이벤트가 아직 도착하지 않은 모니터링 대상도 포함됩니다. 수집 여부는 시작 후 준비 점검에서 확인하세요.</p>
          <fieldset className="setup-sources">
            <legend>조회할 데이터</legend>
            <label className={source === 'live' ? 'selected' : ''}>
              <input type="radio" name="source" value="live" checked={source === 'live'} onChange={() => setSource('live')} />
              <span><strong>실제 수집 데이터 <small>live</small></strong><span>연결한 서버에서 수집해 전송한 이벤트입니다.</span></span>
            </label>
            <label className={source === 'sample' ? 'selected' : ''}>
              <input type="radio" name="source" value="sample" checked={source === 'sample'} onChange={() => setSource('sample')} />
              <span><strong>예시 데이터 <small>sample</small></strong><span>화면 체험·시연용 이벤트입니다. 실제 수집 결과와 구분합니다.</span></span>
            </label>
          </fieldset>
          <p className="setup-description">선택한 대상은 이 탭에서 유지됩니다. 시작 후 상단의 ‘모니터링 설정’에서 변경할 수 있습니다.</p>
          <div className="setup-actions">
            {onCancel && <button type="button" onClick={onCancel}>취소</button>}
            <button className="primary" type="submit">모니터링 시작 →</button>
          </div>
        </form>
        <div className="setup-previews" aria-label="설정 후 사용할 모니터링 화면">
          {routes.map((route, index) => <span key={route.path}><small>0{index + 1}</small>{route.label}</span>)}
        </div>
      </div>
    </main>
  );
}
