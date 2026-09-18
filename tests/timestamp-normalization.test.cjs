const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTimestamp } = require('../dist');

test('normalizes supplied ISO timestamps to UTC ISO format', () => {
  const result = normalizeTimestamp('2025-05-01T00:15:00Z');
  assert.equal(result.timestampUtc, '2025-05-01T00:15:00.000Z');
  assert.equal(result.isOnExpectedCadence, true);
  assert.deepEqual(result.issues, []);
});

test('normalizes timezone-offset ISO timestamps to UTC', () => {
  const result = normalizeTimestamp('2025-05-01T05:45:00+05:30');
  assert.equal(result.timestampUtc, '2025-05-01T00:15:00.000Z');
  assert.equal(result.isOnExpectedCadence, true);
});

test('normalizes Unix epoch seconds and records the finding', () => {
  const result = normalizeTimestamp('1746057600'); // 2025-05-01T00:00:00Z
  assert.equal(result.timestampUtc, '2025-05-01T00:00:00.000Z');
  assert.equal(result.issues[0].code, 'UNIX_TIMESTAMP_NORMALIZED');
});

test('normalizes Unix epoch milliseconds defensively', () => {
  const result = normalizeTimestamp('1746057600000');
  assert.equal(result.timestampUtc, '2025-05-01T00:00:00.000Z');
  assert.equal(result.issues[0].code, 'UNIX_MILLISECONDS_TIMESTAMP_NORMALIZED');
});

test('flags a valid timestamp that is off the expected 15-minute cadence', () => {
  const result = normalizeTimestamp('2025-05-01T00:07:00Z');
  assert.equal(result.timestampUtc, '2025-05-01T00:07:00.000Z');
  assert.equal(result.isOnExpectedCadence, false);
  assert.equal(result.issues[0].code, 'OFF_CADENCE_TIMESTAMP');
});

test('rejects timezone-less timestamps to avoid local-time ambiguity', () => {
  const result = normalizeTimestamp('2025-05-01T00:00:00');
  assert.equal(result.timestampUtc, null);
  assert.equal(result.issues[0].code, 'INVALID_TIMESTAMP');
});

test('rejects malformed timestamps', () => {
  const result = normalizeTimestamp('not-a-time');
  assert.equal(result.timestampUtc, null);
  assert.equal(result.isOnExpectedCadence, false);
  assert.equal(result.issues[0].code, 'INVALID_TIMESTAMP');
});

test('rejects impossible ISO calendar dates instead of letting Date normalize them', () => {
  const result = normalizeTimestamp('2025-02-30T00:00:00Z');
  assert.equal(result.timestampUtc, null);
  assert.equal(result.issues[0].code, 'INVALID_TIMESTAMP');
});
