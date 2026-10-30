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
let controls = { failRead: false, delayMs: 0, ai: 'success', failUpload: false };
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
  process: {
    execId: `sample-${i}`,
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
      ['from', 'to', 'instanceId', 'eventType', 'status', 'source'].includes(k),
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
    (f.source && !['live', 'sample'].includes(f.source))
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
      if (path === '/__mock/reset' && method === 'POST') {
        store = {
          events: Array.from({ length: 137 }, (_, i) => event(i)),
          snapshots: {},
          images: {},
          analyses: {},
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
        ['/api/instances', '/api/events', '/api/dashboard'].includes(path)
      )
        throw { status: 503, code: 'STORAGE_UNAVAILABLE' };
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
        stats.snapshotPosts++;
        const f = filters(json(await body(req))),
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
