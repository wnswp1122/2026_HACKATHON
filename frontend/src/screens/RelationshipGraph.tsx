import { useState } from 'react';
import type { Graph } from '../types';
const kinds = ['server', 'process', 'ip', 'file'] as const;
const labels = { server: '서버', process: '프로세스', ip: 'IP', file: '파일' };
export function RelationshipGraph({ graph }: { graph: Graph }) {
  const [mode, setMode] = useState<'all' | 'parent' | 'observed'>('all');
  const [selectedId, setSelected] = useState('');
  const selected = graph.nodes.some((node) => node.id === selectedId) ? selectedId : '';
  const groups = kinds.map((kind) => graph.nodes.filter((n) => n.kind === kind));
  const height = Math.max(240, ...groups.map((g) => g.length * 62 + 45));
  const positions = new Map(
    groups.flatMap((group, column) =>
      group.map((node, row) => [node.id, { x: column * 245 + 18, y: row * 62 + 45 }]),
    ),
  );
  const edges = graph.edges.filter(
    (e) =>
      (mode === 'all' || e.kind === mode) &&
      (!selected || e.source === selected || e.target === selected),
  );
  return (
    <article className="panel relationship">
      <div className="panel-heading">
        <h3>프로세스 트리 · 관찰 통신 관계</h3>
        <span>
          노드 {graph.nodes.length}/{graph.nodeLimit} · 간선 {graph.edges.length}/{graph.edgeLimit}
        </span>
      </div>
      <div className="graph-controls">
        <label>
          관계 종류
          <select
            aria-label="관계 종류"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="all">전체 관계</option>
            <option value="parent">확인된 부모 관계</option>
            <option value="observed">관찰 관계</option>
          </select>
        </label>
        <label>
          초점 노드
          <select
            aria-label="초점 노드"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">모든 노드</option>
            {graph.nodes.map((n) => (
              <option value={n.id} key={n.id}>
                {labels[n.kind]} · {n.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!graph.nodes.length ? (
        <p className="empty">
          확인된 관계가 없습니다. PID나 실행 파일 이름으로 관계를 추측하지 않습니다.
        </p>
      ) : (
        <div className="graph-scroll">
          <svg
            viewBox={`0 0 1000 ${height}`}
            width="1000"
            height={height}
            role="img"
            aria-label="서버 프로세스 IP 파일 관계 그래프"
          >
            <title>
              parent는 확인된 parentExecId, observed는 관찰 관계이며 인과관계 확정이 아닙니다.
            </title>
            {kinds.map((kind, index) => (
              <text key={kind} x={index * 245 + 28} y="18" fill="#8b93a0" fontSize="12">
                {labels[kind]}
              </text>
            ))}
            {edges.map((edge, index) => {
              const a = positions.get(edge.source),
                b = positions.get(edge.target);
              if (!a || !b) return null;
              return (
                <path
                  key={index}
                  d={`M ${a.x + 180} ${a.y + 15} C ${a.x + 220} ${a.y + 15}, ${b.x - 20} ${b.y + 15}, ${b.x} ${b.y + 15}`}
                  fill="none"
                  stroke={edge.kind === 'parent' ? '#a78bfa' : '#22d3ee'}
                  opacity=".55"
                >
                  <title>
                    {edge.kind} · {edge.count}회 관찰
                  </title>
                </path>
              );
            })}
            {graph.nodes.map((node) => {
              const p = positions.get(node.id)!;
              return (
                <g key={node.id}>
                  <rect
                    x={p.x}
                    y={p.y}
                    width="180"
                    height="32"
                    rx="5"
                    fill={node.id === selected ? '#183544' : '#171d27'}
                    stroke={node.kind === 'process' ? '#67528e' : '#33434f'}
                  />
                  <text x={p.x + 9} y={p.y + 20} fill="#c9ced6" fontSize="10">
                    {node.label.slice(0, 24)}
                  </text>
                  <title>
                    {labels[node.kind]} · {node.label} · ID {node.id}
                  </title>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <p className="hint">
        {graph.truncated ? '상한으로 잘린 일부 관계입니다.' : '서버 응답 범위의 관계입니다.'} 간선
        수는 전체 이벤트 수와 다릅니다. 부모는 instanceId+execId와 실제 parentExecId로 연결하며 누락
        부모는 미관찰 노드입니다.
      </p>
      {selected && (
        <div className="graph-detail">
          <p className="mono">{graph.nodes.find((n) => n.id === selected)?.label}</p>
          <ul>
            {edges.map((e, i) => (
              <li key={i}>
                {graph.nodes.find((n) => n.id === e.source)?.label} →{' '}
                {graph.nodes.find((n) => n.id === e.target)?.label} · {e.kind} · {e.count}회
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
