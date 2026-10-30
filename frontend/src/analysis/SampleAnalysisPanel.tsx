import { useEffect, useState } from 'react';
import { api, describeError } from '../api';
import { dateTime, number, serverName, type PeriodFilters } from '../types';

const titles: Record<string, string> = {
  '/overview': '보안 개요', '/telemetry': '텔레메트리', '/servers': '서버 보안',
  '/replay': '위험 전후 조사', '/readiness': '수집·정책 준비 상태',
};
type Result = { facts: string[]; hypotheses: string[]; checks: string[]; limitations: string[] };

export default function SampleAnalysisPanel({ screen, filters }: { screen: string; filters: PeriodFilters }) {
  const [result, setResult] = useState<Result>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [createdAt, setCreatedAt] = useState('');
  const scopeKey = JSON.stringify(filters);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true); setError(''); setResult(undefined);
    const delay = new Promise<void>((resolve) => { timer = setTimeout(resolve, 2200); });
    async function run() {
      try {
        const replayId = new URLSearchParams(location.search).get('replay');
        const [dashboard, detail] = await Promise.all([
          api.dashboard(filters, controller.signal),
          screen === '/readiness' ? api.readiness(filters.instanceId, 'sample', controller.signal)
            : screen === '/servers' ? api.servers(filters, controller.signal)
            : screen === '/replay' && replayId ? api.getReplay(replayId, controller.signal)
            : api.network(filters, controller.signal),
          delay,
        ]);
        if (controller.signal.aborted) return;
        const duration = Math.max(1, (Date.parse(filters.to) - Date.parse(filters.from)) / 1000);
        const rate = (dashboard.total / duration).toFixed(1);
        const ratio = dashboard.total ? (dashboard.attention / dashboard.total * 100).toFixed(2) : '0';
        const result: Result = {
          facts: [`선택한 기간의 관찰 이벤트는 ${number(dashboard.total)}건이며, 초당 평균 ${rate}건입니다.`,
            `경고 정책에 일치한 이벤트는 ${number(dashboard.attention)}건으로 전체의 ${ratio}%입니다.`],
          hypotheses: [dashboard.attention ? '대부분은 일반 업무 활동이며, 경고에 해당하는 일부 흐름을 우선 확인할 필요가 있습니다.' : '선택한 범위에서는 경고 정책에 일치하는 활동이 확인되지 않았습니다.'],
          checks: ['경고 이벤트의 부모 프로세스와 같은 시점의 파일 접근·통신 기록을 함께 확인하세요.'],
          limitations: ['정책 일치만으로 공격·정보 유출·실제 차단 성공을 확정할 수 없습니다.'],
        };
        if (screen === '/overview' && 'totalNetworkEvents' in detail) {
          result.facts.push(`네트워크 활동은 ${number(detail.totalNetworkEvents)}건이며, 위치 미등록은 ${number(detail.unmappedCount)}건입니다.`);
          const riskCountries = detail.countries?.filter((country) => country.attentionCount > 0).length || 0;
          if (riskCountries) result.facts.push(`지도에서 ${riskCountries}개 국가 좌표에 경고 대상 연결이 표시됩니다.`);
          result.checks = ['지도에서 위험만 필터를 선택해 경고 연결을 확인하세요.', '해당 연결을 생성한 프로세스가 평소 사용하는 외부 연동인지 대조하세요.'];
        } else if (screen === '/telemetry') {
          const rates = dashboard.timeline.map((row) => row.count / dashboard.bucketSeconds);
          result.facts.push(`시간 구간별 초당 평균은 ${Math.min(...rates).toFixed(1)}~${Math.max(...rates).toFixed(1)}건입니다.`);
          if (dashboard.simulation) result.facts.push(`상세 탐색에서는 대표 원본 ${number(dashboard.simulation.representativeEvents)}건의 프로세스·대상·원본을 확인할 수 있습니다.`);
          result.hypotheses = ['기본 처리량의 완만한 변화는 게시글 조회·첨부파일 처리·알림 같은 반복 업무 흐름과 함께 살펴볼 수 있습니다.', '경고가 집중된 구간은 해당 시점의 프로세스 실행과 네트워크 활동을 분리해 확인하는 것이 좋습니다.'];
          result.checks = ['위험 필터와 시간 구간을 좁혀 이벤트 원본을 확인하세요.', '유형·프로세스·정책으로 구분해 평소 활동과 다른 조합을 확인하세요.'];
        } else if (screen === '/servers' && 'items' in detail) {
          const servers = detail.items as { instanceId: string; total: number; attention: number }[];
          result.facts.push(`조회 범위에 활동이 있는 서버는 ${servers.length}대입니다.`);
          const top = [...servers].sort((a, b) => b.attention - a.attention)[0];
          if (top) result.facts.push(`${serverName(top.instanceId)}에서 관찰 ${number(top.total)}건, 경고 ${number(top.attention)}건이 집계됐습니다.`);
          result.checks = ['서버별 경고 비율과 유형 분포를 함께 비교하세요.', '격리·차단 여부는 센서의 대응 기록과 실제 프로세스 상태로 별도 확인하세요.'];
        } else if (screen === '/replay' && 'events' in detail) {
          const risks = detail.events.filter((event) => event.status === 'attention');
          result.facts = [`고정된 조사에는 원본 ${number(detail.total)}건 중 ${number(detail.events.length)}건이 시간순으로 포함되어 있습니다.`, `확인할 위험 이벤트는 ${risks.length}건입니다.`];
          if (risks.some((event) => event.eventType === 'NETWORK')) result.facts.push('위험 기록에 외부 연결 관찰이 포함되어 있습니다.');
          if (risks.some((event) => event.eventType === 'FILE_ACCESS')) result.facts.push('위험 기록에 보호 파일 접근 관찰도 포함되어 있습니다.');
          result.hypotheses = ['셸·전송 도구 실행, 파일 접근, 경고 대상 연결이 이어지는 흐름은 하나의 작업에서 발생했을 가능성이 있습니다. 실행 식별자와 부모 관계를 확인해야 합니다.'];
          result.checks = ['먼저 확인할 위험 이벤트에서 시작해 앞뒤 기록을 따라가세요.', '선택 이벤트 분석에서 목적지 변화와 보호 파일 접근 순서를 대조하세요.'];
          if (detail.truncated) result.limitations.push('조사 한도로 일부 원본이 생략되어 있습니다.');
        } else if (screen === '/readiness' && 'items' in detail) {
          const reports = detail.items as { state: string; instanceId: string; report?: { tetragon: { policies: unknown[]; sensors: unknown[] } } | null }[];
          const ready = reports.filter((item) => item.state === 'ready').length;
          const stale = reports.filter((item) => item.state === 'stale').length;
          result.facts = [`준비 상태 확인 대상은 ${reports.length}대이며, 수집 준비 확인 ${ready}대·오래된 보고 ${stale}대입니다.`];
          for (const item of reports) if (item.report) result.facts.push(`${serverName(item.instanceId)}의 저장된 보고에 센서 ${item.report.tetragon.sensors.length}개와 정책 ${item.report.tetragon.policies.length}개가 포함되어 있습니다.`);
          result.hypotheses = [stale ? '상태 보고가 지연된 서버는 현재 센서가 정상인지 다시 확인할 필요가 있습니다.' : '저장된 상태 보고를 기준으로 수집기·센서·정책의 준비 상태를 확인할 수 있습니다.'];
          result.checks = ['상태 보고 시각과 수집기 오류 여부를 확인하세요.', '필요한 관찰·대응 정책이 활성 상태인지 확인하세요.'];
          result.limitations = ['준비 상태 보고는 공격 탐지나 차단 성공을 입증하지 않습니다.'];
        }
        setResult(result); setCreatedAt(new Date().toISOString());
      } catch (error) {
        if (!controller.signal.aborted) setError(describeError(error));
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void run();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [screen, scopeKey, refresh]);
  return <section className="analysis-section">
    <div className="section-heading"><h3>{titles[screen] || '현재 화면'} 분석</h3><button disabled={loading} onClick={() => setRefresh((value) => value + 1)}>다시 분석</button></div>
    {loading && <p className="status-line" role="status"><span className="spinner" />현재 화면의 관찰 기록과 위험 흐름을 정리하고 있습니다…</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {result && <div className="panel analysis-result"><div className="panel-heading"><h3>분석 결과</h3><span>{dateTime(createdAt)}</span></div>
      <div className="result-grid">{(['facts', 'hypotheses', 'checks', 'limitations'] as const).map((key, index) => <article key={key}><h4>{['관찰된 사실', '가능한 해석', '확인할 사항', '분석의 한계'][index]}</h4><ul>{result[key].map((text, i) => <li key={i}>{text}</li>)}</ul></article>)}</div>
    </div>}
  </section>;
}
