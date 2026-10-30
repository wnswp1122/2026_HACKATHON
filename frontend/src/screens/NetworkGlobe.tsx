import { useState } from 'react';
import sphere from '../assets/globe-sphere.svg';
import grid from '../assets/globe-grid.svg';
import land from '../assets/globe-land.svg';
import { number, type Location, type NetworkItem, type NetworkResponse } from '../types';

const rad = Math.PI / 180;
function project(location: Location, center: [number, number]) {
  const lat = location.latitude * rad,
    lon = (location.longitude - center[1]) * rad,
    origin = center[0] * rad;
  const visible =
    Math.sin(origin) * Math.sin(lat) + Math.cos(origin) * Math.cos(lat) * Math.cos(lon) >= 0;
  return {
    x: 320 + 205.7 * Math.cos(lat) * Math.sin(lon),
    y:
      228.5 -
      205.7 * (Math.cos(origin) * Math.sin(lat) - Math.sin(origin) * Math.cos(lat) * Math.cos(lon)),
    visible,
  };
}
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
  const [selected, setSelected] = useState<string>();
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
      <div className="globe-scroll">
        <div className="globe-canvas">
          <img className="globe-sphere" src={sphere} alt="" />
          <img className="globe-grid" src={grid} alt="" />
          <img className="globe-land" src={land} alt="" />
          <svg viewBox="0 0 640 457" role="img" aria-label="관찰 IP와 서버 설정 위치의 구면 투영">
            <title>좌표가 있는 위치만 표시합니다. 지구 배경은 디자인 참고 일러스트입니다.</title>
            {mapped.map((item) => {
              const end = project(item.location!, center),
                start = item.serverLocation ? project(item.serverLocation, center) : null;
              return (
                <g key={networkKey(item)}>
                  {start?.visible && end.visible && (
                    <path
                      d={`M ${start.x} ${start.y} Q ${(start.x + end.x) / 2} ${Math.min(start.y, end.y) - 60} ${end.x} ${end.y}`}
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth={selected === networkKey(item) ? 2.5 : 1}
                      opacity=".6"
                    />
                  )}
                  {start?.visible && (
                    <circle cx={start.x} cy={start.y} r="4" fill="#a78bfa">
                      <title>{item.instanceId} · 서버 설정 위치</title>
                    </circle>
                  )}
                  {end.visible && (
                    <g>
                      <circle
                        cx={end.x}
                        cy={end.y}
                        r={selected === networkKey(item) ? 7 : 4}
                        fill="#22d3ee"
                      >
                        <title>
                          {ip(item)} · {item.location!.source} · 관찰 {item.count}건
                        </title>
                      </circle>
                      {selected === networkKey(item) && (
                        <text
                          x={Math.min(485, Math.max(5, end.x + 10))}
                          y={end.y - 10}
                          fill="#22d3ee"
                          fontSize="11"
                        >
                          {ip(item)}
                        </text>
                      )}
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
          {!mapped.length && (
            <p className="globe-empty">
              표시할 위치가 없습니다.
              <br />
              임의 좌표를 만들지 않습니다.
            </p>
          )}
        </div>
      </div>
      <div className="legend">
        <i className="dot blue" /> 관찰 대상 IP <i className="dot purple" /> 서버 설정 위치
      </div>
      <p className="hint">
        구면 투영 · 배경은 참고 일러스트 · 반대 반구 위치는 회전하거나 아래 목록에서 선택하세요.
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
                      setSelected(networkKey(item));
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
