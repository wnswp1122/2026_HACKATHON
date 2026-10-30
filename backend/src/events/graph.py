"""관찰한 식별자/명시적 parentExecId만 연결하고 SQL에서 그래프 상한을 적용한다."""

from psycopg import Connection

from .filters import QueryFilters
from .queries import where_clause


GRAPH_SQL = """
WITH base AS MATERIALIZED (
  SELECT event_id, instance_id, normalized->>'eventType' AS event_type,
    normalized#>>'{process,execId}' AS exec_id,
    normalized#>>'{process,parentExecId}' AS parent_exec_id,
    normalized#>>'{process,binary}' AS process_binary,
    normalized#>>'{file,path}' AS file_path,
    normalized->'network' AS network,
    '0:' || jsonb_build_array('server', instance_id)::text AS server_id,
    CASE WHEN normalized#>>'{process,execId}' IS NOT NULL
      THEN '1:' || jsonb_build_array('process', instance_id, normalized#>>'{process,execId}')::text
      ELSE '0:' || jsonb_build_array('server', instance_id)::text END AS actor_id
  FROM events WHERE /* FILTER */
), ip_observations AS (
  SELECT DISTINCT event_id, actor_id, host(ip::inet) AS ip
  FROM base CROSS JOIN LATERAL
    (VALUES (network->>'sourceIp'), (network->>'destinationIp')) AS endpoints(ip)
  WHERE event_type = 'NETWORK' AND ip IS NOT NULL
), raw_nodes AS (
  SELECT server_id AS id, 'server' AS kind, instance_id AS label, 0 AS priority FROM base
  UNION ALL
  SELECT actor_id, 'process', coalesce(process_binary, exec_id), 0 FROM base WHERE exec_id IS NOT NULL
  UNION ALL
  SELECT '1:' || jsonb_build_array('process', instance_id, parent_exec_id)::text,
    'process', '미관찰 부모: ' || parent_exec_id, 1 FROM base WHERE parent_exec_id IS NOT NULL
  UNION ALL
  SELECT '3:' || jsonb_build_array('file', instance_id, file_path)::text, 'file', file_path, 0
    FROM base WHERE event_type = 'FILE_ACCESS' AND file_path IS NOT NULL
  UNION ALL
  SELECT '2:' || jsonb_build_array('ip', ip)::text, 'ip', ip, 0 FROM ip_observations
), nodes AS MATERIALIZED (
  SELECT DISTINCT ON (id COLLATE "C") id, kind, label FROM raw_nodes
  ORDER BY id COLLATE "C", priority, label COLLATE "C"
), kept_nodes AS MATERIALIZED (
  SELECT * FROM nodes ORDER BY id COLLATE "C" LIMIT 200
), raw_edges AS (
  SELECT server_id AS source, actor_id AS target, 'observed' AS kind
    FROM base WHERE exec_id IS NOT NULL
  UNION ALL
  SELECT '1:' || jsonb_build_array('process', instance_id, parent_exec_id)::text, actor_id, 'parent'
    FROM base WHERE exec_id IS NOT NULL AND parent_exec_id IS NOT NULL
  UNION ALL
  SELECT actor_id, '3:' || jsonb_build_array('file', instance_id, file_path)::text, 'observed'
    FROM base WHERE event_type = 'FILE_ACCESS' AND file_path IS NOT NULL
  UNION ALL
  SELECT actor_id, '2:' || jsonb_build_array('ip', ip)::text, 'observed' FROM ip_observations
), edges AS MATERIALIZED (
  SELECT source, target, kind, count(*) AS count FROM raw_edges GROUP BY 1, 2, 3
), kept_edges AS (
  SELECT * FROM edges WHERE source IN (SELECT id FROM kept_nodes)
    AND target IN (SELECT id FROM kept_nodes)
  ORDER BY source COLLATE "C", target COLLATE "C", kind COLLATE "C" LIMIT 500
)
SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'label', label)
    ORDER BY id COLLATE "C") FROM kept_nodes), '[]'::jsonb) AS nodes,
  coalesce((SELECT jsonb_agg(jsonb_build_object('source', source, 'target', target, 'kind', kind, 'count', count)
    ORDER BY source COLLATE "C", target COLLATE "C", kind COLLATE "C") FROM kept_edges), '[]'::jsonb) AS edges,
  ((SELECT count(*) FROM nodes) > (SELECT count(*) FROM kept_nodes)
    OR (SELECT count(*) FROM edges) > (SELECT count(*) FROM kept_edges)) AS truncated
"""


def read_graph(conn: Connection, filters: QueryFilters) -> dict:
    where, params = where_clause(filters)
    row = conn.execute(GRAPH_SQL.replace("/* FILTER */", where), params).fetchone()
    return {**row, "nodeLimit": 200, "edgeLimit": 500}
