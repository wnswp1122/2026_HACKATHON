import { useCallback } from 'react';
import { api } from '../api';
import {
  dateTime,
  selectionFilters,
  type ComponentState,
  type PeriodFilters,
  type ReadinessItem,
  type Selection,
} from '../types';
import { AnalysisAside, ResourceStatus, Stats } from './Common';
import { useResource } from './useResource';
const labels: Record<ReadinessItem['state'], string> = {
  ready: '수집 준비 확인',
  warning: '주의 필요',
  error: '오류',
  unknown: '미확인',
  stale: '오래된 보고',
};
const componentLabels: Record<ComponentState, string> = {
  enabled: '활성',
  disabled: '비활성',
  error: '오류',
  unknown: '미확인',
};
export function ReadinessScreen({
  selection,
  refresh,
  onAnalyze,
  onSelectInstance,
}: {
  selection: Selection;
  refresh: number;
  onAnalyze: (filters?: PeriodFilters) => void;
  onSelectInstance: (id: string) => void;
}) {
  const source = selection.source;
  const load = useCallback(
    async (signal: AbortSignal) => ({
      value: await api.readiness(selection.instanceId, source || 'live', signal),
      source: source || 'live',
      instanceId: selection.instanceId,
    }),
    [selection.instanceId, source],
  );
  const resource = useResource(load, refresh, !!source);
  if (!source)
    return (
      <div className="notice" role="status">
        준비 점검은 출처를 혼합하지 않습니다. 상단 모니터링 설정에서 실제 수집 또는 예시 데이터를 선택하세요.
      </div>
    );
  const data = resource.data?.value;
  const shownSource = resource.data?.source || source;
  return (
    <>
      <ResourceStatus label={`수집·정책 상태 · ${source}`} resource={resource} />
      {data && (
        <>
          <p className="scope">
            대상 {resource.data?.instanceId || '전체 허용 인스턴스'} · 출처 {shownSource} · 서버
            판정 시각 {dateTime(data.generatedAt)} · {data.staleAfterSeconds}초 초과 stale · 조회는
            원격 점검 명령이 아닌 저장된 보고 읽기입니다.
          </p>
          <Stats
            items={(['ready', 'warning', 'error', 'unknown', 'stale'] as const).map((state) => ({
              label: labels[state],
              value: data.items.filter((item) => item.state === state).length,
              note: '허용 인스턴스의 상태 보고 기준',
              tone: state === 'error' ? 'warning' : '',
            }))}
          />
          <div className="readiness-grid">
            <article className="panel readiness-checks">
              <div className="panel-heading">
                <h3>수집·정책 점검표</h3>
                <span>보안 점수·취약점 검사 아님</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>서버 / 항목</th>
                      <th>저장된 결과</th>
                      <th>확인 근거</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.flatMap((item) => [
                      <tr key={`${item.instanceId}-state`}>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => onSelectInstance(item.instanceId)}
                          >
                            {item.instanceId}
                          </button>
                        </td>
                        <td>
                          <span className={`badge ${item.state}`}>{labels[item.state]}</span>
                        </td>
                        <td className="wrap-cell">{item.reason || '추가 사유 없음'}</td>
                      </tr>,
                      <tr key={`${item.instanceId}-collector`}>
                        <td>상태 수집기</td>
                        <td>{item.report?.collector.state || '미확인'}</td>
                        <td className="wrap-cell">
                          {item.report?.collector.errorCode ||
                            (item.report ? '오류 코드 없음' : '보고 미확인')}
                        </td>
                      </tr>,
                      <tr key={`${item.instanceId}-reachable`}>
                        <td>Tetragon 조회</td>
                        <td>
                          {item.report?.tetragon.reachable === true
                            ? '조회 가능'
                            : item.report?.tetragon.reachable === false
                              ? '조회 실패'
                              : '미확인'}
                        </td>
                        <td>버전 {item.report?.tetragon.version || '미확인'}</td>
                      </tr>,
                      <tr key={`${item.instanceId}-time`}>
                        <td>보고 시각</td>
                        <td>
                          관찰 {dateTime(item.observedAt)}
                          <small>수신 {dateTime(item.receivedAt)}</small>
                        </td>
                        <td>과거 보고를 새 보고로 대체하지 않음</td>
                      </tr>,
                    ])}
                  </tbody>
                </table>
              </div>
              {!data.items.length && <p className="empty">허용 인스턴스의 상태 항목이 없습니다.</p>}
              <p className="notice">
                ready는 수집 준비 상태입니다. 서버 보안 정상·차단 성공·취약점 없음이라는 뜻이
                아닙니다. 센서·정책·상태 전송 중단은 보고 시각과 사유를 함께 확인하세요.
              </p>
            </article>
            <div className="stack">
              {(['sensors', 'policies'] as const).map((key) => (
                <article className="panel" key={key}>
                  <div className="panel-heading">
                    <h3>{key === 'sensors' ? '센서 상태' : '정책 로드·오류'}</h3>
                    <span>저장된 {shownSource} 상태 보고</span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>서버 / 이름</th>
                          <th>상태</th>
                          <th>오류 요약</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.flatMap((item) =>
                          (item.report?.tetragon[key] || []).map((component) => (
                            <tr key={`${item.instanceId}-${component.name}`}>
                              <td>
                                {component.name}
                                <small>{item.instanceId}</small>
                              </td>
                              <td>
                                <span className={`badge ${component.state}`}>
                                  {componentLabels[component.state]}
                                </span>
                              </td>
                              <td className="wrap-cell">{component.error || '오류 보고 없음'}</td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                  {!data.items.some((item) => item.report?.tetragon[key].length) && (
                    <p className="empty">
                      {key === 'sensors' ? '센서 목록 미확인' : '정책 목록 없음 또는 미확인'} ·
                      정상으로 간주하지 않습니다.
                    </p>
                  )}
                </article>
              ))}
            </div>
          </div>
        </>
      )}
      <AnalysisAside onAnalyze={() => onAnalyze(selectionFilters(selection))} />
    </>
  );
}
