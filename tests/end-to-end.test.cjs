const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCanonicalIntervals,
  deduplicateObservations,
  normalizeObservations,
  parseMonitoringCsv,
  summarizeIntervals,
} = require('../dist');

test('end-to-end: CSV -> normalize -> deduplicate -> canonical intervals -> summary', () => {
  const csv = [
    'service_id,service_name,timestamp,status_code,latency,latency_unit,agent,region',
    'svc-auth,auth-api,1746057600,200,100,ms,agent-1,ap-south-1',
    'svc-auth,auth-api,1746057600,200,100,ms,agent-1,ap-south-1', // exact duplicate
    'svc-auth,auth-api,2025-05-01T00:15:00Z,503,,ms,agent-1,ap-south-1',
    'svc-auth,auth-api,2025-05-01T00:30:00Z,999,0.2,s,agent-1,ap-south-1',
    'svc-auth,auth-api,2025-05-01T00:30:00Z,200,0.4,s,agent-2,ap-south-1',
  ].join('\n');

  const parsed = parseMonitoringCsv(csv);
  const normalized = normalizeObservations(parsed.rows);
  const deduped = deduplicateObservations(normalized);
  const built = buildCanonicalIntervals(deduped);
  const summary = summarizeIntervals(built.intervals);

  assert.equal(parsed.rows.length, 5);
  assert.equal(deduped.length, 4);
  assert.equal(built.window.slotsPerService, 3);
  assert.deepEqual(
    built.intervals.map((interval) => interval.state),
    ['healthy', 'down', 'healthy'],
  );
  assert.equal(summary.expectedIntervals, 3);
  assert.equal(summary.resolvedIntervals, 3);
  assert.equal(summary.downIntervals, 1);
  assert.equal(summary.availabilityPercent, (2 / 3) * 100);
  assert.equal(summary.coveragePercent, 100);

  const first = built.intervals[0];
  assert.equal(first.rawObservationCount, 2);
  assert.equal(first.observationCount, 1);

  const third = built.intervals[2];
  assert.equal(third.validHealthObservationCount, 1);
  assert.equal(third.representativeLatencyMs, 300);
  assert.equal(
    third.issues.some((issue) => issue.code === 'INVALID_HTTP_STATUS'),
    true,
  );
});
