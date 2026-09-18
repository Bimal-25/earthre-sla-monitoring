const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deduplicateObservations,
  normalizeObservation,
} = require('../dist');

function parsed(sourceRow, overrides = {}) {
  return {
    sourceRow,
    raw: {
      service_id: 'svc-search',
      service_name: 'search-api',
      timestamp: '2025-05-01T00:00:00Z',
      status_code: '200',
      latency: '0.486',
      latency_unit: 's',
      agent: 'agent-1',
      region: 'ap-south-1',
      ...overrides,
    },
  };
}

test('normalizes one parsed monitoring row while preserving the source', () => {
  const result = normalizeObservation(parsed(7));

  assert.equal(result.sourceRow, 7);
  assert.deepEqual(result.sourceRows, [7]);
  assert.equal(result.serviceId, 'svc-search');
  assert.equal(result.timestampUtc, '2025-05-01T00:00:00.000Z');
  assert.equal(result.statusCode, 200);
  assert.equal(result.healthState, 'healthy');
  assert.equal(result.latencyMs, 486);
  assert.match(result.intervalKey, /^svc-search\u0000/);
  assert.equal(result.raw.latency, '0.486');
});

test('flags required string values that are blank', () => {
  const result = normalizeObservation(
    parsed(3, { service_id: ' ', service_name: '', agent: '', region: '' }),
  );
  const missing = result.issues.filter((issue) => issue.code === 'MISSING_REQUIRED_FIELD');

  assert.equal(missing.length, 4);
  assert.equal(result.intervalKey, null);
});

test('collapses exact repeated source rows and preserves source-row provenance', () => {
  const observations = [
    normalizeObservation(parsed(2)),
    normalizeObservation(parsed(19)),
  ];

  const deduped = deduplicateObservations(observations);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].duplicateCount, 2);
  assert.deepEqual(deduped[0].sourceRows, [2, 19]);
  assert.equal(
    deduped[0].issues.some((issue) => issue.code === 'EXACT_DUPLICATE'),
    true,
  );
});

test('does not collapse legitimate observations from different agents', () => {
  const observations = [
    normalizeObservation(parsed(2)),
    normalizeObservation(parsed(3, { agent: 'agent-2' })),
  ];

  const deduped = deduplicateObservations(observations);
  assert.equal(deduped.length, 2);
});

test('does not hide different raw timestamp representations as exact duplicates', () => {
  const observations = [
    normalizeObservation(parsed(2, { timestamp: '2025-05-01T00:00:00Z' })),
    normalizeObservation(parsed(3, { timestamp: '1746057600' })),
  ];

  assert.equal(observations[0].timestampUtc, observations[1].timestampUtc);
  const deduped = deduplicateObservations(observations);
  assert.equal(deduped.length, 2);
});
