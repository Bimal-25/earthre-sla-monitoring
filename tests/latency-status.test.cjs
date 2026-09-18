const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLatency, normalizeStatus } = require('../dist');

test('keeps millisecond latency', () => {
  assert.deepEqual(normalizeLatency('486', 'ms'), {
    latencyMs: 486,
    issues: [],
  });
});

test('converts seconds to milliseconds', () => {
  assert.deepEqual(normalizeLatency('0.486', 's'), {
    latencyMs: 486,
    issues: [],
  });
});

test('retains status usability when latency is missing', () => {
  const result = normalizeLatency('', 'ms');
  assert.equal(result.latencyMs, null);
  assert.equal(result.issues[0].code, 'MISSING_LATENCY');
});

test('rejects negative latency', () => {
  const result = normalizeLatency('-12', 'ms');
  assert.equal(result.latencyMs, null);
  assert.equal(result.issues[0].code, 'NEGATIVE_LATENCY');
});

test('rejects non-numeric latency', () => {
  const result = normalizeLatency('fast', 'ms');
  assert.equal(result.latencyMs, null);
  assert.equal(result.issues[0].code, 'INVALID_LATENCY');
});

test('rejects unsupported latency units', () => {
  const result = normalizeLatency('12', 'microseconds');
  assert.equal(result.latencyMs, null);
  assert.equal(result.issues[0].code, 'UNKNOWN_LATENCY_UNIT');
});

test('classifies 2xx and 3xx as healthy', () => {
  assert.deepEqual(normalizeStatus('200'), {
    statusCode: 200,
    healthState: 'healthy',
    issues: [],
  });
  assert.equal(normalizeStatus('302').healthState, 'healthy');
});

test('classifies 4xx and 5xx as down', () => {
  assert.equal(normalizeStatus('404').healthState, 'down');
  assert.equal(normalizeStatus('503').healthState, 'down');
});

test('retains 1xx as syntactically valid but not a final health result', () => {
  const result = normalizeStatus('102');
  assert.equal(result.statusCode, 102);
  assert.equal(result.healthState, null);
  assert.deepEqual(result.issues, []);
});

test('rejects invalid status 999 from the supplied data pattern', () => {
  const result = normalizeStatus('999');
  assert.equal(result.statusCode, null);
  assert.equal(result.healthState, null);
  assert.equal(result.issues[0].code, 'INVALID_HTTP_STATUS');
});

test('rejects non-decimal JavaScript numeric syntaxes such as hex', () => {
  const result = normalizeLatency('0x10', 'ms');
  assert.equal(result.latencyMs, null);
  assert.equal(result.issues[0].code, 'INVALID_LATENCY');
});
