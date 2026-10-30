/** 독립 로컬 UI harness. 제품 src에서 import하지 않으며 실제 SaaS/AI가 아닙니다. */
import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

const dir = resolve(import.meta.dirname, '../.local/mock');
await mkdir(dir, { recursive: true });
const types = ['PROCESS_EXEC', 'PROCESS_EXIT', 'FILE_ACCESS', 'NETWORK', 'OTHER'];
let store;
try {
  store = JSON.parse(await readFile(`${dir}/store.json`, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  store = { events: [], snapshots: {}, images: {}, analyses: {} };
}
let controls = {
  failRead: false,
  delayMs: 0,
  ai: 'success',
  failUpload: false,
  readiness: 'mixed',
  truncate: false,
};
store.replays ||= {};
store.statusAt ||= new Date().toISOString();
let stats = { snapshotPosts: 0, imagePuts: 0, analysisPosts: 0, requests: [] };
const persist = () => writeFile(`${dir}/store.json`, JSON.stringify(store));
const event = (i) => ({
  eventId: randomUUID(),
  instanceId: i % 4 ? 'sample-board-01' : 'sample-worker-02',
  source: 'sample',
  receivedAt: new Date(Date.now() - i * 12_000).toISOString(),
  occurredAt: i % 7 ? new Date(Date.now() - i * 12_000 - 900).toISOString() : null,
  eventType: types[i % types.length],
  status: i % 6 ? 'observed' : 'attention',
  outcome: 'unknown',
  nodeName: 'sample-only-node',
  file: i % 5 === 2 ? { path: '/tmp/sample-only.txt', operation: 'read' } : null,
  network:
    i % 5 === 3
      ? {
          sourceIp: '192.0.2.5',
          sourcePort: 32000 + i,
          destinationIp: i % 3 ? '192.0.2.44' : '203.0.113.10',
          destinationPort: 443,
          protocol: 'TCP',
          operation: 'connect',
        }
      : null,
  process: {
    execId: `sample-process-${Math.floor(i / 5)}`,
    parentExecId: i < 5 ? 'sample-unobserved-parent' : `sample-process-${Math.floor(i / 5) - 1}`,
    pid: 1000 + i,
    uid: 1000,
    binary: '/usr/bin/sample',
    parentBinary: '/bin/sample-shell',
  },
  target: null,
  policyName: i % 6 ? null : 'sample-attention-policy',
  reportedAction: null,
  reason: i % 6 ? null : 'sample 정책명 일치 · 실제 차단 여부 미확인',
});
if (!store.events.length) {
  store.events = Array.from({ length: 137 }, (_, i) => event(i));
  await persist();
}
const safe = ({
  eventId,
  instanceId,
  source,
  receivedAt,
  occurredAt,
  eventType,
  status,
  outcome,
}) => ({ eventId, instanceId, source, receivedAt, occurredAt, eventType, status, outcome });
function filters(value) {
  const f = Object.fromEntries(
    Object.entries(value).filter(([k]) =>
      [
        'from',
        'to',
        'instanceId',
        'eventType',
        'status',
        'source',
        'processExecId',
        'policyName',
      ].includes(k),
    ),
  );
  const duration = Date.parse(f.to) - Date.parse(f.from);
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 31 * 86400_000 ||
    !/(Z|[+-]\d\d:\d\d)$/.test(f.from) ||
    !/(Z|[+-]\d\d:\d\d)$/.test(f.to) ||
    (f.eventType && !types.includes(f.eventType)) ||
    (f.status && !['observed', 'attention'].includes(f.status)) ||
    (f.source && !['live', 'sample'].includes(f.source)) ||
    (f.processExecId !== undefined &&
      (typeof f.processExecId !== 'string' ||
        !f.processExecId.trim() ||
        f.processExecId.length > 1024)) ||
    (f.policyName !== undefined &&
      (typeof f.policyName !== 'string' || !f.policyName.trim() || f.policyName.length > 100))
  )
    throw { status: 422, code: 'VALIDATION_ERROR' };
  return f;
}
function select(f) {
  return store.events
    .filter(
      (e) =>
        e.receivedAt >= f.from &&
        e.receivedAt < f.to &&
        (!f.processExecId || e.process.execId === f.processExecId) &&
        (!f.policyName || e.policyName === f.policyName) &&
        ['instanceId', 'eventType', 'status', 'source'].every(
          (key) => !f[key] || e[key] === f[key],
        ),
    )
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.eventId.localeCompare(a.eventId));
}
function dashboard(f, items) {
  const from = Date.parse(f.from),
    duration = Date.parse(f.to) - from;
  const bucketSeconds = duration <= 6 * 3600_000 ? 60 : duration <= 48 * 3600_000 ? 600 : 3600;
  const timeline = Array.from({ length: Math.ceil(duration / (bucketSeconds * 1000)) }, (_, i) => ({
    bucketStart: new Date(from + i * bucketSeconds * 1000).toISOString(),
    count: 0,
    attention: 0,
  }));
  for (const e of items) {
    const b = timeline[Math.floor((Date.parse(e.receivedAt) - from) / (bucketSeconds * 1000))];
    b.count++;
    b.attention += Number(e.status === 'attention');
  }
  return {
    total: items.length,
    attention: items.filter((e) => e.status === 'attention').length,
    byType: types.map((eventType) => ({
      eventType,
      count: items.filter((e) => e.eventType === eventType).length,
    })),
    bySource: ['live', 'sample'].map((source) => ({
      source,
      count: items.filter((e) => e.source === source).length,
    })),
    timeline,
    bucketSeconds,
  };
}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 5 * 1024 * 1024) throw { status: 413, code: 'IMAGE_TOO_LARGE' };
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
function json(buffer) {
  try {
    return JSON.parse(buffer);
  } catch {
    throw { status: 400, code: 'INVALID_JSON' };
  }
}
const send = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname,
      method = req.method;
    try {
      // Harness control paths are intentionally absent from the product API.
      if (path === '/__mock/control' && method === 'POST') {
        controls = { ...controls, ...json(await body(req)) };
        return send(res, 200, controls);
      }
      if (path === '/__mock/stats') return send(res, 200, stats);
      if (path === '/__mock/append' && method === 'POST') {
        const e = event(0);
        store.events.unshift(e);
        await persist();
        return send(res, 201, safe(e));
      }
      if (path === '/__mock/reports' && method === 'POST') {
        store.statusAt = new Date().toISOString();
        controls.readiness = 'mixed';
        await persist();
        return send(res, 200, { sampleReports: true });
      }
      if (path === '/__mock/undated' && method === 'POST') {
        store.events = store.events.map((e) => ({ ...e, occurredAt: null }));
        await persist();
        return send(res, 200, { sampleUndated: true });
      }
      if (path === '/__mock/reset' && method === 'POST') {
        store = {
          events: Array.from({ length: 137 }, (_, i) => event(i)),
          snapshots: {},
          images: {},
          analyses: {},
          replays: {},
          statusAt: new Date().toISOString(),
        };
        controls = { failRead: false, delayMs: 0, ai: 'success', failUpload: false };
        stats = { snapshotPosts: 0, imagePuts: 0, analysisPosts: 0, requests: [] };
        await persist();
        return send(res, 200, { reset: true });
      }
      stats.requests.push({
        method,
        path,
        query: Object.fromEntries(url.searchParams),
        at: new Date().toISOString(),
      });
      stats.requests = stats.requests.slice(-200);
      const delay = controls.delayMs;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (
        controls.failRead &&
        method === 'GET' &&
        [
          '/api/instances',
          '/api/events',
          '/api/dashboard',
          '/api/network',
          '/api/graph',
          '/api/servers',
          '/api/readiness',
        ].includes(path)
      )
        throw { status: 503, code: 'STORAGE_UNAVAILABLE' };
      if (path === '/__mock/many' && method === 'POST') {
        store.events = Array.from({ length: 2505 }, (_, i) => event(i));
        await persist();
        return send(res, 200, { sampleCount: store.events.length });
      }
      if (path === '/api/servers' && method === 'GET') {
        const f = filters(Object.fromEntries(url.searchParams)),
          events = select(f);
        return send(res, 200, {
          generatedAt: new Date().toISOString(),
          items: [...new Set(events.map((e) => e.instanceId))].sort().map((instanceId) => {
            const items = events.filter((e) => e.instanceId === instanceId);
            return {
              instanceId,
              total: items.length,
              attention: items.filter((e) => e.status === 'attention').length,
              byType: dashboard(f, items).byType,
              lastReceivedAt: store.events
                .filter((e) => e.instanceId === instanceId)
                .map((e) => e.receivedAt)
                .sort()
                .at(-1),
            };
          }),
        });
      }
      if (path === '/api/network' && method === 'GET') {
        const events = select(filters(Object.fromEntries(url.searchParams))).filter(
          (e) => e.eventType === 'NETWORK' && e.network,
        );
        const groups = new Map();
        for (const e of events) {
          const key = JSON.stringify([e.instanceId, e.process.execId, e.network]);
          if (!groups.has(key))
            groups.set(key, {
              instanceId: e.instanceId,
              execId: e.process.execId,
              network: e.network,
              count: 0,
              location:
                e.network.destinationIp === '203.0.113.10'
                  ? {
                      countryCode: 'FR',
                      latitude: 48.8566,
                      longitude: 2.3522,
                      source: 'configured',
                    }
                  : null,
              serverLocation: {
                countryCode: 'KR',
                latitude: 37.5665,
                longitude: 126.978,
                source: 'configured',
              },
            });
          groups.get(key).count++;
        }
        const items = [...groups.entries()]
          .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
          .map(([, item]) => item);
        return send(res, 200, {
          generatedAt: new Date().toISOString(),
          totalNetworkEvents: events.length,
          items: items.slice(0, 200),
          unmappedCount: events.filter((e) => e.network.destinationIp !== '203.0.113.10').length,
          truncated: items.length > 200 || controls.truncate,
          limit: 200,
        });
      }
      if (path === '/api/graph' && method === 'GET') {
        const events = select(filters(Object.fromEntries(url.searchParams))),
          nodes = new Map(),
          edges = new Map();
        const addNode = (id, kind, label) => {
          nodes.set(id, { id, kind, label });
          return id;
        };
        const addEdge = (source, target, kind) => {
          const key = JSON.stringify([source, target, kind]);
          if (!edges.has(key)) edges.set(key, { source, target, kind, count: 0 });
          edges.get(key).count++;
        };
        for (const e of events) {
          const server = addNode('s:' + e.instanceId, 'server', e.instanceId);
          const exec = e.process.execId;
          const process = exec
            ? addNode('p:' + e.instanceId + ':' + exec, 'process', e.process.binary || exec)
            : null;
          if (process) {
            addEdge(server, process, 'observed');
            const parent = e.process.parentExecId;
            if (parent) {
              const observed = events.some(
                (v) => v.instanceId === e.instanceId && v.process.execId === parent,
              );
              const id = 'p:' + e.instanceId + ':' + parent;
              if (!nodes.has(id))
                addNode(id, 'process', observed ? parent : '미관찰 부모 · ' + parent);
              addEdge(id, process, 'parent');
            }
          }
          if (e.file)
            addEdge(
              process || server,
              addNode('f:' + e.instanceId + ':' + e.file.path, 'file', e.file.path),
              'observed',
            );
          if (e.network) {
            const ip = e.network.destinationIp || e.network.sourceIp;
            if (ip) addEdge(process || server, addNode('ip:' + ip, 'ip', ip), 'observed');
          }
        }
        const allNodes = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
          chosen = allNodes.slice(0, 200),
          allowed = new Set(chosen.map((n) => n.id));
        const allEdges = [...edges.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([, e]) => e)
          .filter((e) => allowed.has(e.source) && allowed.has(e.target));
        return send(res, 200, {
          generatedAt: new Date().toISOString(),
          nodes: chosen,
          edges: allEdges.slice(0, 500),
          truncated: allNodes.length > 200 || allEdges.length > 500 || controls.truncate,
          nodeLimit: 200,
          edgeLimit: 500,
        });
      }
      if (path === '/api/readiness' && method === 'GET') {
        const source = url.searchParams.get('source');
        if (!['live', 'sample'].includes(source)) throw { status: 422, code: 'VALIDATION_ERROR' };
        const states = ['ready', 'warning', 'error', 'unknown', 'stale', 'unknown', 'unknown'];
        const names = [
          'sample-board-01',
          'sample-worker-02',
          'sample-policy-error',
          'sample-unreported',
          'sample-old-report',
          'sample-clock-skew',
          'sample-query-failed',
        ];
        const items = names
          .filter(
            (name) =>
              !url.searchParams.get('instanceId') || name === url.searchParams.get('instanceId'),
          )
          .map((instanceId) => {
            const index = names.indexOf(instanceId),
              scenario = controls.readiness;
            if (source === 'live' || index === 3 || scenario === 'missing')
              return {
                instanceId,
                state: 'unknown',
                reason: 'REPORT_NOT_RECEIVED',
                observedAt: null,
                receivedAt: null,
                report: null,
              };
            let observedAt = store.statusAt,
              receivedAt = store.statusAt,
              state = states[index],
              reason = null;
            if (index === 4 || scenario === 'stale') {
              observedAt = new Date(Date.now() - 120000).toISOString();
              receivedAt = observedAt;
              state = 'stale';
              reason = 'REPORT_STALE';
            }
            if (index === 5 || scenario === 'clock') {
              observedAt = new Date(Date.now() + 60000).toISOString();
              state = 'unknown';
              reason = 'CLOCK_SKEW';
            }
            const sensors = [{ name: 'sample-exec-sensor', state: 'enabled', error: null }],
              policies = [
                {
                  name: 'sample-file-policy',
                  state:
                    index === 1 || scenario === 'disabled'
                      ? 'disabled'
                      : index === 2 || scenario === 'error'
                        ? 'error'
                        : 'enabled',
                  error: index === 2 || scenario === 'error' ? 'sample policy load error' : null,
                },
              ];
            const report = {
              observedAt,
              collector: { state: 'ok', errorCode: null },
              tetragon: {
                reachable: index === 6 || scenario === 'unreachable' ? false : true,
                version: 'sample-only',
                sensors: scenario === 'no-sensors' ? [] : sensors,
                policies: scenario === 'no-policy' ? [] : policies,
              },
            };
            if (state !== 'stale' && reason !== 'CLOCK_SKEW') {
              if (Date.now() - Date.parse(receivedAt) > 90000) {
                state = 'stale';
                reason = 'REPORT_STALE';
              } else if (
                report.tetragon.reachable === false ||
                policies.some((p) => p.state === 'error')
              ) {
                state = 'error';
                reason = 'TETRAGON_OR_POLICY_ERROR';
              } else if (!report.tetragon.sensors.length) {
                state = 'unknown';
                reason = 'SENSORS_UNKNOWN';
              } else if (!report.tetragon.policies.length) {
                state = 'warning';
                reason = 'POLICY_NOT_CONFIGURED';
              } else if (policies.some((p) => p.state === 'disabled')) {
                state = 'warning';
                reason = 'POLICY_DISABLED';
              }
            }
            return { instanceId, state, reason, observedAt, receivedAt, report };
          });
        return send(res, 200, {
          generatedAt: new Date().toISOString(),
          staleAfterSeconds: 90,
          items,
        });
      }
      if (path === '/api/replays' && method === 'POST') {
        const f = filters(json(await body(req))),
          events = select(f),
          dated = events
            .filter((e) => e.occurredAt)
            .sort(
              (a, b) =>
                a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId),
            );
        const replay = {
          replayId: randomUUID(),
          createdAt: new Date().toISOString(),
          filters: f,
          timeBasis: 'occurredAt',
          events: dated.slice(0, 2000),
          total: events.length,
          undatedCount: events.length - dated.length,
          eventLimit: 2000,
          truncated: dated.length > 2000,
        };
        store.replays[replay.replayId] = replay;
        await persist();
        return send(res, 201, replay);
      }
      if (/^\/api\/replays\/[^/]+$/.test(path) && method === 'GET') {
        const replay = store.replays[path.split('/')[3]];
        if (!replay) throw { status: 404, code: 'NOT_FOUND' };
        return send(res, 200, replay);
      }
      if (path === '/api/instances' && method === 'GET')
        return send(res, 200, {
          items: [...new Set(store.events.map((e) => e.instanceId))].sort().map((instanceId) => ({
            instanceId,
            lastReceivedAt: store.events
              .filter((e) => e.instanceId === instanceId)
              .map((e) => e.receivedAt)
              .sort()
              .at(-1),
          })),
        });
      if (path === '/api/dashboard' && method === 'GET') {
        const f = filters(Object.fromEntries(url.searchParams));
        return send(res, 200, dashboard(f, select(f)));
      }
      if (path === '/api/events' && method === 'GET') {
        const f = filters(Object.fromEntries(url.searchParams)),
          items = select(f),
          page = Number(url.searchParams.get('page') || 1),
          pageSize = Number(url.searchParams.get('pageSize') || 50);
        if (
          !Number.isInteger(page) ||
          page < 1 ||
          !Number.isInteger(pageSize) ||
          pageSize < 1 ||
          pageSize > 100
        )
          throw { status: 422, code: 'VALIDATION_ERROR' };
        return send(res, 200, {
          items: items.slice((page - 1) * pageSize, page * pageSize),
          total: items.length,
          page,
          pageSize,
        });
      }
      if (/^\/api\/events\/[^/]+$/.test(path) && method === 'GET') {
        const e = store.events.find((e) => e.eventId === path.split('/')[3]);
        if (!e) throw { status: 404, code: 'NOT_FOUND' };
        return send(res, 200, {
          event: e,
          rawEvent: {
            sampleOnly: true,
            process_exec: {
              process: {
                binary: e.process.binary,
                arguments: 'SAMPLE_ARGUMENT_EXCLUDED_FROM_CAPTURE',
              },
            },
            note: '<script>window.rawExecuted=true</script>',
          },
        });
      }
      if (path === '/api/snapshots' && method === 'POST') {
        const input = json(await body(req));
        if (
          Object.keys(input).some(
            (key) => !['from', 'to', 'instanceId', 'eventType', 'status', 'source'].includes(key),
          )
        )
          throw { status: 422, code: 'VALIDATION_ERROR' };
        stats.snapshotPosts++;
        const f = filters(input),
          items = select(f),
          id = randomUUID();
        const s = {
          snapshotId: id,
          createdAt: new Date().toISOString(),
          filters: f,
          dashboard: dashboard(f, items),
          events: items.slice(0, 100).map(safe),
          eventLimit: 100,
          eventsTruncated: items.length > 100,
        };
        store.snapshots[id] = s;
        await persist();
        return send(res, 201, s);
      }
      const match = path.match(/^\/api\/snapshots\/([^/]+)(?:\/(image|analysis))?$/);
      if (match) {
        const [, id, action] = match,
          s = store.snapshots[id];
        if (!s) throw { status: 404, code: 'NOT_FOUND' };
        if (!action && method === 'GET') return send(res, 200, s);
        if (action === 'image' && method === 'PUT') {
          stats.imagePuts++;
          if (controls.failUpload) throw { status: 503, code: 'STORAGE_UNAVAILABLE' };
          const png = await body(req);
          if (
            req.headers['content-type'] !== 'image/png' ||
            png.length < 33 ||
            png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
          )
            throw { status: 422, code: 'INVALID_IMAGE' };
          const width = png.readUInt32BE(16),
            height = png.readUInt32BE(20);
          if (!width || !height || width > 4096 || height > 4096)
            throw { status: 413, code: 'IMAGE_TOO_LARGE' };
          // Inflate IDAT in the local harness; production decoder validation belongs to the AI module.
          let offset = 8;
          const idats = [];
          while (offset + 12 <= png.length) {
            const length = png.readUInt32BE(offset);
            if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
              idats.push(png.subarray(offset + 8, offset + 8 + length));
            offset += length + 12;
          }
          inflateSync(Buffer.concat(idats), { maxOutputLength: 80 * 1024 * 1024 });
          const sha = createHash('sha256').update(png).digest('hex'),
            previous = store.images[id];
          if (previous && previous !== sha) throw { status: 409, code: 'IMAGE_CONFLICT' };
          store.images[id] = sha;
          await writeFile(`${dir}/${id}.png`, png);
          await persist();
          return send(res, previous ? 200 : 201, { snapshotId: id, imageSha256: sha });
        }
        if (action === 'analysis' && method === 'GET') {
          if (!store.analyses[id]) throw { status: 404, code: 'NOT_FOUND' };
          return send(res, 200, store.analyses[id]);
        }
        if (action === 'analysis' && method === 'POST') {
          stats.analysisPosts++;
          if (!store.images[id]) throw { status: 409, code: 'IMAGE_REQUIRED' };
          if (store.analyses[id]) return send(res, 200, store.analyses[id]);
          if (controls.ai !== 'success')
            throw {
              status:
                controls.ai === 'AI_NOT_CONFIGURED'
                  ? 503
                  : controls.ai === 'AI_TIMEOUT'
                    ? 504
                    : 502,
              code: controls.ai,
            };
          const a = {
            analysisId: randomUUID(),
            snapshotId: id,
            createdAt: new Date().toISOString(),
            model: 'mock-no-model-called',
            instructionVersion: 'mock-v1',
            result: {
              facts: [`mock 스냅샷의 예시 이벤트는 ${s.dashboard.total}건입니다.`],
              hypotheses: ['예시 문구입니다. 실제 모델의 추론이 아닙니다.'],
              checks: ['실제 SaaS 모듈과 모델을 연결한 뒤 별도 검증하세요.'],
              limitations: [
                '독립 UI harness의 고정 응답이며 실제 수집·공격·차단·모델 분석을 검증하지 않았습니다.',
              ],
            },
          };
          store.analyses[id] = a;
          await persist();
          return send(res, 201, a);
        }
      }
      throw { status: 404, code: 'NOT_FOUND' };
    } catch (error) {
      send(res, error.status || 500, {
        error: { code: error.code || 'MOCK_ERROR', message: '독립 mock 오류' },
      });
    }
  })
  .listen(18004, '127.0.0.1', () =>
    console.log(
      'UI-only sample mock: http://127.0.0.1:18004; no SaaS or model integration. Data: frontend/.local/mock',
    ),
  );
