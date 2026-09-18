const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCanonicalIntervals,
  deduplicateObservations,
  normalizeObservation,
  summarizeIntervals,
  IntervalBuildError,
} = require('../dist');

function obs(sourceRow, overrides = {}) {
  return normalizeObservation({
    sourceRow,
    raw: {
      service_id: 'svc-auth',
      service_name: 'auth-api',
      timestamp: '2025-05-01T00:00:00Z',
      status_code: '200',
      latency: '100',
      latency_unit: 'ms',
      agent: 'agent-1',
      region: 'ap-south-1',
      ...overrides,
    },
  });
}

test('generates expected 15-minute slots across the global observed window for every service', () => {
  const observations = [
    obs(2, { timestamp: '2025-05-01T00:00:00Z' }),
    obs(3, { timestamp: '2025-05-01T00:30:00Z' }),
    obs(4, {
      service_id: 'svc-payments',
      service_name: 'payments-api',
      timestamp: '2025-05-01T00:00:00Z',
    }),
    obs(5, {
      service_id: 'svc-payments',
      service_name: 'payments-api',
      timestamp: '2025-05-01T00:30:00Z',
    }),
  ];

  const result = buildCanonicalIntervals(observations);
  assert.equal(result.services.length, 2);
  assert.equal(result.window.slotsPerService, 3);
  assert.equal(result.intervals.length, 6);

  const auth0015 = result.intervals.find(
    (interval) =>
      interval.serviceId === 'svc-auth' &&
      interval.timestampUtc === '2025-05-01T00:15:00.000Z',
  );
  assert.equal(auth0015.state, 'unknown');
  assert.equal(auth0015.observationCount, 0);
});

test('valid plus invalid agent observation resolves from the valid health evidence', () => {
  const observations = [
    obs(2, { status_code: '999', agent: 'agent-1', latency: '300' }),
    obs(3, { status_code: '200', agent: 'agent-2', latency: '500' }),
  ];

  const result = buildCanonicalIntervals(observations);
  const interval = result.intervals[0];

  assert.equal(interval.state, 'healthy');
  assert.equal(interval.observationCount, 2);
  assert.equal(interval.validHealthObservationCount, 1);
  assert.equal(interval.representativeLatencyMs, 400);
  assert.equal(
    interval.issues.some((issue) => issue.code === 'INVALID_HTTP_STATUS'),
    true,
  );
});

test('conflicting valid agents produce conflicted rather than inventing a winner', () => {
  const result = buildCanonicalIntervals([
    obs(2, { status_code: '200', agent: 'agent-1' }),
    obs(3, { status_code: '503', agent: 'agent-2' }),
  ]);

  assert.equal(result.intervals[0].state, 'conflicted');
});

test('multiple agreeing agents still count as one canonical interval', () => {
  const result = buildCanonicalIntervals([
    obs(2, { status_code: '200', agent: 'agent-1' }),
    obs(3, { status_code: '200', agent: 'agent-2' }),
  ]);
  const summary = summarizeIntervals(result.intervals);

  assert.equal(result.intervals.length, 1);
  assert.equal(result.intervals[0].observationCount, 2);
  assert.equal(summary.expectedIntervals, 1);
  assert.equal(summary.healthyIntervals, 1);
  assert.equal(summary.availabilityPercent, 100);
});

test('exact duplicates do not increase deduplicated observation count but retain raw count', () => {
  const deduped = deduplicateObservations([obs(2), obs(3)]);
  const result = buildCanonicalIntervals(deduped);

  assert.equal(result.intervals[0].observationCount, 1);
  assert.equal(result.intervals[0].rawObservationCount, 2);
  assert.deepEqual(result.intervals[0].sourceRows, [2, 3]);
});

test('uses median normalized latency as the representative interval latency', () => {
  const result = buildCanonicalIntervals([
    obs(2, { agent: 'agent-1', latency: '100', latency_unit: 'ms' }),
    obs(3, { agent: 'agent-2', latency: '0.300', latency_unit: 's' }),
    obs(4, { agent: 'agent-3', latency: '900', latency_unit: 'ms' }),
  ]);

  assert.equal(result.intervals[0].representativeLatencyMs, 300);
});

test('off-cadence observations remain auditable but are not assigned to an SLA interval', () => {
  const result = buildCanonicalIntervals([
    obs(2, { timestamp: '2025-05-01T00:07:00Z' }),
    obs(3, { timestamp: '2025-05-01T00:15:00Z' }),
  ]);

  assert.equal(result.unassignedObservations.length, 1);
  assert.equal(result.window.startUtc, '2025-05-01T00:15:00.000Z');
  assert.equal(result.intervals.length, 1);
});

test('summarizes availability separately from monitoring coverage', () => {
  const result = buildCanonicalIntervals([
    obs(2, { timestamp: '2025-05-01T00:00:00Z', status_code: '200' }),
    obs(3, { timestamp: '2025-05-01T00:15:00Z', status_code: '503' }),
    // 00:30 is established by another service, so auth is missing there.
    obs(4, {
      service_id: 'svc-payments',
      service_name: 'payments-api',
      timestamp: '2025-05-01T00:30:00Z',
      status_code: '200',
    }),
  ]);

  const auth = result.intervals.filter((i) => i.serviceId === 'svc-auth');
  const summary = summarizeIntervals(auth);

  assert.equal(summary.expectedIntervals, 3);
  assert.equal(summary.healthyIntervals, 1);
  assert.equal(summary.downIntervals, 1);
  assert.equal(summary.unknownIntervals, 1);
  assert.equal(summary.resolvedIntervals, 2);
  assert.equal(summary.availabilityPercent, 50);
  assert.equal(summary.coveragePercent, (2 / 3) * 100);
  assert.equal(summary.detectedDowntimeMinutes, 15);
});

test('returns null availability when no intervals have a resolved health state', () => {
  const result = buildCanonicalIntervals([
    obs(2, { status_code: '999' }),
  ]);
  const summary = summarizeIntervals(result.intervals);

  assert.equal(summary.availabilityPercent, null);
  assert.equal(summary.coveragePercent, 0);
  assert.equal(summary.unknownIntervals, 1);
});

test('protects against unexpectedly huge generated interval ranges', () => {
  const observations = [
    obs(2, { timestamp: '2025-01-01T00:00:00Z' }),
    obs(3, { timestamp: '2025-01-02T00:00:00Z' }),
  ];

  assert.throws(
    () => buildCanonicalIntervals(observations, { maxGeneratedIntervals: 10 }),
    (error) => error instanceof IntervalBuildError,
  );
});
