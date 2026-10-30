import { lazy, Suspense, useState } from 'react';
import { number, type NetworkItem, type NetworkResponse, type Status } from '../types';

const Globe3D = lazy(() => import('./NetworkGlobe3D'));
const countryNames = new Intl.DisplayNames(['ko'], { type: 'region' });
const address = (item: NetworkItem) =>
  item.network?.destinationIp || item.network?.sourceIp || 'IP 미확인';
const isLoopback = (ip: string) => /^127\./.test(ip) || ip === '::1';

type Props = {
  data: NetworkResponse;
  status?: Status;
  disabled: boolean;
  onStatusChange: (status: Status | undefined) => void;
};

export function NetworkGlobe({ data, status, disabled, onStatusChange }: Props) {
  const [center, setCenter] = useState<[number, number]>([30, 105]);
  const countries = new Map<string, number>();
  const countryRisks = new Map<string, number>();
  const unmapped = new Map<string, { count: number; risk: number }>();
  for (const item of data.items) {
    if (item.location?.countryCode) {
      const code = item.location.countryCode;
      countries.set(code, (countries.get(code) || 0) + item.count);
      countryRisks.set(code, (countryRisks.get(code) || 0) + (item.attentionCount || 0));
    }
    if (!item.location) {
      const ip = address(item);
      const previous = unmapped.get(ip) || { count: 0, risk: 0 };
      unmapped.set(ip, { count: previous.count + item.count, risk: previous.risk + (item.attentionCount || 0) });
    }
  }
  if (data.countries) {
    countries.clear();
    countryRisks.clear();
    for (const country of data.countries) {
      countries.set(country.countryCode, country.count);
      countryRisks.set(country.countryCode, country.attentionCount);
    }
  }
  const ranked = [...countries].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = ranked[0]?.[1] || 1;
  const unknownCountry = data.unknownCountryCount ?? data.items
    .filter((item) => item.location && !item.location.countryCode)
    .reduce((sum, item) => sum + item.count, 0);

  return (
    <article className="panel globe-card overview-network" data-status={status || 'all'}>
      <div className="panel-heading">
        <h3>{status === 'attention' ? '위험 네트워크 관찰 지도' : '네트워크 관찰 지도'}</h3>
        <div className="network-status-filter" role="group" aria-label="이벤트 상태 필터">
          <button aria-pressed={!status} disabled={disabled} onClick={() => onStatusChange(undefined)}>
            전체 상태
          </button>
          <button data-status="observed" aria-pressed={status === 'observed'} disabled={disabled} onClick={() => onStatusChange('observed')}>안전만</button>
          <button data-status="attention" aria-pressed={status === 'attention'} disabled={disabled} onClick={() => onStatusChange('attention')}>
            위험만
          </button>
        </div>
      </div>
      <div className="network-hero-grid">
        <div className="network-map">
          <div className="globe-controls">
            <button aria-label="지구본 서쪽 회전" onClick={() => setCenter(([lat, lon]) => [lat, lon - 45])}>← 회전</button>
            <span className="hint">네트워크 {number(data.totalNetworkEvents)}건</span>
            <button aria-label="지구본 동쪽 회전" onClick={() => setCenter(([lat, lon]) => [lat, lon + 45])}>회전 →</button>
          </div>
          <Suspense fallback={<div className="network-globe-loading" role="status">지구본 불러오는 중…</div>}>
            <Globe3D items={data.items} center={center} />
          </Suspense>
          <div className="network-map-footer">
            <div className="legend"><i className="dot status-observed" />안전 IP <i className="dot status-attention" />위험 IP <i className="dot purple" />서버</div>
            <details className="unmapped-summary">
              <summary>위치 미등록 {number(data.unmappedCount)}건</summary>
              <ul>
                {[...unmapped].map(([ip, item]) => (
                  <li key={ip} className={item.risk ? 'status-attention' : undefined}><span className="mono">{ip}</span><span>{isLoopback(ip) ? '내부 통신' : '위치 미등록'} · {number(item.count)}건{item.risk > 0 ? ` · 위험 ${number(item.risk)}건` : ''}</span></li>
                ))}
                {!unmapped.size && <li>위치 미등록 연결 없음</li>}
              </ul>
            </details>
          </div>
          <p className="hint">선 밀도는 경로별 관찰 건수에 비례합니다(로그 축척·최대 24개). 선 하나가 요청 한 건을 뜻하지는 않습니다.</p>
        </div>
        <section className="country-distribution" aria-labelledby="country-distribution-title">
          <div className="panel-heading">
            <h3 id="country-distribution-title">국가별 네트워크 관찰</h3>
            <span>{ranked.length}개국</span>
          </div>
          <span className="country-unit">이벤트 건수{data.truncated && !data.countries ? ' · 표시된 연결 기준' : ''}</span>
          {ranked.length ? (
            <ol className="country-bars">
              {ranked.map(([code, count], index) => (
                <li key={code}>
                  <div className="country-row-label"><span><small>{index + 1}</small>{countryNames.of(code) || code}</span><b>{number(count)}건{countryRisks.get(code) ? ` · 위험 ${number(countryRisks.get(code)!)}` : ''}</b></div>
                  <div className="country-bar-track"><div className="country-bar-fill" style={{ width: `${(count / max) * 100}%` }}><span className="country-bar-risk" style={{ width: `${((countryRisks.get(code) || 0) / count) * 100}%` }} /></div></div>
                </li>
              ))}
            </ol>
          ) : <div className="country-empty">{data.totalNetworkEvents ? '등록된 국가 정보 없음' : '네트워크 이벤트 없음'}</div>}
          <div className="country-unknown">
            <span>위치 미등록</span><b>{number(data.unmappedCount)}건</b>
          </div>
          {unknownCountry > 0 && <div className="country-unknown"><span>국가 미등록{data.truncated && !data.countries ? ' · 표시 연결' : ''}</span><b>{number(unknownCountry)}건</b></div>}
          {data.truncated && <span className="hint">연결 {data.limit}개 표시{data.countries ? ' · 국가 집계 전체' : ' · 국가 집계 일부'}</span>}
        </section>
      </div>
    </article>
  );
}
