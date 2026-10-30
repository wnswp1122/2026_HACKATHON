import { lazy, Suspense, useState } from 'react';
import { number, type NetworkItem, type NetworkResponse } from '../types';

const Globe3D = lazy(() => import('./NetworkGlobe3D'));

const ipKind = (item: NetworkItem) =>
  item.network?.destinationIp
    ? 'destinationIp'
    : item.network?.sourceIp
      ? 'sourceIp'
      : 'IP 필드 미확인';
const ip = (item: NetworkItem) =>
  item.network?.destinationIp || item.network?.sourceIp || 'IP 미확인';
const networkKey = (item: NetworkItem) =>
  JSON.stringify([
    item.instanceId,
    item.execId,
    item.network?.sourceIp,
    item.network?.sourcePort,
    item.network?.destinationIp,
    item.network?.destinationPort,
    item.network?.protocol,
    item.network?.operation,
  ]);
export function NetworkGlobe({ data }: { data: NetworkResponse }) {
  const [center, setCenter] = useState<[number, number]>([20, 0]);
  const mapped = data.items.filter((item) => item.location);
  return (
    <article className="panel globe-card">
      <div className="panel-heading">
        <h3>관찰 연결 지구본</h3>
        <span>설정된 좌표만 표시 · 연결 성공 증거 아님</span>
      </div>
      <div className="globe-controls">
        <button
          aria-label="지구본 서쪽 회전"
          onClick={() => setCenter(([lat, lon]) => [lat, lon - 45])}
        >
          ← 회전
        </button>
        <span>
          중심 {center[0].toFixed(0)}°, {center[1].toFixed(0)}°
        </span>
        <button
          aria-label="지구본 동쪽 회전"
          onClick={() => setCenter(([lat, lon]) => [lat, lon + 45])}
        >
          회전 →
        </button>
      </div>
      <Suspense fallback={<p className="empty">3D 지구본을 불러오는 중입니다.</p>}>
        <Globe3D items={data.items} center={center} />
      </Suspense>
      <div className="legend">
        <i className="dot blue" /> 관찰 대상 IP <i className="dot purple" /> 서버 설정 위치
      </div>
      <p className="hint">
        3D 지구본 · 드래그로 회전하고 휠로 확대하세요. 선은 서버와 관찰 IP의 관계이며 공격 방향을 뜻하지 않습니다.
      </p>
      <div className="table-scroll network-list">
        <table>
          <thead>
            <tr>
              <th>관찰 IP</th>
              <th>서버</th>
              <th>건수</th>
              <th>위치 근거</th>
            </tr>
          </thead>
          <tbody>
            {mapped.map((item) => (
              <tr key={networkKey(item)}>
                <td>
                  <button
                    className="text-button"
                    onClick={() => {
                      setCenter([item.location!.latitude, item.location!.longitude]);
                    }}
                  >
                    {ip(item)}
                  </button>
                  <small>
                    {ipKind(item)} · {item.network?.operation || '동작 미확인'}
                  </small>
                </td>
                <td>{item.instanceId}</td>
                <td>{number(item.count)}</td>
                <td>
                  {item.location!.countryCode || '국가 미확인'} · {item.location!.source}
                  <small>
                    {item.location!.latitude}, {item.location!.longitude}
                    {!item.serverLocation ? ' · 서버 위치 미설정' : ''}
                  </small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        최대 {data.limit}개 연결 ·{' '}
        {data.truncated ? '상한으로 일부 연결 생략' : '서버 응답 생략 없음'}. 관찰 수를 접속
        성공·전송량·공격자 위치로 해석하지 않습니다.
      </p>
    </article>
  );
}

export function UnmappedNetwork({ data }: { data: NetworkResponse }) {
  const missing = data.items.filter((item) => !item.location);
  return (
    <article className="panel">
      <div className="panel-heading unmapped-heading">
        <h3>위치 미확인 IP</h3>
        <span>전체 범위 {number(data.unmappedCount)}건 · 아래는 응답 항목</span>
      </div>
      {missing.length ? (
        <ul className="unmapped-list">
          {missing.map((item, index) => (
            <li key={index}>
              <span className="mono">
                {ip(item)}
                <small>{ipKind(item)}</small>
              </span>
              <span>
                {item.instanceId} · {number(item.count)}건 · 위치 미확인
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">응답 항목에 위치 미확인 IP가 없습니다.</p>
      )}

      <p className="hint">
        최대 {data.limit}개 연결 ·{' '}
        {data.truncated ? '상한으로 일부 연결 생략' : '서버 응답 생략 없음'}. 고유 IP 수가 아니라
        위치 없는 네트워크 이벤트 수입니다.
      </p>
    </article>
  );
}
