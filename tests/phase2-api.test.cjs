const test = require('node:test');
const assert = require('node:assert/strict');

const { InMemoryUploadRepository } = require('../dist');
const { createApiHandler } = require('../dist/api/handler');
const { loadConfigFromEnv } = require('../dist/config');

function silentLogger() {
  return { info() {}, error() {} };
}

function createResponse() {
  const headers = new Map();
  const state = { statusCode: 200, body: undefined, headers, ended: false };
  const response = {
    status(code) {
      state.statusCode = code;
      return response;
    },
    json(body) {
      state.body = body;
      state.ended = true;
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), String(value));
    },
    end(body) {
      state.body = body === undefined ? undefined : JSON.parse(body);
      state.ended = true;
    },
  };
  return { response, state };
}

async function invoke(handler, { method = 'GET', url = '/', headers = {}, body } = {}) {
  const { response, state } = createResponse();
  const request = {
    method,
    url,
    headers,
    ...(body === undefined ? {} : { rawBody: body }),
  };
  await handler(request, response);
  return state;
}

const CSV = new TextEncoder().encode([
  'service_id,service_name,timestamp,status_code,latency,latency_unit,agent,region',
  'svc-a,alpha,2025-05-08T00:00:00Z,200,100,ms,a1,r1',
  'svc-a,alpha,2025-05-08T00:15:00Z,503,200,ms,a1,r1',
].join('\n'));

test('HTTP handler exposes health, upload, metadata, summary and logs endpoints', async () => {
  const repository = new InMemoryUploadRepository();
  const handler = createApiHandler({
    repository,
    config: loadConfigFromEnv({}),
    logger: silentLogger(),
  });

  const health = await invoke(handler, { url: '/v1/health' });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.body, { status: 'ok', version: '0.2.0' });

  const upload = await invoke(handler, {
    method: 'POST',
    url: '/v1/uploads',
    headers: {
      'content-type': 'text/csv',
      'x-file-name': 'checks.csv',
      origin: 'http://localhost:5173',
    },
    body: CSV,
  });
  assert.equal(upload.statusCode, 201);
  assert.equal(upload.body.alreadyProcessed, false);
  assert.equal(upload.headers.get('access-control-allow-origin'), 'http://localhost:5173');

  const uploadId = upload.body.upload.uploadId;
  const metadata = await invoke(handler, { url: `/v1/uploads/${uploadId}` });
  assert.equal(metadata.statusCode, 200);
  assert.equal(metadata.body.upload.counts.sourceRows, 2);

  const summary = await invoke(handler, {
    url: `/v1/uploads/${uploadId}/summary?from=2025-05-08`,
  });
  assert.equal(summary.statusCode, 200);
  assert.equal(summary.body.overall.expectedIntervals, 2);

  const logs = await invoke(handler, {
    url: `/v1/uploads/${uploadId}/logs?from=2025-05-08&pageSize=1`,
  });
  assert.equal(logs.statusCode, 200);
  assert.equal(logs.body.items.length, 1);
  assert.equal(logs.body.hasMore, true);

  const repeat = await invoke(handler, {
    method: 'POST',
    url: '/v1/uploads',
    headers: { 'content-type': 'text/csv', 'x-file-name': 'again.csv' },
    body: CSV,
  });
  assert.equal(repeat.statusCode, 200);
  assert.equal(repeat.body.alreadyProcessed, true);
});

test('HTTP handler returns stable JSON errors for invalid media type and query input', async () => {
  const repository = new InMemoryUploadRepository();
  const handler = createApiHandler({
    repository,
    config: loadConfigFromEnv({}),
    logger: silentLogger(),
  });

  const badType = await invoke(handler, {
    method: 'POST',
    url: '/v1/uploads',
    headers: { 'content-type': 'application/json', 'x-file-name': 'checks.csv' },
    body: CSV,
  });
  assert.equal(badType.statusCode, 415);
  assert.equal(badType.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  assert.ok(badType.body.error.requestId);

  const badId = await invoke(handler, { url: '/v1/uploads/not-a-hash' });
  assert.equal(badId.statusCode, 400);
  assert.equal(badId.body.error.code, 'INVALID_UPLOAD_ID');
});

test('HTTP handler enforces byte limit before processing upload', async () => {
  const repository = new InMemoryUploadRepository();
  const config = loadConfigFromEnv({ MAX_UPLOAD_BYTES: '10' });
  const handler = createApiHandler({ repository, config, logger: silentLogger() });

  const response = await invoke(handler, {
    method: 'POST',
    url: '/v1/uploads',
    headers: { 'content-type': 'text/csv', 'x-file-name': 'checks.csv' },
    body: CSV,
  });

  assert.equal(response.statusCode, 413);
  assert.equal(response.body.error.code, 'FILE_TOO_LARGE');
});
